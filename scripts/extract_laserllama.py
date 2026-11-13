"""Extract Laserllama "Compendium of Spells" (GM Binder PDF) into structured JSON.

Usage: python scripts/extract_laserllama.py <pdf> <out.json> <report.txt>

The PDF is a GM Binder export: body text uses Type3 fonts, headings are duplicated
(real font + Type3 copy). We drop the Type3 duplicates, rebuild lines per column,
and run a small state machine. Every character of every kept span is accounted
for; the script fails loudly if anything is left unassigned.
"""
import html
import json
import re
import sys

import pymupdf

PDF, OUT, REPORT = sys.argv[1:4]
COL_SPLIT = 297.0
DUP_TYPE3 = {33, 34, 39, 43, 66, 142, 143, 145, 146, 147, 148}

report = []


def log(*a):
    report.append(" ".join(str(x) for x in a))


def classify(span):
    f, sz, fl = span["font"], round(span["size"], 1), span["flags"]
    m = re.match(r"Type3 \((\d+) 0 R\)$", f)
    if m:
        n = int(m.group(1))
        if n in DUP_TYPE3:
            return None
        if n == 35:
            return ("t", "r")
        if n == 36:
            return ("t", "i") if sz > 8 else ("idxA", "i")
        if n == 37:
            return ("t", "b")
        if n == 65:
            return ("t", "bi")
        if n == 38:
            return ("idxhead", "r")
        raise ValueError(f"unknown Type3 font {f} {sz} {span['text']!r}")
    if f == "Mr.EavesSmallCaps":
        if sz > 25:
            return ("title", "r")
        if sz > 18:
            return ("subtitle", "r")
        if sz > 14:
            return ("section", "r")
        if sz > 12:
            return ("heading", "r")
        if sz < 7:
            return ("alt", "r")
    if f.startswith("ScalySans"):
        style = ("b" if fl & 16 else "") + ("i" if fl & 2 else "") or "r"
        if sz >= 13.5 or 9.4 <= sz <= 9.6:
            return ("sbname", style)
        if 12.0 <= sz <= 12.4 or 8.75 <= sz <= 8.85:
            return ("sbsec", style)
        if 9.75 <= sz <= 9.85:
            return ("sb", style)
        if 9.65 <= sz < 9.75:
            return ("tbl", style)
        if 8.6 <= sz < 8.75:
            return ("side", style)
        if 6.5 <= sz <= 6.7:
            return ("sbab", style)
        if 5.7 <= sz <= 5.9:
            return ("sblabel", style)
        if 11.6 <= sz <= 11.8:
            return ("sideheading", style)
    if f.startswith("TimesNewRoman"):
        return ("inherit", "r")
    raise ValueError(f"unknown font {f} {sz} {span['text']!r}")


class Span:
    __slots__ = ("kind", "style", "text", "x0", "y0", "x1", "y1", "base", "page", "col", "size", "color")

    def __init__(self, s, kind, style, page):
        self.kind, self.style, self.text = kind, style, s["text"]
        self.x0, self.y0, self.x1, self.y1 = s["bbox"]
        self.base = s["origin"][1]
        self.page = page
        self.col = 0 if self.x0 < COL_SPLIT else 1
        self.size = round(s["size"], 1)
        self.color = s["color"]


TOTAL_CHARS = 0
EMITTED_CHARS = 0


def nonspace_len(t):
    return len(re.sub(r"\s+", "", t))


def load_pages():
    global TOTAL_CHARS
    pages = []
    for pno in range(len(doc)):
        spans = []
        for b in doc[pno].get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                for s in l["spans"]:
                    k = classify(s)
                    if k is None:
                        continue
                    sp = Span(s, k[0], k[1], pno + 1)
                    spans.append(sp)
                    TOTAL_CHARS += nonspace_len(sp.text)
        pages.append(spans)
    return pages


def build_lines(spans, colfn=None):
    """Group spans of one page into lines per column, in reading order."""
    out = []
    colfn = colfn or (lambda s: s.col)
    for col in sorted({colfn(s) for s in spans}):
        cs = sorted((s for s in spans if colfn(s) == col and s.kind not in ("alt", "idxA")), key=lambda s: (s.base, s.x0))
        lines = []
        for s in cs:
            if lines and abs(lines[-1][-1].base - s.base) <= 2.2:
                lines[-1].append(s)
            else:
                lines.append([s])
        for ln in lines:
            ln.sort(key=lambda s: s.x0)
            # resolve "inherit" (fallback glyph font) to neighbour's kind/style
            for i, s in enumerate(ln):
                if s.kind == "inherit":
                    nb = ln[i - 1] if i > 0 else (ln[i + 1] if i + 1 < len(ln) else None)
                    s.kind = nb.kind if nb else "t"
            out.append(ln)
    return out


def line_kind(ln):
    kinds = [s.kind for s in ln if s.text.strip()]
    return kinds[0] if kinds else ln[0].kind


def line_text(ln):
    return "".join(s.text for s in ln)


def esc(t):
    return html.escape(t, quote=False)


def runs_to_html(runs):
    """runs: list of (style, text). Merge same-style runs, emit inline HTML."""
    merged = []
    for st, tx in runs:
        if merged and merged[-1][0] == st:
            merged[-1][1] += tx
        else:
            merged.append([st, tx])
    out = []
    for st, tx in merged:
        # keep surrounding whitespace outside of the tags
        m = re.match(r"^(\s*)(.*?)(\s*)$", tx, re.S)
        lead, core, trail = m.groups()
        if not core:
            out.append(tx)
            continue
        e = esc(core)
        if st == "b":
            e = f"<strong>{e}</strong>"
        elif st == "i":
            e = f"<em>{e}</em>"
        elif st in ("bi", "ib"):
            e = f"<strong><em>{e}</em></strong>"
        out.append(lead + e + trail)
    return "".join(out).strip()


HYPHEN_JOINS = []


def append_line_runs(runs, ln_runs):
    """Append a visual line to a paragraph's runs, joining with a single space."""
    if not ln_runs:
        return
    if runs:
        prev_text = runs[-1][1]
        # strip trailing whitespace of previous line and leading whitespace of new line
        runs[-1][1] = prev_text.rstrip()
        first_st, first_tx = ln_runs[0]
        ln_runs = [[first_st, first_tx.lstrip()]] + [list(r) for r in ln_runs[1:]]
        if runs[-1][1].endswith(("-", "–", "—", "/")):
            HYPHEN_JOINS.append(runs[-1][1][-30:] + "|" + ln_runs[0][1][:30])
            # A line broken right after a dash/slash: browsers break after existing
            # hyphens only, so no space was there in the source.
            pass
        else:
            runs[-1][1] += " "
        runs.extend(ln_runs)
    else:
        ln_runs = [list(r) for r in ln_runs]
        ln_runs[0][1] = ln_runs[0][1].lstrip()
        runs.extend(ln_runs)


def spans_runs(ln):
    return [[s.style, s.text] for s in ln]


LEVEL_RE = re.compile(
    r"^(?:(?P<school>[A-Za-z]+) Cantrip|(?P<lvl>\d)(?:st|nd|rd|th)-level (?P<school2>[A-Za-z]+))(?P<ritual> \([Rr]itual\))?\s*$"
)


def parse_level_line(t):
    m = LEVEL_RE.match(t.strip())
    if not m:
        return None
    if m.group("school"):
        return 0, m.group("school"), bool(m.group("ritual"))
    return int(m.group("lvl")), m.group("school2"), bool(m.group("ritual"))


doc = pymupdf.open(PDF)
pages = load_pages()

# ---------------------------------------------------------------- page 1: index + notes
index_entries = []  # (level_heading, name, alt_marker)
notes = []
p1 = pages[0]
idx_markers = [s for s in p1 if s.kind == "idxA"]
EMITTED_CHARS += sum(nonspace_len(s.text) for s in idx_markers)
cur_idx_head = None
note_cur = None
page1_intro = []
P1_SUBCOLS = (160.0, COL_SPLIT, 430.0)


def p1_col(s):
    if s.kind in ("side", "heading", "section") or (s.kind == "inherit" and s.x0 > COL_SPLIT):
        return 9  # sidebar box
    return sum(s.x0 >= b for b in P1_SUBCOLS)


for ln in build_lines(p1, p1_col):
    k = line_kind(ln)
    t = line_text(ln)
    if k in ("title", "subtitle"):
        notes.append({"type": k, "text": t.strip()})
        EMITTED_CHARS += nonspace_len(t)
    elif k == "idxhead":
        cur_idx_head = t.strip()
        EMITTED_CHARS += nonspace_len(t)
    elif k == "t" and ln[0].style == "i" and cur_idx_head:
        name = t.strip()
        y = ln[0].y0
        marks = [m for m in idx_markers if p1_col(m) == p1_col(ln[0]) and abs(m.y0 - y) < 4 and m.x0 > ln[0].x0]
        index_entries.append({"section": cur_idx_head, "name": name, "alt": bool(marks)})
        EMITTED_CHARS += nonspace_len(t)
    elif k == "t":
        page1_intro.append(ln)
    elif k in ("side", "heading", "section"):
        if k in ("heading", "section"):
            note_cur = {"type": "note", "level": k, "title": t.strip(), "runs": []}
            notes.append(note_cur)
            EMITTED_CHARS += nonspace_len(t)
        else:
            if note_cur is None:
                note_cur = {"type": "note", "title": None, "runs": []}
                notes.append(note_cur)
            append_line_runs(note_cur["runs"], spans_runs(ln))
            EMITTED_CHARS += nonspace_len(t)
    else:
        raise ValueError(f"page1 unexpected line kind {k}: {t!r}")
intro_runs = []
for ln in page1_intro:
    # the intro mentions the 'A' marker inline – keep it
    append_line_runs(intro_runs, spans_runs(ln))
    EMITTED_CHARS += nonspace_len(line_text(ln))
notes.insert(2, {"type": "intro", "html": runs_to_html(intro_runs)})
for n in notes:
    if "runs" in n:
        n["html"] = runs_to_html(n.pop("runs"))
log(f"index entries: {len(index_entries)}; alt-marked: {sum(e['alt'] for e in index_entries)}; idx markers: {len(idx_markers)}")

# ---------------------------------------------------------------- spells
spells = []
cur = None
mode = None  # 'intro' | 'level' | 'props' | 'body' | 'table' | 'sb'
para = None  # current paragraph runs
blocks = None  # current spell blocks
last_base = None
table = None
sb = None
SECTION_INTRO = re.compile(
    r"^The following (?:0-level cantrips|\d(?:st|nd|rd|th)-level spells) are listed in alphabetical order\.\s*Alternate versions of official spells are marked with\s*ALT\s*\.$"
)
section_intro_text = []
current_section = None
stop = False


def flush_para():
    global para
    if para:
        blocks.append({"type": "p", "html": runs_to_html(para)})
    para = None


def flush_table():
    global table
    if table:
        blocks.append({"type": "table", "rows": table["rows"]})
    table = None


def flush_sb():
    global sb
    if sb:
        if sb.get("_entry") is not None:
            sb["_sec"]["entries"].append(runs_to_html(sb.pop("_entry")))
        sb.pop("_entry", None)
        if sb.get("_prop") is not None:
            sb["_props"].append(runs_to_html(sb.pop("_prop")))
        sb.pop("_prop", None)
        sb.pop("_sec", None)
        blocks.append({"type": "statblock", **{k: v for k, v in sb.items() if not k.startswith("_")},
                       "props": sb["_props"]})
    sb = None


def flush_all():
    flush_para()
    flush_table()
    flush_sb()


def finish_spell():
    global cur
    if cur:
        flush_all()
        cur["blocks"] = blocks
        spells.append(cur)
    cur = None


def table_add_line(ln):
    """Tables: header row is bold; columns assigned by nearest header center."""
    global table
    cells = []
    for s in ln:
        if not s.text.strip():
            continue
        if cells and s.x0 - cells[-1]["x1"] < 6:
            cells[-1]["text"] += s.text
            cells[-1]["x1"] = s.x1
        else:
            cells.append({"text": s.text, "x0": s.x0, "x1": s.x1, "bold": "b" in s.style})
    if table is None:
        table = {"rows": [], "centers": [], "last_base": None}
    base = ln[0].base
    if not table["centers"]:
        if not all(c["bold"] for c in cells):
            log(f"WARN table without bold header on page {ln[0].page}: {[c['text'] for c in cells]}")
        table["centers"] = [(c["x0"] + c["x1"]) / 2 for c in cells]
        table["rows"].append({"head": True, "cells": [c["text"].strip() for c in cells]})
        table["last_base"] = base
        return
    ncol = len(table["centers"])
    row = [""] * ncol
    for c in cells:
        cx = (c["x0"] + c["x1"]) / 2
        # pick header column whose center is nearest, but cells are left/center aligned
        j = min(range(ncol), key=lambda i: abs(table["centers"][i] - cx))
        row[j] = (row[j] + " " + c["text"].strip()).strip()
    gap = base - table["last_base"] if table["last_base"] is not None else 99
    if gap < 13 and len(table["rows"]) > 1:
        # wrapped continuation of the previous row
        prev = table["rows"][-1]["cells"]
        for j in range(ncol):
            if row[j]:
                prev[j] = (prev[j] + " " + row[j]).strip()
        log(f"table continuation line merged on page {ln[0].page}: {row}")
    else:
        table["rows"].append({"head": False, "cells": row})
    table["last_base"] = base


ABIL = re.compile(r"^(Str|Dex|Con|Int|Wis|Cha)$")


def sb_add_line(ln):
    global sb
    k = line_kind(ln)
    t = line_text(ln)
    if k == "sbname":
        if sb.get("name"):
            raise ValueError(f"second stat block name in one block: {t!r}")
        # small-caps names come as pieces ("A", "nimated", " O", "bject") plus stray
        # whitespace-only spans; drop the latter and concatenate the rest
        sb["name"] = re.sub(r"\s+", " ", "".join(s.text for s in ln if s.text.strip())).strip()
        return
    if k == "sblabel":
        if t.strip() not in ("MOD SAVE", "MOD", "SAVE", "MODSAVE") and not re.fullmatch(r"(MOD\s*SAVE\s*)+", t.strip()):
            log(f"WARN unexpected sblabel {t!r}")
        sb["_labels"] = True
        return
    has_ab = any(s.kind == "sbab" for s in ln)
    if has_ab:
        # ability grid line: name pieces (bold 9.8 + bold 6.6) then 3 numbers
        toks = []
        for s in ln:
            if not s.text.strip():
                continue
            if s.kind == "sbab" or ("b" in s.style and s.kind == "sb"):
                if toks and toks[-1][0] == "name" and s.kind == "sbab":
                    toks[-1][1] += s.text.strip()
                else:
                    toks.append(["name", s.text.strip()])
            else:
                toks.append(["val", s.text.strip()])
        cur_ab = None
        for kind, v in toks:
            if kind == "name":
                cur_ab = {"ab": v, "vals": []}
                sb["abilities"].append(cur_ab)
            else:
                cur_ab["vals"].append(v)
        return
    if k == "sbsec":
        if sb.get("_entry") is not None:
            sb["_sec"]["entries"].append(runs_to_html(sb.pop("_entry")))
        if sb.get("_prop") is not None:
            sb["_props"].append(runs_to_html(sb.pop("_prop")))
        sb["_prop"] = None
        sec = {"title": re.sub(r"\s+", " ", "".join(s.text for s in ln if s.text.strip())).strip(), "entries": []}
        sb["sections"].append(sec)
        sb["_sec"] = sec
        sb["_entry"] = None
        return
    if k != "sb":
        raise ValueError(f"unexpected line in stat block p{ln[0].page}: {k} {t!r}")
    first = next(s for s in ln if s.text.strip())
    if first.style == "i" and not sb.get("subtitle") and not sb["_props"] and sb.get("_prop") is None:
        sb["subtitle"] = t.strip()
        return
    starts_bold = "b" in first.style
    if sb.get("_sec") is None:
        # property lines (AC/HP/Speed/Senses/...): bold label starts a new one
        if starts_bold:
            if sb.get("_prop") is not None:
                sb["_props"].append(runs_to_html(sb["_prop"]))
            sb["_prop"] = []
            # properties after the ability grid get a marker so we can keep order
            if sb["abilities"] and not sb.get("_after_marked"):
                sb["_props"].append("<!--abilities-->")
                sb["_after_marked"] = True
        elif sb.get("_prop") is None:
            raise ValueError(f"stat block continuation without property p{ln[0].page}: {t!r}")
        append_line_runs(sb["_prop"], spans_runs(ln))
    else:
        if starts_bold and first.style in ("bi", "b"):
            if sb.get("_entry") is not None:
                sb["_sec"]["entries"].append(runs_to_html(sb["_entry"]))
            sb["_entry"] = []
        elif sb.get("_entry") is None:
            raise ValueError(f"stat block entry continuation without entry p{ln[0].page}: {t!r}")
        append_line_runs(sb["_entry"], spans_runs(ln))


alt_markers = []
for pno, spans in enumerate(pages[1:], start=2):
    if stop:
        # account for the remaining (license) pages separately
        break
    markers = [s for s in spans if s.kind == "alt"]
    alt_markers.extend(markers)
    EMITTED_CHARS += sum(nonspace_len(s.text) for s in markers)
    prev_col = None
    page_lines = build_lines(spans)
    for li, ln in enumerate(page_lines):
        k = line_kind(ln)
        t = line_text(ln)
        col = ln[0].col
        if k == "heading" and cur is not None:
            # a heading not followed by a level/school line is a sub-heading inside a spell
            nxt = page_lines[li + 1] if li + 1 < len(page_lines) else None
            if nxt is not None and parse_level_line(line_text(nxt)) is None:
                flush_all()
                blocks.append({"type": "h", "text": t.strip()})
                mode = "body"
                para = None
                last_base = None
                EMITTED_CHARS += nonspace_len(t)
                prev_col = (pno, col)
                continue
        col_x = 46.9 if col == 0 else 311.5
        new_column = (pno, col) != prev_col
        prev_col = (pno, col)
        if k in ("section", "idxhead", "sideheading") and t.strip().lower() == "license":
            stop = True
            license_page = pno
            break
        if k == "section":
            finish_spell()
            current_section = t.strip()
            mode = "intro"
            section_intro_text.append([])
            EMITTED_CHARS += nonspace_len(t)
            continue
        if k == "heading":
            finish_spell()
            name = t.strip()
            marks = [m for m in markers if m.col == col and abs(m.y0 - ln[0].y0) < 4 and m.x0 > ln[0].x0]
            cur = {"name": name, "alt": bool(marks), "page": pno, "section": current_section}
            blocks = []
            para = None
            mode = "level"
            EMITTED_CHARS += nonspace_len(t)
            continue
        if mode == "intro":
            if k != "t":
                raise ValueError(f"unexpected in section intro p{pno}: {k} {t!r}")
            section_intro_text[-1].append(t)
            EMITTED_CHARS += nonspace_len(t)
            continue
        if cur is None:
            raise ValueError(f"text outside spell p{pno}: {k} {t!r}")
        EMITTED_CHARS += nonspace_len(t)
        if mode == "level":
            lv = parse_level_line(t)
            if lv is None or ln[0].style != "i":
                raise ValueError(f"bad level line p{pno} {cur['name']}: {t!r}")
            cur["levelSchool"] = t.strip()
            cur["level"], cur["school"], cur["ritual"] = lv
            cur["props"] = []
            mode = "props"
            continue
        if mode == "props":
            first = ln[0]
            if k == "t" and first.style == "b" and first.text.strip().endswith(":"):
                cur["props"].append([first.text.strip()[:-1], "".join(s.text for s in ln[1:]).strip()])
                continue
            if k == "t" and first.x0 > col_x + 4 and first.style == "r" and cur["props"]:
                cur["props"][-1][1] = (cur["props"][-1][1] + " " + t.strip()).strip()
                continue
            mode = "body"
            last_base = None
            # fall through to body handling, first paragraph starts here
        if k == "tbl":
            flush_para()
            flush_sb()
            if mode != "table":
                flush_table()
            mode = "table"
            table_add_line(ln)
            continue
        if k in ("sbname", "sb", "sbsec", "sblabel") or any(s.kind == "sbab" for s in ln):
            flush_para()
            flush_table()
            if k == "sbname" and sb is not None and sb.get("name"):
                flush_sb()
            if sb is None:
                sb = {"name": None, "subtitle": None, "abilities": [], "sections": [], "_props": [], "_prop": None, "_sec": None, "_entry": None}
            mode = "sb"
            sb_add_line(ln)
            continue
        if k == "t":
            if mode in ("table", "sb"):
                flush_table()
                flush_sb()
                mode = "body"
                last_base = None
            indented = ln[0].x0 >= col_x + 5
            gap = (ln[0].base - last_base) if (last_base is not None and not new_column) else 0
            if para is None or indented or gap > 13.5:
                flush_para()
                para = []
            append_line_runs(para, spans_runs(ln))
            last_base = ln[0].base
            mode = "body"
            continue
        raise ValueError(f"unhandled line p{pno} kind={k}: {t!r}")
finish_spell()

# license text: account for its characters (not emitted, we only keep the reference)
license_chars = 0
for spans in pages[license_page - 1:]:
    license_chars += sum(nonspace_len(s.text) for s in spans)
# the license page may contain trailing body of the last spell before "License" heading
# (handled above, since we break only when the heading is reached). Count only spans
# after the heading on that page:
lp = pages[license_page - 1]
lines_lp = build_lines(lp)
seen_heading = False
before = 0
for ln in lines_lp:
    t = line_text(ln)
    if line_kind(ln) in ("section", "idxhead", "sideheading") and t.strip().lower() == "license":
        seen_heading = True
    if not seen_heading:
        before += nonspace_len(t)
license_chars -= before

for i, it in enumerate(section_intro_text):
    joined = re.sub(r"\s+", " ", " ".join(it)).strip()
    if not SECTION_INTRO.match(joined):
        log(f"WARN unexpected section intro #{i}: {joined!r}")

# ---------------------------------------------------------------- checks
emitted_check = EMITTED_CHARS + license_chars
log(f"chars total={TOTAL_CHARS} accounted={emitted_check} (license={license_chars})")
if emitted_check != TOTAL_CHARS:
    log("ERROR: character accounting mismatch!")

log(f"spells: {len(spells)}; alt: {sum(s['alt'] for s in spells)}; alt markers on pages: {len(alt_markers)}")
idx_names = [(e["name"].lower().strip(), e["alt"]) for e in index_entries]
sp_names = [(s["name"].lower().strip(), s["alt"]) for s in spells]
log("in index but not parsed:", sorted(set(n for n, _ in idx_names) - set(n for n, _ in sp_names)))
log("parsed but not in index:", sorted(set(n for n, _ in sp_names) - set(n for n, _ in idx_names)))
idx_alt = {n: a for n, a in idx_names}
log("alt flag differs (name, index, body):", [(n, idx_alt.get(n), a) for n, a in sp_names if n in idx_alt and idx_alt[n] != a])
log("hyphen/slash line joins (no space inserted):")
for h in HYPHEN_JOINS:
    log("   ", h)
for s in spells:
    pk = [p[0] for p in s["props"]]
    if pk != ["Classes", "Casting Time", "Range", "Components", "Duration"]:
        log(f"WARN props of {s['name']}: {pk}")

json.dump({"source": "Laserllama Compendium of Spells v.0.5 (GM Binder)", "notes": notes, "index": index_entries, "spells": spells},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
open(REPORT, "w", encoding="utf-8").write("\n".join(report) + "\n")
print("\n".join(report[:12]))
