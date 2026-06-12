#!/usr/bin/env python3
"""extract.py — pull the sacred prototype's Library corpus (the LIB_* arrays) into JSON.

The prototype docs/TFOS_MyFarm_Prototype_v263_20260608.html hardcodes the Operator's
real Fiji farm-libraries corpus (357 rows) as single-line, JSON-parseable arrays:
LIB_CROPS, LIB_CHEMS, LIB_PESTS, LIB_DIS, LIB_FERT, LIB_LIVDIS, LIB_VET.

This is the source of truth for the Farm pillar Library reference tables — carried
verbatim (Inviolable #1: no invented agronomy). Re-run to refresh the JSON used by the
seed migrations.

Usage: python3 scripts/library_corpus/extract.py
Output: 11_application_code/app/data/library_corpus/<lib>.json
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "TFOS_MyFarm_Prototype_v263_20260608.html"
OUT = ROOT / "11_application_code" / "app" / "data" / "library_corpus"


def main() -> None:
    text = SRC.read_text()
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for m in re.finditer(r"var (LIB_[A-Z]+)\s*=\s*(\[.*?\])\s*;", text):
        name, body = m.group(1), m.group(2)
        rows = json.loads(body)
        (OUT / f"{name.lower()}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))
        total += len(rows)
        print(f"{name}: {len(rows)} rows -> {name.lower()}.json")
    print(f"total: {total} rows")


if __name__ == "__main__":
    main()
