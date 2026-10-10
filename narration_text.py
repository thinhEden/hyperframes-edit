"""Pronunciations and sentence pauses shared by narration providers."""
import re

ALIASES = {
    'Super-Kamiokande': 'Su-pơ Ka-mi-ô-kan-đê', 'Wisconsin–Madison': 'Uýt-con-xin Ma-đi-xơn',
    'Francis Halzen': 'Fran-xít Han-zen', 'Halzen': 'Han-zen', 'IceCube': 'Ai-xơ Kiub',
    'Cherenkov': 'Che-ren-cốp', 'KM3NeT': 'Ca Em Ba Nét', 'ARCA': 'Ác-ca',
    'blazar': 'blây-za', 'neutrino': 'nơ-tri-nô', 'Betelgeuse': 'Bê-ten-giút', 'Orion': 'Ô-ri-ôn',
    '1980': 'một nghìn chín trăm tám mươi', '2013': 'hai nghìn mười ba',
    '2017': 'hai nghìn mười bảy', '2018': 'hai nghìn mười tám',
    '2026': 'hai nghìn không trăm hai mươi sáu',
}
PAUSES = {'p01': [0.62, 0.62, 0.30, 0.72]}
PATTERN = re.compile('|'.join(re.escape(k) for k in sorted(ALIASES, key=len, reverse=True)), re.I)


def spoken_map(text):
    out, mapping, pos = [], [], 0
    for match in PATTERN.finditer(text):
        out.append(text[pos:match.start()])
        mapping.extend(range(pos, match.start()))
        replacement = next(v for k, v in ALIASES.items() if k.lower() == match.group().lower())
        out.append(replacement)
        mapping.extend(match.start() + int(i * (match.end() - match.start()) / len(replacement))
                       for i in range(len(replacement)))
        pos = match.end()
    out.append(text[pos:])
    mapping.extend(range(pos, len(text)))
    mapping.append(len(text))
    return ''.join(out), mapping


def sentences(text):
    return [m for m in re.finditer(r'[^.!?]+[.!?]+["”]?|[^.!?]+$', text) if m.group().strip()]
