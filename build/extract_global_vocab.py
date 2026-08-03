#!/usr/bin/env python3
"""Harvest REAL term/definition pairs for Global History 9R and merge them into
data/global.json.

Sources (verbatim text only, nothing invented):
  1. Global_9R_V2/Unit_NN_*/Lesson_*/Student_Handout.docx
     Each handout carries a single "Vocabulary - term - def.  term - def." line.
  2. The taught-corpus file "GH intro terms Def.docx" (Unit 00 / Unit 01 intro terms).

Every definition emitted here exists literally in a source file.
"""

import glob
import html
import json
import os
import re
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(REPO, "data", "global.json")

V2 = ("/Volumes/CURRICULA/Curriculum_Agent_Workspace_2026_2027/"
      "06_Generated_Curricula/Global_9R_V2")
INTRO_DEF = ("/Volumes/CURRICULA/MAC2025_BACKUP_2026-05-06/Curricula/"
             "9th global1/Global/Global 9/Intro/GH intro terms Def.docx")

EN = "–"
EM = "—"


def docx_lines(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf8")
    xml = re.sub(r"</w:p>", "\n", xml)
    text = html.unescape(re.sub(r"<[^>]+>", "", xml))
    return [ln.strip() for ln in text.split("\n")]


def ok(term, definition):
    """Quality guard. Reject anything that does not look like a real gloss."""
    if not term or not definition:
        return False
    if len(term) > 60 or len(term.split()) > 6:
        return False
    words = definition.split()
    if len(words) < 8:
        return False
    lower = [w for w in words if w[:1].islower()]
    if len(lower) < 4:
        return False
    # bare date range or a term-looking fragment
    if re.fullmatch(r"[\d\s–—\-.,()BCEbce]+", definition):
        return False
    if definition.rstrip(".").lower() == term.lower():
        return False
    return True


def clean(s):
    return re.sub(r"\s+", " ", s).strip(" .;,–—").strip()


def harvest_handouts():
    """Return {unit_id: [(term, definition), ...]}"""
    out = {}
    files = sorted(f for f in glob.glob(os.path.join(V2, "Unit_*", "Lesson_*",
                                                     "Student_Handout.docx"))
                   if "/._" not in f)
    for path in files:
        unit = re.search(r"/Unit_(\d\d)_", path).group(1)
        for line in docx_lines(path):
            if not line.lower().startswith("vocabulary"):
                continue
            body = re.sub(r"^vocabulary\s*[%s%s:-]*\s*" % (EM, EN), "",
                          line, flags=re.I)
            for chunk in re.split(r"\s{2,}", body):
                chunk = chunk.strip()
                if not chunk or EN not in chunk:
                    continue
                term, _, definition = chunk.partition(EN)
                term, definition = clean(term), clean(definition)
                if ok(term, definition):
                    out.setdefault(unit, []).append((term, definition + "."))
    return out


def harvest_intro():
    """The taught-corpus intro terms sheet: term line then definition line(s)."""
    pairs = []
    if not os.path.exists(INTRO_DEF):
        return pairs
    lines = [ln for ln in docx_lines(INTRO_DEF)]
    known = ["History", "Geography", "Pre-History", "Paleolithic Era",
             "Neolithic Era", "Migration", "Nomadic", "Agriculture",
             "Scarcity", "Culture", "Sedentary", "Society"]
    idx = {}
    for i, ln in enumerate(lines):
        if ln in known and ln not in idx:
            idx[ln] = i
    for term, i in idx.items():
        buf = []
        for ln in lines[i + 1:i + 8]:
            if ln in known:
                break
            if ln:
                buf.append(ln)
            elif buf:
                break
        definition = clean(" ".join(buf))
        if ok(term, definition):
            pairs.append((term, definition + "."))
    return pairs


def main():
    with open(JSON_PATH) as fh:
        data = json.load(fh)

    by_unit = harvest_handouts()
    intro = harvest_intro()
    if intro:
        by_unit.setdefault("01", []).extend(intro)

    units = {u["id"]: u for u in data["units"]}
    added = {}
    for uid, pairs in sorted(by_unit.items()):
        unit = units.get(uid)
        if unit is None:
            continue
        topic = unit["topics"][0]
        vocab = topic.setdefault("vocab", [])
        seen = {v["term"].lower() for v in vocab}
        n = 0
        for term, definition in pairs:
            key = term.lower()
            if key in seen:
                continue
            seen.add(key)
            vocab.append({"term": term, "def": definition})
            n += 1
        unit["counts"]["terms"] = sum(len(t.get("vocab", []))
                                      for t in unit["topics"])
        added[uid] = n

    with open(JSON_PATH, "w") as fh:
        json.dump(data, fh, indent=1, ensure_ascii=False)
        fh.write("\n")

    for uid in sorted(units):
        print("Unit %s: +%-4d total terms %d" %
              (uid, added.get(uid, 0), units[uid]["counts"]["terms"]))
    print("TOTAL ADDED:", sum(added.values()))


if __name__ == "__main__":
    main()
