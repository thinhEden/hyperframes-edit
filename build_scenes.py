"""Write every scene composition from SCENES.json + CUES.json.
3D scenes mount a Film3D (F3) scene into a 2D canvas; photo scenes are full-frame archive shots with restrained
camera motion and crossfades; any kind without a 3D build yet falls back to the 2D NobelFilm drawing."""
import json, pathlib, html
from build_branding import outro_document, watermark_document

ROOT = pathlib.Path(__file__).resolve().parent
COM = ROOT / 'compositions'
scenes = json.loads((ROOT / 'SCENES.json').read_text(encoding='utf-8'))
cues = json.loads((ROOT / 'CUES.json').read_text(encoding='utf-8'))

THREE_D = {'betelgeuse', 'collapse', 'arrival', 'identity', 'body', 'meaning', 'volume', 'water', 'background', 'natural',
           'array', 'sensor', 'cherenkov', 'timing', 'evidence', 'search', 'alert', 'blazar'}  # grows as scenes are built
# archive photos laid over a 3D scene: (file, cue, seconds after the cue, object-position)
THREE_PHOTOS = {}
FALLBACK_2D = {'betelgeuse': 'supernova'}

# photo scenes: list of (file, start cue or seconds, object-position, label or None)
PHOTOS = {
    'detectors': [('sk-pmt-exhibit.jpg', 0, '50% 80%', 'Super-Kamiokande · Nhật Bản', 1.24), ('km3-optical-module.png', 'med', '46% 50%', 'KM3NeT · Địa Trung Hải')],
    'natural': [('drill-site.jpg', 'ice', '55% 50%', None)],
    'halzen': [('halzen-gallery.jpg', 0, '68% 40%', None),
               ('halzen-talk.jpg', 'insight', '94% 50%', None)],
    'drilling': [('drill-head.png', 0, '50% 48%', None), ('deployment.png', 'strings', '50% 48%', None)],
    'research': [('icecube-dom-assembly.jpg', 0, '46% 50%', None),
                 ('icecube-servers.jpg', 'data', '60% 50%', None),
                 ('icecube-dom-lowered.jpg', 'ice', '50% 54%', None)],
    'nobel': [('icecube-team-last-dom.jpg', 0, '50% 50%', None), ('nobel-2026-halzen.webp', 'nobel', 'poster', None)],
    'ending': [('icecube-lab-milkyway.jpg', 0, '63% 50%', None),
               ('icecube-lab.jpg', 'antarctic', '58% 50%', None),
               ('cosmos-ngc1300.jpg', 'cosmos', '50% 50%', None)],
}
PHOTO_SCENES = {'detectors', 'halzen', 'drilling', 'research', 'nobel', 'ending'}

STYLE = '''#{sid}-root{{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:transparent}}
#{sid}-root .poster{{position:absolute;inset:0;background:linear-gradient(180deg,#ebeae3 0%,#eceae4 {band}px,#511e21 {band}px,#511e21 100%)}}
#{sid}-root .poster img{{position:absolute;left:0;top:{top}px;width:1080px;height:1080px;object-fit:contain;transform-origin:50% 40%}}
#{sid}-root .photo-label{{position:absolute;left:0;right:0;top:214px;text-align:center;font-size:40px;font-weight:600;color:#edf0e9;opacity:0;
-webkit-text-stroke:1px rgba(9,23,38,.85);paint-order:stroke fill;text-shadow:0 2px 8px rgba(9,23,38,.8)}}'''


def resolve(v, sid, D):
    if isinstance(v, str): return max(0.0, cues[sid][v] - 0.35)
    if isinstance(v, float) and v < 1: return D * v
    return float(v)


def three_scene(s):
    sid, D, kind = s['id'], s['duration'], s['kind']
    cue = json.dumps(cues.get(sid, {}), separators=(',', ':'))
    fade = f"tl.fromTo('#{sid}-shot',{{opacity:0}},{{opacity:1,duration:{s['xfade_in']},ease:'power1.inOut'}},0);" if s['xfade_in'] else ''
    photos, ptw = '', ''
    for j, (f, cu, off, pos) in enumerate(THREE_PHOTOS.get(kind, [])):
        t0 = cues[sid][cu] + off
        photos += f'<div id="{sid}-photo{j}" class="film-photo" style="opacity:0"><img id="{sid}-image{j}" data-layout-allow-overflow src="assets/images/{f}" alt="" style="object-position:{pos};transform-origin:{pos}"></div>'
        ptw += f"tl.fromTo('#{sid}-photo{j}',{{opacity:0}},{{opacity:1,duration:.7,ease:'power2.inOut'}},{t0:.4f});tl.fromTo('#{sid}-image{j}',{{scale:1.03}},{{scale:1.07,duration:{max(0.5, D - t0):.4f},ease:'none'}},{t0:.4f});"
    return f'''<!doctype html><html lang="vi"><body><template><style>{STYLE.format(sid=sid, band=0, top=0)}</style><div id="{sid}-root" data-composition-id="{sid}" data-width="1080" data-height="1920" data-duration="{D:.5f}"><div id="{sid}-shot" class="film-shot"><canvas id="{sid}-canvas" class="film-canvas" data-layout-allow-overflow width="1080" height="1920"></canvas><div class="film-vignette"></div>{photos}</div></div><script>document.fonts.ready.then(function(){{const draw=F3.mount(document.getElementById('{sid}-canvas'),'{kind}',{D:.5f},{cue});const state={{t:0}};const r=()=>draw(state.t);r();const tl=gsap.timeline({{paused:true}});tl.to(state,{{t:{D:.5f},duration:{D:.5f},ease:'none',onUpdate:r}},0);{ptw}{fade}window.__timelines['{sid}']=tl;}});</script></template></body></html>'''


def flat_scene(s):
    sid, D, kind = s['id'], s['duration'], FALLBACK_2D.get(s['kind'], s['kind'])
    fade = f"tl.fromTo('#{sid}-shot',{{opacity:0}},{{opacity:1,duration:{s['xfade_in']},ease:'power1.inOut'}},0);" if s['xfade_in'] else ''
    photo_markup, photo_tweens = '', ''
    if s['kind'] == 'natural':
        f, at, pos, _ = PHOTOS['natural'][0]; t0 = resolve(at, sid, D)
        photo_markup = f'<div id="{sid}-photo0" class="film-photo" style="opacity:0"><img id="{sid}-image0" src="assets/images/{f}" alt="" style="object-position:{pos};transform-origin:{pos}"></div>'
        photo_tweens = f"tl.fromTo('#{sid}-photo0',{{opacity:0}},{{opacity:1,duration:.6,ease:'power2.inOut'}},{t0:.4f});tl.fromTo('#{sid}-image0',{{scale:1.02}},{{scale:1.07,duration:{D:.5f},ease:'none'}},0);"
    return f'''<!doctype html><html lang="vi"><body><template><style>{STYLE.format(sid=sid, band=0, top=0)}</style><div id="{sid}-root" data-composition-id="{sid}" data-width="1080" data-height="1920" data-duration="{D:.5f}"><div id="{sid}-shot" class="film-shot"><canvas id="{sid}-canvas" class="film-canvas" data-layout-allow-overflow width="1080" height="1920"></canvas>{photo_markup}</div></div><script>document.fonts.ready.then(function(){{const tl=gsap.timeline({{paused:true}});const canvas=document.getElementById('{sid}-canvas');const state={{t:0}};const draw=()=>NobelFilm.draw(canvas,state.t,{D:.5f},'{kind}');draw();tl.to(state,{{t:{D:.5f},duration:{D:.5f},ease:'none',onUpdate:draw}},0);{photo_tweens}{fade}window.__timelines['{sid}']=tl;}});</script></template></body></html>'''


def photo_scene(s):
    sid, D, kind = s['id'], s['duration'], s['kind']
    items = PHOTOS[kind]
    starts = [resolve(it[1], sid, D) for it in items]
    band_top, poster_top = 0, 0
    markup, tweens = '', ''
    for j, it in enumerate(items):
        f, at, pos, label = it[:4]; zoom = it[4] if len(it) > 4 else 1.0
        t0 = starts[j]; t1 = starts[j + 1] if j + 1 < len(items) else D
        span = t1 - t0 + 0.8
        if pos == 'poster':
            poster_top = 300; band_top = poster_top + int(1080 * 0.676)
            markup += f'<div id="{sid}-photo{j}" class="poster"{" style=\"opacity:0\"" if j else ""}><img id="{sid}-image{j}" data-layout-allow-overflow src="assets/images/{f}" alt="Nobel Vật lý 2026 · Francis Halzen"></div>'
            tweens += f"tl.fromTo('#{sid}-image{j}',{{scale:1.0}},{{scale:1.035,duration:{span:.4f},ease:'none'}},{t0:.4f});"
        else:
            markup += f'<div id="{sid}-photo{j}" class="film-photo"{" style=\"opacity:0\"" if j else ""}><img id="{sid}-image{j}" data-layout-allow-overflow src="assets/images/{f}" alt="" style="object-position:{pos};transform-origin:{pos}"></div>'
            drift = (-14, -22) if j % 2 == 0 else (12, -18)
            tweens += f"tl.fromTo('#{sid}-image{j}',{{scale:{1.03 * zoom:.3f},x:0,y:0}},{{scale:{1.085 * zoom:.3f},x:{drift[0]},y:{drift[1]},duration:{span:.4f},ease:'none'}},{t0:.4f});"
        if j: tweens += f"tl.fromTo('#{sid}-photo{j}',{{opacity:0}},{{opacity:1,duration:.7,ease:'power2.inOut'}},{t0:.4f});"
        if label:
            same_prev = j > 0 and items[j - 1][3] == label
            same_next = j + 1 < len(items) and items[j + 1][3] == label
            markup += f'<div id="{sid}-label{j}" class="photo-label">{html.escape(label)}</div>'
            if not same_prev: tweens += f"tl.fromTo('#{sid}-label{j}',{{opacity:0,y:8}},{{opacity:1,y:0,duration:.45,ease:'power2.out'}},{t0 + 0.35:.4f});"
            else: tweens += f"tl.set('#{sid}-label{j}',{{opacity:1}},{t0:.4f});"
            if not same_next: tweens += f"tl.to('#{sid}-label{j}',{{opacity:0,duration:.35,ease:'power1.in'}},{min(D - 0.4, t1 - 0.45):.4f});"
            else: tweens += f"tl.set('#{sid}-label{j}',{{opacity:0}},{t1 + 0.7:.4f});"
    fade = f"tl.fromTo('#{sid}-shot',{{opacity:0}},{{opacity:1,duration:{s['xfade_in']},ease:'power1.inOut'}},0);" if s['xfade_in'] else ''
    return f'''<!doctype html><html lang="vi"><body><template><style>{STYLE.format(sid=sid, band=band_top, top=poster_top)}</style><div id="{sid}-root" data-composition-id="{sid}" data-width="1080" data-height="1920" data-duration="{D:.5f}"><div id="{sid}-shot" class="film-shot">{markup}</div></div><script>document.fonts.ready.then(function(){{const tl=gsap.timeline({{paused:true}});{tweens}{fade}window.__timelines['{sid}']=tl;}});</script></template></body></html>'''


for s in scenes:
    if s['kind'] == 'outro': doc = outro_document(s)
    elif s['kind'] in THREE_D: doc = three_scene(s)
    elif s['kind'] in PHOTO_SCENES: doc = photo_scene(s)
    else: doc = flat_scene(s)
    (COM / (s['id'] + '.html')).write_text(doc, encoding='utf-8')
    (COM / (s['id'] + '.motion.json')).write_text(json.dumps({'scene': s['id'], 'duration_s': s['duration'], 'rules': ['dynamic-content-sequencing'],
        'entry': {'vector': f"crossfade {s['xfade_in']}s" if s['xfade_in'] else 'opening frame', 'from_rest': False},
        'exit': {'vector': 'continuous scene motion under the next crossfade', 'still_moving': True}}), encoding='utf-8')
print('scenes written:', len(scenes), '3D:', sorted(k for k in THREE_D))
(COM / 'channel-mark.html').write_text(watermark_document(scenes[-1]['start']), encoding='utf-8')
