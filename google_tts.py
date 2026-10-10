"""Google Cloud TTS with SSML word marks, isolated cache, and project ADC auth.

python google_tts.py --doctor
python google_tts.py --list-voices
python google_tts.py p01
python google_tts.py --all
python google_tts.py --all --plan

Never writes credentials into the project. Uses Application Default Credentials,
or the GOOGLE_TTS_API_KEY environment variable when explicitly set.
"""
import argparse
import base64
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import sys
import time
import wave

import numpy as np
import requests
from scipy.io import wavfile

from narration_text import ALIASES, PAUSES, sentences, spoken_map

ROOT = Path(__file__).resolve().parent
ENDPOINT = 'https://texttospeech.googleapis.com'


class TTSError(RuntimeError):
    pass


def settings(voice=None, project=None):
    config = json.loads((ROOT / 'NARRATION.json').read_text(encoding='utf-8'))
    if voice:
        config['voice'] = voice
    if project:
        config['project_id'] = project
    # Marks are essential to this project's caption and animation timing.
    if not re.fullmatch(r'vi-VN-((Neural2|Wavenet|Standard)-[A-D]|Chirp3-HD-[A-Za-z]+)', config['voice']):
        raise TTSError('Choose an available Vietnamese Google voice.')
    return config


def session_for(config):
    key = os.environ.get('GOOGLE_TTS_API_KEY')
    if key:
        session = requests.Session()
        session.headers['x-goog-api-key'] = key
    else:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        credentials, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
        project = config.get('project_id')
        if project and hasattr(credentials, 'with_quota_project'):
            credentials = credentials.with_quota_project(project)
        session = AuthorizedSession(credentials)
    session.headers['Content-Type'] = 'application/json; charset=utf-8'
    return session


def api(session, method, route, **kwargs):
    for attempt in range(4):
        response = session.request(method, ENDPOINT + route, timeout=(10, 90), **kwargs)
        if response.ok:
            return response.json()
        body = response.json() if 'json' in response.headers.get('Content-Type', '') else {}
        error = body.get('error', {})
        if response.status_code in (429, 500, 502, 503, 504) and attempt < 3:
            time.sleep(2 ** (attempt + 1))
            continue
        raise TTSError(f'Google TTS {response.status_code} {error.get("status", "")}: '
                       f'{error.get("message", "Request failed")}')
    raise TTSError('Google TTS request failed after retries.')


def marked_ssml(text):
    """Keep aliases in one <sub>; source character spans match SCRIPT.json."""
    alias_pattern = '|'.join(re.escape(k) for k in sorted(ALIASES, key=len, reverse=True))
    regex = re.compile(rf'(?:{alias_pattern})(?!\w)|\S+', re.I)
    tokens = []
    for match in regex.finditer(text):
        token = match.group()
        if not any(char.isalnum() for char in token) and tokens:
            gap = text[tokens[-1]['char_end']:match.start()]
            tokens[-1]['char_end'] = match.end()
            tokens[-1]['suffix'] += gap + token
            continue
        alias = next((v for k, v in ALIASES.items() if k.lower() == token.lower()), None)
        tokens.append({'text': token, 'alias': alias, 'suffix': '',
                       'char_start': match.start(), 'char_end': match.end()})
    parts = ['<speak>']
    for index, token in enumerate(tokens):
        content = html.escape(token['text'])
        if token['alias']:
            content = f'<sub alias="{html.escape(token["alias"], quote=True)}">{content}</sub>'
        parts.append(f'<mark name="w{index}"/>{content}{html.escape(token["suffix"])} ')
    parts.append('<mark name="finish"/></speak>')
    ssml = ''.join(parts)
    if len(ssml.encode('utf-8')) > 5000:
        raise TTSError('A sentence exceeds the Google TTS 5000-byte limit. Split that sentence first.')
    return ssml, tokens


def decode_wave(content, sr):
    with wave.open(io.BytesIO(content), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, sr):
            raise TTSError('Google returned an unexpected PCM audio format.')
        audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').copy()
    active = np.flatnonzero(np.abs(audio.astype(np.int32)) > 200)
    if not len(active):
        raise TTSError('Google returned silent audio.')
    start = max(0, int(active[0]) - round(0.03 * sr))
    stop = min(len(audio), int(active[-1]) + round(0.06 * sr))
    return audio[start:stop], start / sr


def sentence_request(session, text, config, rate):
    ssml, tokens = marked_ssml(text)
    body = api(session, 'POST', '/v1beta1/text:synthesize', json={
        'input': {'ssml': ssml},
        'voice': {'languageCode': config['language_code'], 'name': config['voice']},
        'audioConfig': {'audioEncoding': 'LINEAR16', 'sampleRateHertz': config['sample_rate_hertz'],
                        'speakingRate': rate},
        'enableTimePointing': ['SSML_MARK'],
    })
    audio, trim = decode_wave(base64.b64decode(body['audioContent']), config['sample_rate_hertz'])
    duration = len(audio) / config['sample_rate_hertz']
    marks = {p['markName']: p['timeSeconds'] - trim for p in body.get('timepoints', [])}
    missing = [f'w{i}' for i in range(len(tokens)) if f'w{i}' not in marks]
    if missing:
        raise TTSError('Google omitted word marks: ' + ', '.join(missing[:10]) +
                       '. Refusing to guess subtitle timing.')
    words = []
    for index, token in enumerate(tokens):
        start = max(0, min(duration, marks[f'w{index}']))
        end = max(start, min(duration, marks.get(f'w{index + 1}', marks.get('finish', duration))))
        words.append({'text': text[token['char_start']:token['char_end']], 'start': start, 'end': end,
                      'char_start': token['char_start'], 'char_end': token['char_end']})
    if any(b['start'] < a['start'] for a, b in zip(words, words[1:])):
        raise TTSError('Google returned word marks out of order.')
    return audio, words


def cache_dir(config):
    return ROOT / 'assets' / 'audio' / 'google-cloud' / config['voice'] / 'raw'


def cache_key(line, config):
    # Only sentences with standalone punctuation change under the space fix.
    schema = 2 if re.search(r'(?<!\S)[^\w\s]+(?!\S)', line['text']) else 1
    content = {'schema': schema, 'text': line['text'], 'config': config,
               'aliases': ALIASES, 'pauses': PAUSES.get(line['id'], [])}
    return hashlib.sha256(json.dumps(content, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()


def synthesize(session, line, config, force=False):
    if '-Chirp3-HD-' in config['voice']:
        from chirp_narration import synthesize_chirp
        return synthesize_chirp(session, line, config, force)
    pid, text = line['id'], line['text']
    target = cache_dir(config)
    target.mkdir(parents=True, exist_ok=True)
    audio_file, meta_file = target / f'{pid}.wav', target / f'{pid}.json'
    digest = cache_key(line, config)
    if not force and meta_file.exists() and audio_file.exists():
        meta = json.loads(meta_file.read_text(encoding='utf-8'))
        if meta.get('cache_key') == digest:
            print(f'{pid}: cached, {meta["duration"]:.2f}s', flush=True)
            return meta
    chunks, words, cursor = [], [], 0.0
    sr = config['sample_rate_hertz']
    rate = config.get('opening_speaking_rate', config['speaking_rate']) if pid == 'p01' else config['speaking_rate']
    matches = sentences(text)
    for index, match in enumerate(matches):
        raw = match.group()
        offset = match.start() + len(raw) - len(raw.lstrip())
        audio, boundaries = sentence_request(session, raw.strip(), config, rate)
        for boundary in boundaries:
            boundary['start'] += cursor
            boundary['end'] += cursor
            boundary['char_start'] += offset
            boundary['char_end'] += offset
        words.extend(boundaries)
        chunks.append(audio)
        cursor += len(audio) / sr
        if index < len(matches) - 1:
            pauses = PAUSES.get(pid, [])
            gap = pauses[index] if index < len(pauses) else config['sentence_pause_seconds']
            silence = np.zeros(round(gap * sr), np.int16)
            chunks.append(silence)
            cursor += len(silence) / sr
    audio = np.concatenate(chunks)
    meta = {'id': pid, 'text': text, 'spoken': spoken_map(text)[0], 'duration': len(audio) / sr,
            'words': words, 'provider': 'google-cloud', 'voice': config['voice'],
            'audio_file': audio_file.name, 'speaking_rate': rate, 'sample_rate_hertz': sr,
            'sentence_pauses': PAUSES.get(pid, []), 'timing_source': 'google-ssml-marks', 'cache_key': digest}
    temporary = audio_file.with_suffix('.tmp.wav')
    wavfile.write(temporary, sr, audio)
    temporary.replace(audio_file)
    temporary = meta_file.with_suffix('.tmp.json')
    temporary.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(meta_file)
    print(f'{pid}: {len(matches)} sentences, {len(words)} marks, {meta["duration"]:.2f}s', flush=True)
    return meta


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ids', nargs='*')
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--voice')
    parser.add_argument('--project')
    parser.add_argument('--plan', action='store_true', help='Show request size without calling Google')
    parser.add_argument('--doctor', action='store_true')
    parser.add_argument('--list-voices', action='store_true')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    config = settings(args.voice, args.project)
    lines = json.loads((ROOT / 'SCRIPT.json').read_text(encoding='utf-8'))['lines']
    by_id = {line['id']: line for line in lines}
    if not args.all and any(pid not in by_id for pid in args.ids):
        parser.error('Unknown paragraph ID.')
    selected = lines if args.all else [by_id[pid] for pid in args.ids]
    if args.plan:
        byte_max = max((len(marked_ssml(m.group().strip())[0].encode('utf-8'))
                        for line in selected for m in sentences(line['text'])), default=0)
        print(json.dumps({'provider': 'google-cloud', 'project': config['project_id'], 'voice': config['voice'],
                          'paragraphs': len(selected), 'text_characters': sum(len(l['text']) for l in selected),
                          'largest_ssml_request_bytes': byte_max, 'cache': str(cache_dir(config))}, ensure_ascii=False))
        return
    if not (selected or args.doctor or args.list_voices):
        parser.error('Specify paragraph IDs, --all, --doctor or --list-voices.')
    session = session_for(config)
    if args.doctor or args.list_voices:
        voices = api(session, 'GET', '/v1/voices', params={'languageCode': config['language_code']})['voices']
        if not any(v['name'] == config['voice'] for v in voices):
            raise TTSError('The selected Google voice is not available.')
        if args.list_voices:
            for voice in voices:
                print(f'{voice["name"]}\t{voice["ssmlGender"]}')
        else:
            print(json.dumps({'status': 'ready', 'project': config['project_id'], 'voice': config['voice'],
                              'available_voices': len(voices)}))
    for line in selected:
        synthesize(session, line, config, args.force)


if __name__ == '__main__':
    sys.modules['google_tts'] = sys.modules[__name__]
    try:
        main()
    except (TTSError, requests.RequestException) as error:
        # Do not print request headers, credentials or an authentication token.
        print(str(error) if isinstance(error, TTSError) else f'Network error: {type(error).__name__}', file=sys.stderr)
        sys.exit(1)
