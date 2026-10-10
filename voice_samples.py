"""Audition Vietnamese male Google voices without changing the film's voice.

python voice_samples.py
python voice_samples.py vi-VN-Chirp3-HD-Fenrir

Chirp samples intentionally have no word timings; they are listening samples,
not drop-in production narration. Neural2/Wavenet production uses google_tts.py.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import time

import numpy as np
from scipy.io import wavfile

from google_tts import ROOT, TTSError, api, decode_wave, session_for, settings, synthesize
from narration_text import PAUSES, sentences, spoken_map

DEFAULTS = ['vi-VN-Wavenet-B', 'vi-VN-Chirp3-HD-Charon',
            'vi-VN-Chirp3-HD-Orus', 'vi-VN-Chirp3-HD-Puck']
OUTPUT = ROOT.parent.parent / 'outputs' / 'google-voice-samples'


def sample(session, line, config, voice):
    config = {**config, 'voice': voice}
    if '-Chirp3-HD-' not in voice:
        meta = synthesize(session, line, config)
        source = ROOT / 'assets/audio/google-cloud' / voice / 'raw' / meta['audio_file']
        return source, meta['duration'], True

    source = ROOT / 'assets/audio/google-cloud' / voice / 'samples' / f'{line["id"]}.wav'
    record = source.with_suffix('.json')
    digest = hashlib.sha256(json.dumps({'text': spoken_map(line['text'])[0], 'config': config,
                                       'pauses': PAUSES.get(line['id'], [])},
                                      ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()
    if source.exists() and record.exists():
        meta = json.loads(record.read_text(encoding='utf-8'))
        if meta.get('cache_key') == digest:
            print(f'{voice}: cached, {meta["duration"]:.2f}s', flush=True)
            return source, meta['duration'], False

    chunks = []
    matches = sentences(line['text'])
    sr = config['sample_rate_hertz']
    for index, match in enumerate(matches):
        text = spoken_map(match.group().strip())[0]
        for attempt in range(4):
            result = api(session, 'POST', '/v1/text:synthesize', json={
                'input': {'text': text},
                'voice': {'languageCode': config['language_code'], 'name': voice},
                'audioConfig': {'audioEncoding': 'LINEAR16', 'sampleRateHertz': sr,
                                'speakingRate': config['opening_speaking_rate'] if line['id'] == 'p01' else config['speaking_rate']},
            })
            try:
                audio, _ = decode_wave(base64.b64decode(result['audioContent']), sr)
                break
            except TTSError:
                if attempt == 3:
                    raise
                print(f'{line["id"]} sentence {index + 1}: retrying empty synthesis', flush=True)
                time.sleep(2)
        chunks.append(audio)
        if index < len(matches) - 1:
            pauses = PAUSES.get(line['id'], [])
            gap = pauses[index] if index < len(pauses) else config['sentence_pause_seconds']
            chunks.append(np.zeros(round(sr * gap), np.int16))
    audio = np.concatenate(chunks)
    source.parent.mkdir(parents=True, exist_ok=True)
    temporary = source.with_suffix('.tmp.wav')
    wavfile.write(temporary, sr, audio)
    temporary.replace(source)
    duration = len(audio) / sr
    record.write_text(json.dumps({'voice': voice, 'provider': 'google-cloud', 'text': line['text'],
                                 'duration': duration, 'cache_key': digest, 'alignment_ready': False},
                                ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{voice}: {duration:.2f}s', flush=True)
    return source, duration, False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('voices', nargs='*')
    args = parser.parse_args()
    config = settings()
    session = session_for(config)
    catalog = {v['name']: v for v in api(session, 'GET', '/v1/voices',
                                       params={'languageCode': 'vi-VN'})['voices']}
    chosen = args.voices or DEFAULTS
    for voice in chosen:
        if voice not in catalog or catalog[voice]['ssmlGender'] != 'MALE':
            parser.error(f'{voice} is not an available Vietnamese male voice.')
    line = json.loads((ROOT / 'SCRIPT.json').read_text(encoding='utf-8'))['lines'][0]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_file = OUTPUT / 'samples.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8')) if manifest_file.exists() else {}
    for voice in chosen:
        source, duration, aligned = sample(session, line, config, voice)
        output = OUTPUT / f'{voice}.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source),
                        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', '48000',
                        '-c:a', 'libmp3lame', '-b:a', '192k', str(output)], check=True)
        manifest[voice] = {'path': output.name, 'duration': duration, 'source': str(source.relative_to(ROOT)),
                           'paragraph': line['id'], 'alignment_ready': aligned}
        manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'Ready: {output.name}', flush=True)


if __name__ == '__main__':
    main()
