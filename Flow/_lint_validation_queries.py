"""Offline lint of every ```sql block in the pipeline-validation doc.

Substitutes {{CDW_PROJECT}} / {{WALDEN_PROJECT}} for each env, parses against
the BigQuery dialect via sqlglot, and reports any parse errors.
"""
from __future__ import annotations
import re
import sys
import io
from pathlib import Path

# Force stdout to utf-8 so we can print arrow chars etc on Windows cp1252 consoles
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

import sqlglot
from sqlglot.errors import ParseError

ROOT = Path(__file__).resolve().parent.parent
DOCS = [
    ROOT / "context" / "Masterlivingdocs" / "validation_queries_pubsub_pipeline.md",
    ROOT / "context" / "Masterlivingdocs" / "validation_queries_sf_prod_qa.md",
]
DOC = DOCS[0]  # legacy single-doc default; main() loops below

ENVS = {
    "dev":  ("daas-cdw-dev",  "dev-wu-agenticai-app-proj"),
    "qa":   ("daas-cdw-qa",   "qa-wu-agenticai-app-proj"),
    "prod": ("daas-cdw-prod", "prod-wu-agenticai-app-proj"),
}

SQL_BLOCK = re.compile(r"^```sql\n(.*?)\n^```", re.DOTALL | re.MULTILINE)

def label_for(idx: int, block: str) -> str:
    # try to find the nearest preceding header
    return f"block #{idx}"

def main() -> int:
    total_fail = 0
    total_pass = 0
    total_skip = 0
    for doc in DOCS:
        if not doc.exists():
            print(f"!! missing: {doc}")
            continue
        text = doc.read_text(encoding="utf-8")
        blocks = SQL_BLOCK.findall(text)
        print(f"\n=== {doc.name} — {len(blocks)} SQL block(s) ===\n")

        lines = text.splitlines()
        header_for_block: list[str] = []
        current_header = "(preamble)"
        for ln in lines:
            if ln.startswith("## ") or ln.startswith("### "):
                current_header = ln.lstrip("# ").strip()
            if ln.startswith("```sql"):
                header_for_block.append(current_header)

        for idx, raw in enumerate(blocks, 1):
            name = header_for_block[idx-1] if idx-1 < len(header_for_block) else f"block #{idx}"
            head = raw.strip().split("\n", 1)[0][:60]
            cdw, walden = ENVS["dev"]
            sql = raw.replace("{{CDW_PROJECT}}", cdw).replace("{{WALDEN_PROJECT}}", walden)
            if not re.search(r"\bSELECT\b|\bDELETE\b|\bMERGE\b|\bWITH\b", sql, re.IGNORECASE):
                print(f"[SKIP] {name:55s}  {head}")
                total_skip += 1
                continue
            try:
                sqlglot.parse(sql, read="bigquery")
                print(f"[ OK ] {name:55s}  {head}")
                total_pass += 1
            except ParseError as e:
                print(f"[FAIL] {name:55s}  {head}")
                print(f"       -> {e.errors[0] if e.errors else e}")
                total_fail += 1
            except Exception as e:
                print(f"[FAIL] {name:55s}  {head}")
                print(f"       -> {type(e).__name__}: {e}")
                total_fail += 1

    print(f"\nTOTAL: {total_pass} pass, {total_fail} fail, {total_skip} skipped")
    return 0 if total_fail == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
