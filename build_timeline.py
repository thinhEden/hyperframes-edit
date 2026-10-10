"""Rebuild the film's timeline from SCRIPT.json + raw narration (assets/audio/raw).
Writes: assets/audio/voice-dry.wav, narration.wav, score.wav, TIMINGS.json, SCENES.json, CUES.json,
CAPTIONS.json, subtitles.srt, compositions/captions.html, and index.html (hosts, audio, root duration).
Scene compositions themselves are written by build_scenes.py."""
import argparse, json, pathlib, re, subprocess, html, unicodedata
import numpy as np
from scipy.io import wavfile

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'assets/audio'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--provider', choices=['edge', 'google-cloud'])
parser.add_argument('--voice', help='Override the Google voice in NARRATION.json')
args = parser.parse_args()
config_path = ROOT / 'NARRATION.json'
config = json.loads(config_path.read_text(encoding='utf-8')) if config_path.exists() else {'provider': 'edge'}
brand = json.loads((ROOT / 'BRAND.json').read_text(encoding='utf-8'))
provider = args.provider or config['provider']
if provider == 'google-cloud':
    from google_tts import settings, cache_dir, cache_key
    config = settings(args.voice)
    RAW = cache_dir(config)
else:
    if args.voice:
        parser.error('--voice only applies to Google Cloud TTS.')
    RAW = ROOT / 'assets/audio/raw'
SR = 48000
lines = json.loads((ROOT / 'SCRIPT.json').read_text(encoding='utf-8'))['lines']
metas = {l['id']: json.loads((RAW / (l['id'] + '.json')).read_text(encoding='utf-8')) for l in lines}
for line in lines:
    meta = metas[line['id']]
    if meta.get('text') != line['text'] or not meta.get('words'):
        raise RuntimeError(f'Stale or missing narration timing: {line["id"]}. Regenerate it before rebuilding.')
    if provider == 'google-cloud' and meta.get('cache_key') != cache_key(line, config):
        raise RuntimeError(f'Stale Google narration: {line["id"]}. Run python google_tts.py --all first.')
    filename = meta.get('audio_file', line['id'] + '.mp3')
    if pathlib.Path(filename).name != filename or not (RAW / filename).is_file():
        raise RuntimeError(f'Missing narration file: {line["id"]}')

# delivery: the opening is told slower; the body keeps the approved pace
RATE = {'p01': 1.12, 'p02': 1.15, 'p03': 1.16, 'p04': 1.16}
RATE_DEFAULT = 1.20
GAP = 0.26; SECTION_GAP = 0.58
GAP_AFTER = {'p01': 0.70, 'p04': 0.62, 'p08': 0.62}
INITIAL = 0.40; TAIL = 3.2
XFADE = 0.55  # scene crossfade overlap

# ---------------- narration ----------------
timed, chunks, cursor = [], [np.zeros(int(INITIAL * SR), np.int16)], INITIAL
for i, ln in enumerate(lines):
    m = metas[ln['id']]; rate = 1.0 if provider == 'google-cloud' else RATE.get(ln['id'], RATE_DEFAULT)
    tmp = OUT / (ln['id'] + '.wav')
    source = RAW / m.get('audio_file', ln['id'] + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-af', f'atempo={rate:.6f},aresample={SR}', '-ac', '1', str(tmp)], check=True)
    sr, data = wavfile.read(tmp)
    d = len(data) / SR
    words = [{**w, 'start': w['start'] / rate, 'end': w['end'] / rate} for w in m['words']]
    timed.append({**ln, 'start': cursor, 'end': cursor + d, 'duration': d, 'rate': rate, 'words': words})
    chunks.append(data); cursor += d
    if i < len(lines) - 1:
        gap = GAP_AFTER.get(ln['id'], SECTION_GAP if lines[i + 1]['section'] != ln['section'] else GAP)
        chunks.append(np.zeros(int(gap * SR), np.int16)); cursor += gap
STORY_END = round(cursor + 2.4, 3)
OUTRO_START = round(STORY_END - XFADE, 3)
TOTAL = round(OUTRO_START + brand['outro_seconds'], 3)
voice = np.concatenate(chunks); voice = np.pad(voice, (0, int(TOTAL * SR) - len(voice)))
wavfile.write(OUT / 'voice-dry.wav', SR, voice)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(OUT / 'voice-dry.wav'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', str(SR), '-ac', '1', str(OUT / 'narration.wav')], check=True)
(ROOT / 'TIMINGS.json').write_text(json.dumps({'duration': TOTAL, 'narration': {
    'provider': provider, 'voice': config['voice'] if provider == 'google-cloud' else 'vi-VN-NamMinhNeural'
}, 'paragraphs': timed}, ensure_ascii=False, indent=2), encoding='utf-8')
by_id = {p['id']: p for p in timed}


def time_for_char(p, char):
    ev = p['words']
    for e in ev:
        if e['char_start'] <= char < e['char_end'] or (e['char_start'] == char):
            span = max(1, e['char_end'] - e['char_start'])
            return p['start'] + e['start'] + (e['end'] - e['start']) * (char - e['char_start']) / span
    before = [e for e in ev if e['char_end'] <= char]; after = [e for e in ev if e['char_start'] >= char]
    if before and after: return p['start'] + (before[-1]['end'] + after[0]['start']) / 2
    if before: return p['start'] + before[-1]['end']
    if after: return p['start'] + after[0]['start']
    return p['start'] + p['duration'] * char / max(1, len(p['text']))


def cue(pid, phrase, nth=0):
    p = by_id[pid]; idx = -1
    for _ in range(nth + 1):
        idx = p['text'].find(phrase, idx + 1)
    if idx < 0: raise KeyError(f'{pid}: {phrase}')
    return time_for_char(p, idx)

# ---------------- scenes ----------------
SPECS = [
    ('s01', 'betelgeuse', ['p01'], None), ('s02', 'collapse', ['p02', 'p03'], None), ('s03', 'arrival', ['p04'], None),
    ('s04', 'identity', ['p05', 'p06'], None), ('s05', 'body', ['p07', 'p08'], None), ('s06', 'meaning', ['p09', 'p10'], None),
    ('s07', 'volume', ['p11'], None), ('s08', 'water', ['p12'], None),
    ('s09', 'detectors', ['p13'], ['sk-pmt-exhibit.jpg', 'sk-pmt-detail.jpg', 'km3-deepsea.png', 'km3-optical-module.png']),
    ('s10', 'background', ['p14', 'p15'], None), ('s11', 'natural', ['p16'], ['drill-site.jpg']),
    ('s12', 'halzen', ['p17'], ['halzen-press.jpg']), ('s13', 'array', ['p18'], None),
    ('s14', 'drilling', ['p19'], ['drill-head.png', 'deployment.png']), ('s15', 'sensor', ['p20'], None),
    ('s16', 'cherenkov', ['p21'], None), ('s17', 'timing', ['p22'], None), ('s18', 'evidence', ['p23', 'p24'], None),
    ('s19', 'search', ['p25'], None), ('s20', 'alert', ['p26', 'p27'], None), ('s21', 'blazar', ['p28', 'p29'], None),
    ('s22', 'research', ['p30'], ['dom-install.png', 'engineer.png']), ('s23', 'nobel', ['p31'], ['team.jpg', 'nobel-2026-halzen.webp']),
    ('s24', 'ending', ['p32', 'p33'], ['icecube-lab.jpg'])]
starts = [0.0] + [by_id[s[2][0]]['start'] - 0.18 for s in SPECS[1:]]
scenes = []
for i, (sid, kind, ids, photos) in enumerate(SPECS):
    start = starts[i]
    end = STORY_END if i == len(SPECS) - 1 else starts[i + 1] + XFADE
    scenes.append({'id': sid, 'kind': kind, 'start': round(start, 5), 'duration': round(end - start, 5), 'paragraphs': ids, 'photos': photos,
                   'xfade_in': 0 if i == 0 else XFADE})
scenes.append({'id': 'logo-outro', 'kind': 'outro', 'start': OUTRO_START,
               'duration': float(brand['outro_seconds']), 'paragraphs': [],
               'photos': ['channel-logo.png'], 'xfade_in': XFADE})
(ROOT / 'SCENES.json').write_text(json.dumps(scenes, ensure_ascii=False, indent=2), encoding='utf-8')
S = {s['id']: s for s in scenes}

# word cues (scene-local seconds) the scene builders sync to
CUE_SPEC = {
    's01': {'name': ('p01', 'Betelgeuse'), 'orion': ('p01', 'gã thợ săn'), 'naked': ('p01', 'bằng mắt thường'), 'sun': ('p01', 'Nếu đặt nó'),
            'earthorbit': ('p01', 'quỹ đạo của Trái Đất'), 'mars': ('p01', 'sao Hỏa'), 'quiet': ('p01', 'Những ngôi sao lớn'),
            'blast': ('p01', 'nổ dữ dội'), 'when': ('p01', 'Khi Betelgeuse'), 'light': ('p01', 'ánh sáng của nó'),
            'earth': ('p01', 'tới Trái Đất'), 'flare': ('p01', 'bừng lên'), 'moon': ('p01', 'Mặt Trăng'), 'day': ('p01', 'cả ban ngày')},
    's02': {'know': ('p02', 'biết'), 'core': ('p03', 'Khi lõi'), 'collapse': ('p03', 'sụp đổ'), 'release': ('p03', 'giải phóng'),
            'through': ('p03', 'xuyên qua'), 'escape': ('p03', 'thoát ra'), 'light': ('p03', 'Còn ánh sáng'), 'shock': ('p03', 'sóng xung kích'),
            'surface': ('p03', 'bề mặt')},
    's03': {'stream': ('p04', 'dòng hạt'), 'first': ('p04', 'đầu tiên'), 'see': ('p04', 'nhìn thấy')},
    's04': {'name': ('p05', 'neutrino'), 'basic': ('p06', 'hạt cơ bản'), 'charge': ('p06', 'không mang điện'), 'mass': ('p06', 'khối lượng'),
            'rarely': ('p06', 'hiếm khi'), 'through': ('p06', 'đi xuyên qua')},
    's05': {'now': ('p07', 'Ngay lúc này'), 'sun': ('p07', 'Mặt Trời'), 'body': ('p07', 'cơ thể bạn'), 'feel': ('p07', 'Bạn chẳng'),
            'journey': ('p07', 'hành trình'), 'ghost': ('p08', 'hạt ma')},
    's06': {'info': ('p09', 'mang thông tin'), 'sun': ('p10', 'Mặt Trời'), 'core': ('p10', 'lõi nó'), 'cosmic': ('p10', 'Với các neutrino'),
            'direction': ('p10', 'hướng đến'), 'sources': ('p10', 'những nơi')},
    's07': {'clues': ('p11', 'manh mối'), 'interact': ('p11', 'tương tác')},
    's08': {'water': ('p12', 'lượng nước'), 'sensors': ('p12', 'cảm biến ánh sáng'), 'interact': ('p12', 'Khi neutrino'),
            'glow': ('p12', 'phát ánh sáng'), 'record': ('p12', 'Các cảm biến ghi lại'), 'rebuild': ('p12', 'tái dựng')},
    's09': {'japan': ('p13', 'Ở Nhật Bản'), 'tank': ('p13', 'bể chứa'), 'med': ('p13', 'Còn tại'), 'sea': ('p13', 'nước biển sâu'), 'arca': ('p13', 'mạng ARCA')},
    's10': {'volume': ('p14', 'thể tích'), 'signal': ('p15', 'Có tín hiệu'), 'atmos': ('p15', 'khí quyển'), 'noise': ('p15', 'gây nhiễu'), 'sea': ('p15', 'Máy dò dưới biển')},
    's11': {'nature': ('p16', 'tự nhiên'), 'sea': ('p16', 'dưới biển'), 'ice': ('p16', 'lớp băng sâu')},
    's12': {'halzen': ('p17', 'Francis Halzen'), 'insight': ('p17', 'Ông nhận ra'), 'ice': ('p17', 'lớp băng sâu')},
    's13': {'down': ('p18', 'Nếu đưa'), 'ice': ('p18', 'chính lớp băng'), 'born': ('p18', 'IceCube ra đời')},
    's14': {'drill': ('p19', 'khoan'), 'strings': ('p19', 'Họ thả')},
    's15': {'count': ('p20', 'năm nghìn'), 'km': ('p20', 'một kilômét khối')},
    's16': {'record': ('p21', 'IceCube ghi nhận'), 'slow': ('p21', 'Trong băng'), 'faster': ('p21', 'vượt qua'), 'cherenkov': ('p21', 'Cherenkov')},
    's17': {'time': ('p22', 'Thời điểm'), 'energy': ('p22', 'năng lượng'), 'direction': ('p22', 'tái dựng hướng')},
    's18': {'search': ('p23', 'tìm các sự kiện'), 'y2013': ('p24', 'Năm 2013'), 'n28': ('p24', 'hai mươi tám'), 'together': ('p24', 'Xét chúng'),
            'evidence': ('p24', 'bằng chứng'), 'atmos': ('p24', 'tín hiệu nền')},
    's19': {'open': ('p25', 'mở đường'), 'next': ('p25', 'Bước tiếp theo'), 'source': ('p25', 'nguồn phát cụ thể')},
    's20': {'y2017': ('p26', 'năm 2017'), 'event': ('p26', 'ghi nhận'), 'alert': ('p26', 'cảnh báo'), 'direction': ('p27', 'Dựa vào hướng'),
            'telescopes': ('p27', 'các kính thiên văn'), 'blazar': ('p27', 'blazar'), 'hole': ('p27', 'lỗ đen'), 'jets': ('p27', 'luồng vật chất')},
    's21': {'combine': ('p28', 'Kết hợp'), 'y2018': ('p28', 'năm 2018'), 'link': ('p28', 'liên hệ'), 'trace': ('p29', 'Dấu vết dưới băng'), 'far': ('p29', 'rất xa')},
    's22': {'data': ('p30', 'phân tích dữ liệu'), 'ice': ('p30', 'ánh sáng đã truyền')},
    's23': {'nobel': ('p31', 'Những đóng góp'), 'prize': ('p31', 'Nobel Vật lý')},
    's24': {'antarctic': ('p33', 'Và từ'), 'cosmos': ('p33', 'chúng ta đang học thêm')},
    'logo-outro': {},
}
cues = {}
for sid, spec in CUE_SPEC.items():
    sc = S[sid]; cues[sid] = {k: round(cue(*v) - sc['start'], 4) for k, v in spec.items()}
    for pid in sc['paragraphs']:
        cues[sid]['start_' + pid] = round(by_id[pid]['start'] - sc['start'], 4); cues[sid]['end_' + pid] = round(by_id[pid]['end'] - sc['start'], 4)
(ROOT / 'CUES.json').write_text(json.dumps(cues, ensure_ascii=False, indent=2), encoding='utf-8')

# ---------------- captions: phrase-aware groups ----------------
# Breaks only after punctuation or right before a word that opens a phrase, so compounds like "khổng lồ" stay whole.
STARTERS = {'và', 'còn', 'nhưng', 'khi', 'nên', 'mà', 'để', 'với', 'trong', 'từ', 'tại', 'ở', 'của', 'cho', 'bằng', 'rồi', 'thì', 'là', 'nơi',
            'giúp', 'nhờ', 'cũng', 'đã', 'đang', 'sẽ', 'có', 'các', 'những', 'một', 'trên', 'dưới', 'qua', 'tới', 'đến', 'vào', 'về', 'như',
            'trước', 'sau', 'lẫn', 'cả', 'chúng', 'nó', 'họ', 'ông', 'bởi', 'vì', 'do', 'hay', 'hoặc', 'hai', 'ánh', 'lại', 'không', 'chẳng',
            'được', 'bị', 'hướng', 'xét', 'ước', 'phát', 'tìm', 'dựa', 'nằm', 'đưa', 'thả', 'dùng', 'mang', 'xuyên', 'lan', 'đi', 'gần', 'nhìn'}
MAXC = 64


def norm(w): return re.sub(r'[.,;:!?"“”—()]', '', w).lower()


def caption_text(text):
    """Strip displayed punctuation after phrase grouping and timing are resolved."""
    clean = ''.join(' ' if unicodedata.category(char).startswith('P') else char for char in text)
    return ' '.join(clean.split())


def break_cost(tokens, i):
    """cost of breaking before tokens[i]"""
    prev, nxt = tokens[i - 1].group(), tokens[i].group()
    if re.search(r'[.,;:!?”"]$', prev) or prev == '—': return -200
    if norm(nxt) in STARTERS: return 0
    return 900


def split_clause(tokens):
    total = tokens[-1].end() - tokens[0].start()
    if total <= MAXC: return [tokens]
    n = int(np.ceil(total / MAXC)); target = total / n
    best = None
    def rec(start, k, acc, cost):
        nonlocal best
        if k == 1:
            if tokens[-1].end() - tokens[start].start() > MAXC + 6: return
            c = cost + abs((tokens[-1].end() - tokens[start].start()) - target)
            if best is None or c < best[0]: best = (c, acc + [tokens[start:]])
            return
        for i in range(start + 1, len(tokens)):
            seg = tokens[i - 1].end() - tokens[start].start()
            if seg > MAXC + 6: break
            if seg < 12: continue
            rec(i, k - 1, acc + [tokens[start:i]], cost + break_cost(tokens, i) + abs(seg - target))
    rec(0, n, [], 0)
    if best is None:
        n += 1; target = total / n; rec(0, n, [], 0)
    return best[1] if best else [tokens]


captions = []
for p in timed:
    toks = list(re.finditer(r'\S+', p['text']))
    clauses, cur = [], []
    for t in toks:
        cur.append(t)
        if re.search(r'[.!?;:]["”]?$', t.group()) or (t.group().endswith(',') and cur[-1].end() - cur[0].start() > 34):
            clauses.append(cur); cur = []
    if cur: clauses.append(cur)
    merged = []
    for c in clauses:
        if merged and (c[-1].end() - merged[-1][0].start()) <= MAXC and (merged[-1][-1].end() - merged[-1][0].start()) < 30                 and not re.search(r'[.!?]["”]?$', merged[-1][-1].group()):
            merged[-1] = merged[-1] + c
        else:
            merged.append(c)
    for c in merged:
        for g in split_clause(c):
            cs, ce = g[0].start(), g[-1].end()
            a = time_for_char(p, cs) - 0.03; b = time_for_char(p, ce - 1) + 0.12
            captions.append({'start': round(max(p['start'], a), 4), 'end': round(b, 4), 'text': caption_text(p['text'][cs:ce])})
for i in range(len(captions) - 1):
    nxt = captions[i + 1]['start']
    if nxt - captions[i]['end'] < 0.45: captions[i]['end'] = round(nxt - 0.02, 4)
(ROOT / 'CAPTIONS.json').write_text(json.dumps(captions, ensure_ascii=False, indent=2), encoding='utf-8')


def stamp(s):
    ms = int(round(s * 1000)); return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'
(ROOT / 'subtitles.srt').write_text('\n\n'.join(f'{i + 1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"]}' for i, c in enumerate(captions)) + '\n', encoding='utf-8')

payload = json.dumps(captions, ensure_ascii=False, separators=(',', ':'))
cap_doc = r'''<!doctype html><html lang="vi"><body><template><style>#captions-root{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}#caption-text{position:absolute;left:120px;top:1500px;width:810px;line-height:1.35;font-weight:600;color:#fff;text-align:center;background:transparent;-webkit-text-stroke:1.25px rgba(9,23,38,.9);paint-order:stroke fill;text-shadow:0 2px 5px rgba(9,23,38,.65)}#caption-text span{display:block}</style><div id="captions-root" data-composition-id="captions" data-width="1080" data-height="1920" data-duration="TOTAL"><div id="caption-text"><span id="caption-line1"></span><span id="caption-line2"></span></div></div><script>document.fonts.load('600 53px "Be Vietnam Pro"').then(function(){
const items=PAYLOAD;
const box=document.getElementById('caption-text');const a=document.getElementById('caption-line1'),b=document.getElementById('caption-line2');
const measuring=document.createElement('canvas').getContext('2d');
const starters=new Set(BINDERS);const strip=w=>w.replace(/[.,;:!?"“”—()]/g,'').toLowerCase();
function wrap(text,size){measuring.font=`600 ${size}px "Be Vietnam Pro"`;const words=text.split(/\s+/);if(measuring.measureText(text).width<=785)return [text];
 let best=null;for(let i=1;i<words.length;i++){const l1=words.slice(0,i).join(' '),l2=words.slice(i).join(' ');const w1=measuring.measureText(l1).width,w2=measuring.measureText(l2).width;if(w1>785||w2>785)continue;
 let cost=Math.abs(w1-w2);if(/[.,;:!?”"]$/.test(words[i-1]))cost-=260;else if(!starters.has(strip(words[i])))cost+=900;if(!best||cost<best.cost)best={cost,rows:[l1,l2]}}
 return best?best.rows:null}
for(const item of items){let size=53,rows=wrap(item.text,size);while(!rows&&size>40){size--;rows=wrap(item.text,size)}item.size=size;item.rows=rows||[item.text]}
let last=-2;const state={t:0};
function update(){let found=-1;for(let i=items.length-1;i>=0;i--){if(state.t>=items[i].start){if(state.t<items[i].end)found=i;break}}if(found!==last){last=found;if(found<0){box.style.opacity='0';a.textContent='';b.textContent=''}else{const item=items[found];a.textContent=item.rows[0]||'';b.textContent=item.rows.slice(1).join(' ');box.style.fontSize=item.size+'px';box.style.opacity='1'}}}
const tl=gsap.timeline({paused:true});update();tl.to(state,{t:TOTAL,duration:TOTAL,ease:'none',onUpdate:update},0);window.__timelines['captions']=tl;
});</script></template></body></html>'''
cap_doc = cap_doc.replace('PAYLOAD', payload).replace('TOTAL', f'{TOTAL}').replace('BINDERS', json.dumps(sorted(STARTERS), ensure_ascii=False))
(ROOT / 'compositions/captions.html').write_text(cap_doc, encoding='utf-8')

# ---------------- score: restrained pad, scene cues, blast and arrival accents, ducked under the voice ----------------
sr2 = 24000; t = np.arange(int(TOTAL * sr2), dtype=np.float64) / sr2; bed = np.zeros_like(t)
chords = [[110, 164.814, 220, 261.626], [98, 146.832, 196, 246.942], [87.307, 130.813, 174.614, 220], [110, 164.814, 207.652, 246.942]]
for j in range(int(TOTAL // 30) + 2):
    a = j * 30; b = min(TOTAL, a + 34); env = np.clip((t - a) / 3, 0, 1) * np.clip((b - t) / 3, 0, 1); ch = chords[j % 4]
    for k, f in enumerate(ch): bed += env * (.007 * np.sin(2 * np.pi * f * t + .3 * k) + .002 * np.sin(2 * np.pi * f * 2.004 * t + .7 * k))
for i, s in enumerate(scenes):
    if i == 0: continue
    dt = t - (s['start'] + s['xfade_in'] * 0.5); env = np.where((dt >= 0) & (dt < .5), np.exp(-np.maximum(0, dt) * 12), 0)
    bed += .006 * env * np.sin(2 * np.pi * (480 + 90 * (i % 4)) * dt)
blast = S['s01']['start'] + cues['s01']['blast']
dt = t - blast
rise = np.where((dt > -1.6) & (dt < 0), ((dt + 1.6) / 1.6) ** 3, 0)
rng = np.random.default_rng(7); noise = rng.standard_normal(len(t))
lp = np.convolve(noise, np.ones(48) / 48, mode='same')
bed += .010 * rise * lp + .004 * rise * np.sin(2 * np.pi * (60 + 140 * (dt + 1.6)) * t)
boom = np.where(dt >= 0, np.exp(-np.maximum(dt, 0) * 2.2), 0)
bed += .060 * boom * np.sin(2 * np.pi * (52 - 14 * np.clip(dt, 0, 1)) * dt) + .025 * boom * np.exp(-np.maximum(dt, 0) * 4) * lp * 3
arrive = S['s01']['start'] + cues['s01']['flare']; dt = t - arrive
shimmer = np.where(dt >= 0, np.exp(-np.maximum(dt, 0) * 1.4), 0) * np.clip(dt / 0.05, 0, 1)
for f in (880, 1318.5, 1760): bed += .0035 * shimmer * np.sin(2 * np.pi * f * dt)
bed *= np.clip(t / 1.2, 0, 1) * np.clip((TOTAL - t) / 4, 0, 1)
# duck under the narration (10 ms frames, 120 ms attack, 600 ms release)
hop = SR // 100; v48 = voice.astype(np.float64) / 32768; nfr = len(v48) // hop
rms = np.sqrt(np.mean(v48[:nfr * hop].reshape(nfr, hop) ** 2, axis=1)); active = np.clip(rms / 0.02, 0, 1)
sm = np.zeros(nfr); v = 0.0; a_att = 1 - np.exp(-1 / 12.0); a_rel = 1 - np.exp(-1 / 60.0)
for i in range(nfr):
    v += (active[i] - v) * (a_att if active[i] > v else a_rel); sm[i] = v
duck = np.interp(t, np.arange(nfr) / 100.0, 1 - 0.45 * sm)
accent = np.zeros_like(t)
bed = bed * duck
bed = bed / max(1e-9, np.sqrt(np.mean(bed ** 2))) * 10 ** (-24 / 20)
bed = np.clip(bed, -0.95, 0.95)
wavfile.write(OUT / 'score.wav', sr2, (bed * 32767).astype(np.int16))

# ---------------- index.html ----------------
hosts = ''.join(f'<div class="clip" data-composition-id="{s["id"]}" data-composition-src="compositions/{s["id"]}.html" data-duration="{s["duration"]:.5f}" data-height="1920" '
                f'data-start="{s["start"]:.5f}" data-track-index="1" data-track-kind="graphics" data-width="1080" id="host-{s["id"]}"></div>' for s in scenes)
index = f'''<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"/><meta content="width=1080,height=1920" name="viewport"/><title>Nobel Vật lý 2026 · Cuộc săn hạt ma</title><script src="assets/gsap.min.js"></script><script src="assets/three.min.js"></script><script src="assets/land-data.js"></script><script src="assets/science-film.js"></script><script src="assets/3d/core.js"></script><script src="assets/3d/scenes-opening.js"></script><script src="assets/3d/scenes-neutrino.js"></script><script src="assets/3d/scenes-icecube.js"></script><script src="assets/3d/scenes-sky.js"></script><style>@font-face{{font-family:"Be Vietnam Pro";src:url("assets/fonts/BeVietnamPro-Regular.ttf");font-weight:400}}@font-face{{font-family:"Be Vietnam Pro";src:url("assets/fonts/BeVietnamPro-SemiBold.ttf");font-weight:600}}*{{box-sizing:border-box}}body{{margin:0;background:#0a131b;color:#edf0e9;font-family:"Be Vietnam Pro",sans-serif}}#film{{position:relative;width:100%;height:100%;overflow:hidden;background:#0a131b}}.clip{{position:absolute;inset:0}}.film-shot{{position:absolute;inset:0;overflow:hidden}}.film-canvas{{position:absolute;inset:0;width:100%;height:100%;display:block}}.film-photo{{position:absolute;inset:0;overflow:hidden}}.film-photo img{{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 45%;transform-origin:50% 45%}}.film-vignette{{position:absolute;inset:0;background:radial-gradient(ellipse 88% 72% at 50% 44%,rgba(6,11,16,0) 58%,rgba(6,11,16,.5) 100%);pointer-events:none}}.film-wash{{position:absolute;inset:0;background:radial-gradient(ellipse 90% 75% at 50% 42%,rgba(232,240,242,.95) 0%,rgba(205,222,230,.55) 55%,rgba(184,212,223,.25) 100%);opacity:0;pointer-events:none}}.film-flash{{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(255,251,242,1) 0%,rgba(255,244,226,.7) 38%,rgba(237,240,233,.2) 80%);opacity:0;pointer-events:none}}.film-label{{position:absolute;left:0;right:0;text-align:center;color:#edf0e9;font-weight:600;opacity:0;-webkit-text-stroke:1px rgba(9,23,38,.85);paint-order:stroke fill;text-shadow:0 2px 6px rgba(9,23,38,.7)}}</style></head><body><div data-composition-id="main" data-duration="{TOTAL}" data-height="1920" data-start="0" data-width="1080" id="film">{hosts}<audio data-duration="{TOTAL}" data-start="0" data-track-index="6" data-volume="1" id="narration" src="assets/audio/narration.wav"></audio><audio data-duration="{TOTAL}" data-start="0" data-track-index="7" data-volume="0.65" id="music-bed" src="assets/audio/score.wav"></audio><div class="clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-duration="{TOTAL}" data-height="1920" data-start="0" data-track-index="5" data-track-kind="captions" data-width="1080" id="caption-host"></div><div class="clip" data-composition-id="channel-mark" data-composition-src="compositions/channel-mark.html" data-duration="{OUTRO_START}" data-height="1920" data-start="0" data-track-index="8" data-track-kind="graphics" data-width="1080" id="channel-mark-host"></div></div><script>const mainTimeline=gsap.timeline({{paused:true}});window.__timelines['main']=mainTimeline;</script></body></html>'''
(ROOT / 'index.html').write_text(index, encoding='utf-8')
print(json.dumps({'total': TOTAL, 'scenes': len(scenes), 'captions': len(captions), 'p01': round(by_id['p01']['duration'], 2)}))
