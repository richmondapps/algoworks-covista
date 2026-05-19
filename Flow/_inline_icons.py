"""One-shot helper: inline GCP icon SVGs as base64 data URIs so mmdc can render them.

Reads pipeline_architecture_may13_v2.md, swaps every src='assets/gcp-icons/X.svg'
for a data: URI, writes _v2_inline.md, then we run mmdc on that.
"""
from pathlib import Path
import base64
import re

ROOT = Path(__file__).parent
src_md = ROOT / "pipeline_architecture_may13_v2.md"
dst_md = ROOT / "_v2_inline.md"
icons_dir = ROOT / "assets" / "gcp-icons"

cache: dict[str, str] = {}
for svg in icons_dir.glob("*.svg"):
    data = svg.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    cache[svg.name] = f"data:image/svg+xml;base64,{b64}"

text = src_md.read_text(encoding="utf-8")

def repl(m: re.Match) -> str:
    fname = m.group(1)
    if fname not in cache:
        return m.group(0)
    return f"src='{cache[fname]}'"

new_text = re.sub(r"src='assets/gcp-icons/([^']+)'", repl, text)
dst_md.write_text(new_text, encoding="utf-8")
print(f"wrote {dst_md} ({len(new_text)} chars, {len(cache)} icons inlined)")
