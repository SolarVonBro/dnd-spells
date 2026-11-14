"""Extract the spellcasting part of a Laserllama class table (GM Binder PDF export).

Usage (PyMuPDF required):
    python -P -E scripts/extract_class_table.py "<path to PDF>" Druid "Laserllama: Alternate Druid" cantrips,slots,-

The last argument lists the numeric columns of the class table that follow the Features column, left to right:
    cantrips - Cantrips Known        known - Spells Known        slots - the nine "1st ... 9th" spell slot columns
    -        - any other column (skipped)
Writes data/laserllama/class-tables/<class>.json:
    {"class", "source", "progression", "ability", "prepared", "cantrips", "known", "slots"}
  progression - how the class adds to multiclass spell slots: full | 1/2 | 1/3 (from the "Multiclassing" sidebar)
  ability     - spellcasting ability: int | wis | cha
  prepared    - "level" (ability modifier + class level) or "half" (+ half the class level), null if the class knows spells
"""
import json
import pathlib
import re
import sys

import fitz  # PyMuPDF

ROW = re.compile(r"^(\d{1,2})(?:st|nd|rd|th)$")
ABILITY = {"intelligence": "int", "wisdom": "wis", "charisma": "cha"}


def value(token: str) -> int | None:
    """A table cell: a number, or a dash (any non-digit single character, e.g. the GM Binder em dash glyph)."""
    t = token.strip()
    if re.fullmatch(r"\d{1,2}", t):
        return int(t)
    if len(t) == 1 and not t.isalnum():
        return 0
    return None


def main(pdf_path: str, cls: str, source: str, columns: str) -> None:
    text = "".join(page.get_text() for page in fitz.open(pdf_path))
    flat = re.sub(r"\s+", " ", text)
    tokens = [t.strip() for t in text.split("\n") if t.strip()]

    spec: list[str] = []
    for c in columns.split(","):
        spec += ["slot"] * 9 if c == "slots" else [c]
    if spec.count("slot") != 9:
        sys.exit("columns must include 'slots' once")

    # Rows: "<n>th" followed by the proficiency bonus "+N"; the row's numeric cells are its last len(spec) tokens.
    starts = [i for i, t in enumerate(tokens[:-1]) if ROW.match(t) and re.fullmatch(r"\+\d", tokens[i + 1])]
    rows: dict[int, list[int]] = {}
    for n, i in enumerate(starts):
        level = int(ROW.match(tokens[i]).group(1))
        end = starts[n + 1] if n + 1 < len(starts) else None
        if end is None:  # last row: take tokens up to the first one that is not a cell after the features
            cells = []
            for t in tokens[i + 2:]:
                v = value(t)
                if v is None and cells:
                    break
                if v is not None:
                    cells.append(v)
            cells = cells[-len(spec):] if len(cells) >= len(spec) else cells
        else:
            cells = [value(t) for t in tokens[i + 2:end]][-len(spec):]
        if len(cells) != len(spec) or any(v is None for v in cells):
            sys.exit(f"row {level}: cannot read {len(spec)} numeric cells")
        rows.setdefault(level, cells)  # the first table in the document is the class table
    if sorted(rows) != list(range(1, 21)):
        sys.exit(f"class table rows found: {sorted(rows)}")

    col = lambda name: [rows[lv][spec.index(name)] for lv in range(1, 21)] if name in spec else None
    slots = [[rows[lv][j] for j, c in enumerate(spec) if c == "slot"] for lv in range(1, 21)]

    m = re.search(r"Spellcasting\. Add (all|half|one third) of your levels in the " + cls, flat)
    if not m:
        sys.exit("Multiclassing sidebar: spell slot rule not found")
    progression = {"all": "full", "half": "1/2", "one third": "1/3"}[m.group(1)]
    m = re.search(r"(Intelligence|Wisdom|Charisma) is your spellcasting ability", flat)
    if not m:
        sys.exit("spellcasting ability not found")
    ability = ABILITY[m.group(1).lower()]
    prepared = None
    if re.search(r"prepare the list of " + cls + r" spells", flat):
        prepared = "half" if re.search(r"half your " + cls + r" level", flat) else "level"
        if not re.search(r"modifier \(minimum of 1\) \+ (?:half )?your " + cls + r" level", flat):
            sys.exit("prepared spells formula not recognized")

    out = pathlib.Path(__file__).resolve().parent.parent / "data" / "laserllama" / "class-tables" / f"{cls.lower()}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    data = {"class": cls, "source": source, "progression": progression, "ability": ability, "prepared": prepared,
            "cantrips": col("cantrips"), "known": col("known"), "slots": slots}
    out.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
    print(out, progression, ability, prepared, "cantrips", data["cantrips"], "slots at 20th", slots[19])


if __name__ == "__main__":
    main(*sys.argv[1:5])
