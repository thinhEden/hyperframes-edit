"""Channel branding: a quiet circular watermark and a six-second silent outro.

Outro motion adapts the logo-outro registry block's logo-then-tagline reveal,
using the supplied raster logo, portrait layout and this film's local font.
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def outro_document(scene):
    brand = json.loads((ROOT / 'BRAND.json').read_text(encoding='utf-8'))
    name, logo = html.escape(brand['channel_name']), html.escape(brand['logo'], quote=True)
    first, separator, last = brand['slogan'].partition(', ')
    slogan = f'<span>{html.escape(first + ("," if separator else ""))}</span>'
    if separator:
        slogan += f'<span>{html.escape(last)}</span>'
    d = scene['duration']
    return f'''<!-- hyperframes-registry-item: logo-outro; adapted to Khoa Hoc Mo Loi -->
<!doctype html><html lang="vi"><body><template>
<style>
#brand-outro-root{{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:transparent}}
#brand-outro-stage{{position:absolute;inset:0;background:#0c1821}}
#brand-outro-logo{{position:absolute;left:370px;top:556px;width:340px;height:340px;border-radius:50%;overflow:hidden;border:1px solid rgba(237,240,233,.16)}}
#brand-outro-logo img{{display:block;width:100%;height:100%;object-fit:cover}}
#brand-outro-name{{position:absolute;left:60px;top:957px;width:960px;text-align:center;font-size:64px;line-height:1.25;font-weight:600;color:#edf0e9}}
#brand-outro-tagline{{position:absolute;left:100px;top:1080px;width:880px;text-align:center;font-size:37px;line-height:1.55;font-weight:400;color:#b8c8d1}}
#brand-outro-tagline span{{display:block}}
</style>
<div id="brand-outro-root" data-composition-id="logo-outro" data-width="1080" data-height="1920" data-duration="{d:.5f}">
<div id="brand-outro-stage"><div id="brand-outro-logo"><img src="{logo}" alt="{name}"></div>
<div id="brand-outro-name">{name}</div>
<div id="brand-outro-tagline">{slogan}</div></div></div>
<script>document.fonts.ready.then(function(){{
const tl=gsap.timeline({{paused:true}});
tl.fromTo('#brand-outro-stage',{{opacity:0}},{{opacity:1,duration:.55,ease:'power2.inOut'}},0);
tl.fromTo('#brand-outro-logo',{{opacity:0,scale:.94,y:18}},{{opacity:1,scale:1,y:0,duration:.85,ease:'power3.out'}},.15);
tl.fromTo('#brand-outro-name',{{opacity:0,y:14}},{{opacity:1,y:0,duration:.7,ease:'power3.out'}},.65);
tl.fromTo('#brand-outro-tagline',{{opacity:0,y:10}},{{opacity:1,y:0,duration:.7,ease:'power2.out'}},1.05);
tl.to('#brand-outro-stage',{{opacity:0,duration:.6,ease:'power2.inOut'}},{d - .6:.5f});
window.__timelines['logo-outro']=tl;
}});</script></template></body></html>'''


def watermark_document(duration):
    brand = json.loads((ROOT / 'BRAND.json').read_text(encoding='utf-8'))
    logo = html.escape(brand['logo'], quote=True)
    name = html.escape(brand['channel_name'], quote=True)
    return f'''<!doctype html><html lang="vi"><body><template><style>
#channel-mark-root{{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}}
#channel-mark-disc{{position:absolute;left:76px;top:132px;width:112px;height:112px;border-radius:50%;overflow:hidden;border:1px solid rgba(237,240,233,.3)}}
#channel-mark-disc img{{display:block;width:100%;height:100%;object-fit:cover}}
</style><div id="channel-mark-root" data-composition-id="channel-mark" data-width="1080" data-height="1920" data-duration="{duration:.5f}">
<div id="channel-mark-disc"><img src="{logo}" alt="{name}"></div></div>
<script>const markTimeline=gsap.timeline({{paused:true}});
markTimeline.fromTo('#channel-mark-disc',{{opacity:0}},{{opacity:.9,duration:.6,ease:'power2.out'}},.35);
markTimeline.to('#channel-mark-disc',{{opacity:0,duration:.4,ease:'power2.inOut'}},{duration - .4:.5f});
window.__timelines['channel-mark']=markTimeline;</script></template></body></html>'''
