"""Build a PDF-ready MD where ```mermaid``` blocks are swapped for PNG embeds,
then render via markdown_pdf."""
from pathlib import Path
import re
import markdown_pdf

ROOT = Path(__file__).parent
src = (ROOT / "pipeline_architecture_may13_v2.md").read_text(encoding="utf-8")

pngs = ["pipeline_architecture_may13_v2-1.png", "pipeline_architecture_may13_v2-2.png"]
it = iter(pngs)

def swap(_m: re.Match) -> str:
    try:
        png = next(it)
    except StopIteration:
        return _m.group(0)
    return f"![]({png})\n"

out = re.sub(r"```mermaid\n.*?\n```", swap, src, flags=re.DOTALL)
pdf_md = ROOT / "_v2_pdfready.md"
pdf_md.write_text(out, encoding="utf-8")

m = markdown_pdf.MarkdownPdf(toc_level=2)
m.add_section(markdown_pdf.Section(out, root=str(ROOT)))
m.save(str(ROOT / "pipeline_architecture_may13_v2.pdf"))
print("wrote pipeline_architecture_may13_v2.pdf")
