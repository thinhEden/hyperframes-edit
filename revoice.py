"""Re-synthesise selected narration paragraphs sentence by sentence, with authored pauses between sentences.
Writes assets/audio/raw/<id>.mp3 and <id>.json in the same format build_timeline.py reads.
Usage: python revoice.py p01 p02 p21"""
import asyncio, edge_tts, html, json, pathlib, re, subprocess, sys
import numpy as np
from scipy.io import wavfile

ROOT = pathlib.Path(__file__).resolve().parent
RAW = ROOT / 'assets/audio/raw'
VOICE = 'vi-VN-NamMinhNeural'
SR = 48000
from narration_text import ALIASES, PAUSES, spoken_map, sentences


async def sentence_audio(text, offset, tmp):
    spoken, mapping = spoken_map(text)
    for attempt in range(6):
        try:
            words, cursor = [], 0
            with tmp.open('wb') as f:
                async for ev in edge_tts.Communicate(spoken, VOICE, boundary='WordBoundary').stream():
                    if ev['type'] == 'audio':
                        f.write(ev['data'])
                    elif ev['type'] == 'WordBoundary':
                        tok = html.unescape(ev['text']); idx = spoken.lower().find(tok.lower(), cursor)
                        if idx < 0: idx = cursor
                        end = min(len(spoken), idx + len(tok)); cursor = end
                        words.append({'text': tok, 'start': ev['offset'] / 1e7, 'end': (ev['offset'] + ev['duration']) / 1e7,
                                      'char_start': offset + mapping[idx], 'char_end': offset + mapping[end]})
            wav = tmp.with_suffix('.wav')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp), '-ar', str(SR), '-ac', '1', str(wav)], check=True)
            sr, data = wavfile.read(wav)
            # trim leading/trailing silence so authored pauses are exact
            level = np.abs(data.astype(np.int32)); thr = 300
            nz = np.nonzero(level > thr)[0]
            a = max(0, nz[0] - int(0.03 * SR)); b = min(len(data), nz[-1] + int(0.06 * SR))
            for w in words: w['start'] -= a / SR; w['end'] -= a / SR
            return data[a:b], words
        except Exception as ex:
            print('retry', text[:30], attempt, type(ex).__name__, flush=True)
            await asyncio.sleep(2 + 2 * attempt)
    raise RuntimeError('TTS failed: ' + text[:40])


async def make(pid, line):
    text = line['text']
    parts = sentences(text)
    pauses = PAUSES.get(pid, [])
    chunks, words, t = [], [], 0.0
    for i, m in enumerate(parts):
        lead = len(m.group()) - len(m.group().lstrip())
        data, w = await sentence_audio(m.group().strip(), m.start() + lead, RAW / f'{pid}-s{i}.mp3')
        for x in w: x['start'] += t; x['end'] += t
        words += w; chunks.append(data); t += len(data) / SR
        if i < len(parts) - 1:
            gap = pauses[i] if i < len(pauses) else 0.32
            chunks.append(np.zeros(int(gap * SR), np.int16)); t += gap
    audio = np.concatenate(chunks)
    tmp = RAW / f'{pid}-all.wav'; wavfile.write(tmp, SR, audio)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp), '-c:a', 'libmp3lame', '-b:a', '160k', str(RAW / f'{pid}.mp3')], check=True)
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(RAW / f'{pid}.mp3')], text=True))
    (RAW / f'{pid}.json').write_text(json.dumps({'id': pid, 'text': text, 'spoken': spoken_map(text)[0], 'duration': dur, 'words': words,
                                                 'sentence_pauses': pauses}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{pid}: {len(parts)} sentences, {dur:.2f}s', flush=True)


async def main(ids):
    lines = {l['id']: l for l in json.loads((ROOT / 'SCRIPT.json').read_text(encoding='utf-8'))['lines']}
    for pid in ids:
        await make(pid, lines[pid])

if __name__ == '__main__':
    asyncio.run(main(sys.argv[1:]))
