"""Extract the "<Class> Spell List" section from a Laserllama class PDF (GM Binder export).

Usage (PyMuPDF required):
    python -P -E scripts/extract_class_spell_list.py "<path to PDF>" Druid "Laserllama: Alternate Druid"
Writes data/laserllama/class-lists/<class>.json:
    {"class": "Druid", "source": "...", "levels": {"0": [{"name": "beckon air", "ll": true}, {"name": "frostbite", "book": "XGE"}, ...]}}
  ll    - the entry carries the "ll" mark: the spell is from laserllama's Compendium of Spells (new or alternate version)
  book  - "*" = Xanathar's Guide to Everything, "**" = Tasha's Cauldron of Everything (official versions)
  ritual - marked "(r)"
"""
import json
import pathlib
import re
import sys

import fitz  # PyMuPDF

LEVEL = re.compile(r"^(?:Cantrips \(0-Level\)|(\d)(?:st|nd|rd|th)-Level(?: \(Cont\.\))?)$")
NAME = re.compile(r"^[a-z][a-z' /&-]*[a-z]$")


def page_lines(page):
    """Visual lines: (text, bbox, has_ll_mark). 'll' marks are separate spans placed right after the name."""
    spans = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for s in line["spans"]:
                spans.append((s["text"], s["bbox"]))
    marks = [bb for t, bb in spans if t.strip() == "ll"]
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(s["text"] for s in line["spans"])
            if text.strip() == "ll":
                continue
            x0, y0, x1, y1 = line["bbox"]
            # The mark is a superscript that starts exactly where the name (with its trailing space) ends.
            has_ll = any(abs(m[0] - x1) < 4 and m[1] < y1 and m[3] > y0 for m in marks)
            lines.append((text, line["bbox"], has_ll))
    return lines


def main(pdf_path: str, cls: str, source: str) -> None:
    lines = []
    for page in fitz.open(pdf_path):
        lines += page_lines(page)
    starts = [i for i, (t, _, _) in enumerate(lines) if t.strip() == f"{cls} Spell List"]
    if not starts:
        sys.exit(f'Section "{cls} Spell List" not found')

    levels: dict[str, list[dict]] = {}
    current = None
    for text, _bbox, has_ll in lines[starts[0] + 1:]:
        line = text.strip()
        if not line or line == f"{cls} Spell List":
            continue
        m = LEVEL.match(line)
        if m:
            current = m.group(1) or "0"
            levels.setdefault(current, [])
            continue
        if current is None:
            continue  # intro paragraph
        entry = {}
        mark = re.search(r"\s*(\*{1,2})$", line)
        if mark:
            entry["book"] = "XGE" if mark.group(1) == "*" else "TCE"
            line = line[: mark.start()]
        if re.search(r"\s*\(r\)$", line):
            entry["ritual"] = True
            line = re.sub(r"\s*\(r\)$", "", line)
        name = line.strip()
        if not NAME.match(name):
            if levels.get("9"):
                break  # end of the list
            continue
        if has_ll:
            entry["ll"] = True
        levels[current].append({"name": name, **entry})

    out = pathlib.Path(__file__).resolve().parent.parent / "data" / "laserllama" / "class-lists" / f"{cls.lower()}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"class": cls, "source": source, "levels": levels}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(len(v) for v in levels.values())
    marked = sum(1 for v in levels.values() for e in v if e.get("ll"))
    print(out, {k: len(v) for k, v in levels.items()}, f"total {total}, ll-marked {marked}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
