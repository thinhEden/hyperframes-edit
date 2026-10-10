"""Chirp audio plus Google Speech-to-Text word offsets mapped to the known script.

Text recognition is only used for alignment; displayed captions always come from
SCRIPT.json. Foreign-name aliases are expanded on both sides before alignment.
Raw recognition and quality metrics are cached for review, never hidden.
"""
import base64
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import shutil
import time
import unicodedata

from google_tts import TTSError, cache_dir, cache_key, marked_ssml
from narration_text import ALIASES, PAUSES, spoken_map


def normalize(text):
    text = unicodedata.normalize('NFD', text.casefold().replace('đ', 'd'))
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return re.findall(r'[a-z0-9]+', text)


def recognized_text(text):
    # Speech recognition formats spoken measurements and counts as digits.
    counts = {'0': 'không', '1': 'một', '2': 'hai', '3': 'ba', '5': 'năm',
              '28': 'hai mươi tám', '86': 'tám mươi sáu', '5000': 'năm nghìn',
              '50000': 'năm mươi nghìn', '5160': 'năm nghìn một trăm sáu mươi'}
    compact = text.casefold().replace('.', '').replace(',', '')
    if compact in counts:
        return counts[compact]
    if compact in ('km³', 'km3'):
        return 'kilômét khối'
    return spoken_map(text)[0]


def recognize(session, audio_file, config):
    digest = hashlib.sha256(audio_file.read_bytes()).hexdigest()
    record = audio_file.with_suffix('.recognition.json')
    if record.exists():
        cached = json.loads(record.read_text(encoding='utf-8'))
        if cached.get('audio_sha256') == digest:
            return cached['response']
    payload = {
        'config': {'encoding': 'LINEAR16', 'sampleRateHertz': config['sample_rate_hertz'],
                   'languageCode': config['language_code'], 'enableWordTimeOffsets': True,
                   'enableWordConfidence': True, 'model': 'latest_long',
                   'speechContexts': [{'phrases': list(ALIASES.values()), 'boost': 15}]},
        'audio': {'content': base64.b64encode(audio_file.read_bytes()).decode('ascii')},
    }
    for attempt in range(4):
        response = session.post('https://speech.googleapis.com/v1/speech:recognize',
                                json=payload, timeout=(10, 90))
        body = response.json()
        if response.ok:
            record.write_text(json.dumps({'audio_sha256': digest, 'response': body},
                                         ensure_ascii=False, indent=2), encoding='utf-8')
            return body
        if response.status_code in (429, 500, 502, 503, 504) and attempt < 3:
            time.sleep(2 ** (attempt + 1))
            continue
        raise TTSError(f'Google word alignment {response.status_code}: '
                       + body.get('error', {}).get('message', 'Request failed'))
    raise TTSError('Google word alignment failed.')


def align(text, response, duration):
    _, originals = marked_ssml(text)
    expected = []
    for index, token in enumerate(originals):
        for syllable in normalize(spoken_map(token['text'])[0]):
            expected.append((syllable, index))
    heard, transcript = [], []
    for result in response.get('results', []):
        alternative = result['alternatives'][0]
        transcript.append(alternative.get('transcript', ''))
        for word in alternative.get('words', []):
            syllables = normalize(recognized_text(word['word']))
            start = float(word.get('startTime', '0s').rstrip('s'))
            end = float(word.get('endTime', '0s').rstrip('s'))
            for i, syllable in enumerate(syllables):
                heard.append((syllable, start + (end - start) * i / len(syllables),
                              start + (end - start) * (i + 1) / len(syllables)))
    if not heard:
        raise TTSError('Speech recognition returned no timed words.')
    # Monotonic edit-distance alignment allows recognizer spellings to differ.
    n, m = len(expected), len(heard)
    distance = [[0.0] * (m + 1) for _ in range(n + 1)]
    path = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        distance[i][0], path[i][0] = float(i), 1
    for j in range(1, m + 1):
        distance[0][j], path[0][j] = float(j), 2
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            a, b = expected[i - 1][0], heard[j - 1][0]
            similarity = 1.0 if a == b else SequenceMatcher(None, a, b).ratio()
            cost = 0.0 if similarity == 1 else 1.2 - similarity * 0.8
            choices = [distance[i - 1][j - 1] + cost,
                       distance[i - 1][j] + 1, distance[i][j - 1] + 1]
            best = min(range(3), key=choices.__getitem__)
            distance[i][j], path[i][j] = choices[best], best
    groups = [[] for _ in originals]
    i, j, good, plain_good = n, m, 0, 0
    plain_total = sum(not originals[index]['alias'] for _, index in expected)
    while i or j:
        action = path[i][j]
        if action == 0:
            a, index = expected[i - 1]
            b, start, end = heard[j - 1]
            similarity = SequenceMatcher(None, a, b).ratio()
            good += similarity >= 0.6
            plain_good += similarity >= 0.6 and not originals[index]['alias']
            groups[index].append((start, end))
            i -= 1; j -= 1
        elif action == 1:
            i -= 1
        else:
            j -= 1
    ratio = good / max(1, n)
    plain_ratio = plain_good / max(1, plain_total)
    missing = [i for i, group in enumerate(groups) if not group]
    if ratio < 0.65 or plain_ratio < 0.88 or len(missing) > max(3, len(originals) * 0.08):
        raise TTSError(f'Low alignment quality ({ratio:.1%}, {len(missing)} untimed tokens). Review recognition.')
    words = []
    for index, token in enumerate(originals):
        if groups[index]:
            start, end = min(p[0] for p in groups[index]), max(p[1] for p in groups[index])
        else:
            before = next((k for k in range(index - 1, -1, -1) if groups[k]), None)
            after = next((k for k in range(index + 1, len(groups)) if groups[k]), None)
            a = max(p[1] for p in groups[before]) if before is not None else 0
            b = min(p[0] for p in groups[after]) if after is not None else duration
            left, right = before if before is not None else -1, after if after is not None else len(groups)
            start = a + max(0, b - a) * (index - left - 1) / (right - left - 1)
            end = a + max(0, b - a) * (index - left) / (right - left - 1)
        start, end = max(0, min(duration, start)), max(0, min(duration, end))
        words.append({'text': text[token['char_start']:token['char_end']],
                      'start': start, 'end': max(start, end),
                      'char_start': token['char_start'], 'char_end': token['char_end'],
                      'timing': 'interpolated' if index in missing else 'speech-word-offset'})
    if any(b['start'] < a['start'] for a, b in zip(words, words[1:])):
        raise TTSError('Word alignment is not monotonic.')
    quality = {'syllable_match_ratio': round(ratio, 4), 'ordinary_word_match_ratio': round(plain_ratio, 4), 'interpolated_tokens':
               [words[index]['text'] for index in missing], 'transcript': ' '.join(transcript)}
    return words, quality


def synthesize_chirp(session, line, config, force=False):
    from voice_samples import sample
    raw = cache_dir(config)
    raw.mkdir(parents=True, exist_ok=True)
    pid = line['id']
    audio_file, meta_file = raw / f'{pid}.wav', raw / f'{pid}.json'
    digest = cache_key(line, config)
    if not force and meta_file.exists() and audio_file.exists():
        meta = json.loads(meta_file.read_text(encoding='utf-8'))
        if meta.get('cache_key') == digest and meta.get('words') and meta.get('alignment_version') == 2:
            print(f'{pid}: cached, {meta["duration"]:.2f}s', flush=True)
            return meta
    source, duration, _ = sample(session, line, config, config['voice'])
    shutil.copyfile(source, audio_file)
    response = recognize(session, audio_file, config)
    words, quality = align(line['text'], response, duration)
    meta = {'id': pid, 'text': line['text'], 'spoken': spoken_map(line['text'])[0],
            'duration': duration, 'words': words, 'provider': 'google-cloud', 'voice': config['voice'],
            'audio_file': audio_file.name, 'speaking_rate': config['opening_speaking_rate'] if pid == 'p01' else config['speaking_rate'],
            'sample_rate_hertz': config['sample_rate_hertz'], 'sentence_pauses': PAUSES.get(pid, []),
            'timing_source': 'google-speech-to-text-known-script-alignment', 'alignment_quality': quality,
            'cache_key': digest, 'alignment_version': 2}
    meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'{pid}: aligned {len(words)} words, match {quality["syllable_match_ratio"]:.1%}, {duration:.2f}s', flush=True)
    return meta
