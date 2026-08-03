#!/usr/bin/env python3
"""Build data/global.json for the review-only Global History 9R site.

Read-only. Sources:
  1. standards_crosswalk_Global_9R.json   (authoritative 178-lesson spine)
  2. Global_9R_V2/**/Build_Manifest.json  (human punctuated topic strings)
  3. Global_9R_V2/**/_build.py            (AIM + primary source excerpts, via ast)
  4. Maue 9H corpus "Unit N Key Terms *.docx" (vocabulary)

REVIEW ONLY. No tests, no quiz items, no answer keys, no rubrics, no scoring.
Files matching the exclusion patterns below are never opened.
"""

import ast
import glob
import html
import json
import os
import re
import zipfile
from collections import Counter, OrderedDict

CROSSWALK = ("/Volumes/CURRICULA/Curriculum_Agent_Workspace_2026_2027/"
             "15_Standards_and_CEDs/standards_crosswalk_Global_9R.json")
V2 = ("/Volumes/CURRICULA/Curriculum_Agent_Workspace_2026_2027/"
      "06_Generated_Curricula/Global_9R_V2")
CORPUS = ("/Volumes/CURRICULA/MAC2025_BACKUP_2026-05-06/Curricula/9th global1/"
          "Maue 9H/Documents/Course")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "data", "global.json")

# ---------------------------------------------------------------- exclusions
# Applied to every path component.
PATH_EXCLUDE_RE = re.compile(r"(^\._)|(_Teacher_Keys_legacy)|(Teacher_Key)")
# Applied to the file name only, so that a unit folder such as
# "Unit_09_Final_Exam_Preparation_and_Year_End" is still readable while any
# exam, assessment, or answer key FILE is never opened.
FILE_EXCLUDE_RE = re.compile(
    r"([Ee]xam)|([Aa]ssessment)|(Unit_\d\d_Assessments_Manifest\.json)")
# "Key Terms" vocabulary worksheets are an explicitly named vocab source and
# are not answer keys; every other *Key* path is excluded.
KEY_RE = re.compile(r"Key")


def allowed(path):
    parts = [p for p in path.split(os.sep) if p]
    for part in parts:
        if PATH_EXCLUDE_RE.search(part):
            return False
        if KEY_RE.search(part) and "Key Terms" not in part:
            return False
    return not (parts and FILE_EXCLUDE_RE.search(parts[-1]))


def safe_glob(pattern):
    return sorted(p for p in glob.glob(pattern) if allowed(p))


# ------------------------------------------------------------------ prose
UNIT_BLURBS = {
    "00": "Opens the course with what history is, how historians read and question "
          "evidence, and a world map you build from memory.",
    "01": "Follows human origins and migration out of Africa, then the Neolithic "
          "Revolution and the tradeoffs that came with farming and settled life.",
    "02": "Looks at the four river valley civilizations and how irrigation, cities, "
          "writing, law, and religion built the first states.",
    "03": "Compares Hinduism, Buddhism, Confucianism, Daoism, Legalism, Judaism, "
          "Christianity, and Islam, and how each shaped social and political order.",
    "04": "Covers the classical world of Greece, Rome, Maurya and Gupta India, Qin "
          "and Han China, and the Maya, from golden ages to collapse.",
    "05": "Traces the trade networks that tied the postclassical world together, "
          "from the Silk Roads and Indian Ocean to trans Saharan gold and salt.",
    "06": "Examines postclassical power and faith, including feudal Europe, "
          "Byzantium, the caliphates, Tang and Song China, the Mongols, and the "
          "Black Death.",
    "07": "Surveys the world around 1400 and the transformation of western Europe "
          "through the Renaissance, Reformation, and Scientific Revolution, "
          "alongside the Aztec, Inca, and Ming states.",
    "08": "Follows the Age of Exploration, conquest in the Americas, the Columbian "
          "Exchange, the Atlantic slave trade, and the rise of mercantile "
          "companies.",
    "09": "Year end review that pulls the whole course together through skills "
          "practice, enduring issues writing, and a capstone research project.",
}

SUBTITLE = "One year of world history, from human origins to 1750"
NOTE = ("Aligned to the New York State Grade 9 Global History and Geography "
        "Key Ideas 9.1 to 9.10. Review material only, no test content.")


# ------------------------------------------------------------------ helpers
def title_case_unit(folder):
    """'Unit_02_River_Worlds_Cities_Law_Writing_and_State_Power' -> readable."""
    parts = folder.split("_")[2:]
    small = {"and", "or", "the", "of", "in", "a", "an", "to", "for"}
    out = []
    for i, w in enumerate(parts):
        lw = w.lower()
        out.append(lw if (i and lw in small) else (w if w.isupper() else w.capitalize()))
    return " ".join(out)


def no_dashes(text):
    """House style: no em dashes or en dashes in display prose.

    Ranges become " to ", everything else becomes a comma. Quoted primary
    source text is never passed through this, so quotations stay verbatim.
    """
    if not text:
        return text
    text = re.sub(r"\s*[–—]\s*(?=\d)", " to ", text)
    text = re.sub(r"(?<=\d)\s*[–—]\s*", " to ", text)
    text = re.sub(r"\s*[–—]\s*", ", ", text)
    text = re.sub(r",\s*,", ",", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def clip(text, limit=400):
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:.")
    return cut + " ..."


# ------------------------------------------------- _build.py constant harvest
SKIP_NAMES = {
    "HERE", "IMG", "LEDGER", "TITLE", "UNIT", "DATE", "DATE_WORDS", "DATEW",
    "SPEC", "ERA", "KICK", "SERIF", "SANS", "OUT", "OUTDIR", "BASE", "ROOT",
    "SUPP", "TEACHER", "SCHOOL", "LABEL", "LESSON", "LESSON_LABEL", "FONT",
}


def const_str(node, env):
    """Fold a literal string expression: str, implicit concat, BinOp +, f-string."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        a = const_str(node.left, env)
        b = const_str(node.right, env)
        if a is not None and b is not None:
            return a + b
        return None
    if isinstance(node, ast.JoinedStr):
        buf = []
        for v in node.values:
            if isinstance(v, ast.Constant) and isinstance(v.value, str):
                buf.append(v.value)
            elif isinstance(v, ast.FormattedValue):
                inner = v.value
                if isinstance(inner, ast.Name) and isinstance(env.get(inner.id), str):
                    buf.append(env[inner.id])
        return "".join(buf)
    if isinstance(node, ast.Name):
        val = env.get(node.id)
        return val if isinstance(val, str) else None
    return None


def harvest_build(path):
    """Return {'aim': str|None, 'sources': [{'text','credit'}]}."""
    try:
        tree = ast.parse(open(path, encoding="utf-8", errors="replace").read())
    except SyntaxError:
        return {"aim": None, "sources": []}

    env = OrderedDict()
    for node in tree.body:
        targets = []
        if isinstance(node, ast.Assign):
            targets = [t for t in node.targets if isinstance(t, ast.Name)]
            value = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            targets = [node.target]
            value = node.value
        else:
            continue
        if value is None:
            continue
        s = const_str(value, env)
        if s is None:
            continue
        for t in targets:
            env.setdefault(t.id, s)

    aim = env.get("AIM")
    aim = " ".join(aim.split()) if aim else None

    credits = {k: v for k, v in env.items()
               if k.endswith("_ATTR") or k.startswith("CRED_")}
    lone_credit = list(credits.values())[0] if len(credits) == 1 else None

    def credit_for(name):
        for cand in (name + "_ATTR", "CRED_" + name):
            if cand in credits:
                return credits[cand]
        if "_" in name:
            prefix = name.rsplit("_", 1)[0]
            for cand in (prefix + "_ATTR", "CRED_" + prefix):
                if cand in credits:
                    return credits[cand]
        return lone_credit

    sources = []
    seen = set()
    for name, val in env.items():
        if name in SKIP_NAMES or name in credits:
            continue
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
            continue
        text = " ".join(val.split())
        if len(text) < 80 or " " not in text:
            continue
        if text.startswith("/") or text.startswith("http"):
            continue
        if name in ("AIM", "DO_NOW"):
            continue
        key = text[:60]
        if key in seen:
            continue
        seen.add(key)
        cr = credit_for(name)
        sources.append({"text": clip(text),
                        "credit": " ".join(cr.split()) if cr else ""})
    return {"aim": aim, "sources": sources[:4]}


# -------------------------------------------------------------- docx vocab
W_T = re.compile(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", re.S)
TAGS = re.compile(r"<[^>]+>")


def docx_rows(path):
    """Yield rows of cell strings from a .docx, no third party libraries."""
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8", "replace")
    xml = xml.replace("</w:tc>", "\x01")
    xml = xml.replace("</w:p>", "\x02")
    xml = xml.replace("</w:tr>", "\x03")
    rows = []
    for raw_row in xml.split("\x03"):
        cells = []
        for raw_cell in raw_row.split("\x01"):
            lines = []
            for raw_p in raw_cell.split("\x02"):
                txt = "".join(W_T.findall(raw_p))
                txt = html.unescape(TAGS.sub("", txt)).strip()
                if txt:
                    lines.append(txt)
            cells.append(" ".join(lines).strip())
        rows.append([c for c in cells if c])
    return rows


HEADERS = {"term", "terms", "definition", "definitions", "word", "words",
           "key term", "key terms", "vocabulary", "meaning", "name", "period"}


def clean_term(s):
    return re.sub(r"\s+", " ", s).strip().strip(":").strip()


def looks_like_definition(text):
    """Guard against blank fill-in worksheets.

    The Key Terms documents are student worksheets: many rows are just a term
    next to an empty answer box, or a section header sitting beside another
    term. Only accept text that actually reads like a written definition, so we
    never present one term as the definition of another.
    """
    if ":" in text:                       # "Indus River: Monsoons:" style stub
        return False
    words = text.split()
    if len(words) < 8:
        return False
    if sum(1 for w in words[1:] if w[:1].islower()) < 3:
        return False
    if not re.match(r"^[A-Za-z]", text):
        return False
    if re.search(r"\d{3,4}\s*[-–]\s*\d{3,4}", text):   # a date range
        return False
    # header-ish: nearly every word capitalized
    caps = sum(1 for w in words if w[:1].isupper())
    if caps >= max(3, len(words) - 1):
        return False
    # needs some lowercase connective prose
    if not re.search(r"\b(a|an|the|of|to|in|is|are|was|were|that|which|who|"
                     r"for|by|and|with|from)\b", text.lower()):
        return False
    return True


def parse_key_terms(path):
    pairs = []
    for row in docx_rows(path):
        cand = []
        if len(row) >= 2:
            cand.append((row[0], " ".join(row[1:])))
        for cell in row:
            m = re.match(r"^([^:]{2,60}):\s*(.+)$", cell)
            if m:
                cand.append((m.group(1), m.group(2)))
        for term, definition in cand:
            term = clean_term(term)
            definition = re.sub(r"\s+", " ", definition).strip()
            if not term or not definition:
                continue
            if term.lower() in HEADERS or definition.lower() in HEADERS:
                continue
            if len(definition) < 8:
                continue
            if definition.lower() == term.lower():
                continue
            if re.match(r"^[_\W]+$", definition):
                continue
            if not looks_like_definition(definition):
                continue
            pairs.append({"term": term, "def": definition})
    # de-duplicate, keep first
    out, seen = [], set()
    for p in pairs:
        k = p["term"].lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(p)
    return out


CORPUS_TO_UNIT = {
    "1 Introduction to Global History and Geography": "00",
    "2 The Paleolithic and Neolithic Eras": "01",
    "3 The Development of Afro-Eurasian Civilization": "02",
    "4 Classical Civilizations": "04",
    "5 Post Classical Civilizations in the Middle East, Europe, and East Asia": "06",
    "6 The Mongol and Trans-Saharan Post Classical Societies": "05",
    "7 Post Classical Americas and Interhemispheric Exchange": "07",
    "8 The Birth of the Modern World": "08",
    "9 Review": "09",
}


def load_vocab():
    """Return {unit_id: [{term,def}]} plus a per corpus folder report."""
    vocab = {uid: [] for uid in CORPUS_TO_UNIT.values()}
    report = []
    for folder, uid in CORPUS_TO_UNIT.items():
        files = safe_glob(os.path.join(CORPUS, folder, "Unit * Key Terms *.docx"))
        got = []
        for f in files:
            try:
                got.extend(parse_key_terms(f))
            except Exception as exc:  # unreadable docx, keep going
                report.append((folder, "ERROR %s: %s" % (os.path.basename(f), exc)))
        seen = set()
        for p in got:
            k = p["term"].lower()
            if k not in seen:
                seen.add(k)
                vocab[uid].append(p)
        report.append((folder, "%d file(s) -> %d pair(s) -> unit %s"
                       % (len(files), len(vocab[uid]), uid)))
    return vocab, report


# ------------------------------------------------------------------- build
def load_manifests():
    """{date: {'topic':..., 'standards':[...], 'dir':...}} from Build_Manifest.json."""
    by_date = {}
    for mf in safe_glob(os.path.join(V2, "Unit_*", "Lesson_*", "Build_Manifest.json")):
        try:
            data = json.load(open(mf, encoding="utf-8"))
        except Exception:
            continue
        date = data.get("date")
        if not date:
            continue
        by_date.setdefault(date, []).append({
            "topic": (data.get("topic") or "").strip(),
            "standards": data.get("nys_standards") or [],
            "dir": os.path.dirname(mf),
        })
    return by_date


def main():
    spine = json.load(open(CROSSWALK, encoding="utf-8"))
    key_idea_titles = spine.get("key_idea_titles", {})
    manifests = load_manifests()
    vocab_by_unit, vocab_report = load_vocab()

    print("Key terms extraction:")
    for folder, msg in vocab_report:
        print("  %-72s %s" % (folder[:72], msg))
    print()

    build_cache = {}
    units_out = []
    total_lessons = 0
    total_terms = 0
    aim_hits = 0
    source_hits = 0

    for folder, blob in spine["units"].items():
        uid = folder.split("_")[1]
        lessons = blob.get("lessons", [])
        topics = OrderedDict()
        idea_counter = Counter()

        for les in lessons:
            date = les.get("date")
            title = (les.get("title") or "").strip()
            overview = ""
            sources = []

            cands = manifests.get(date, [])
            if len(cands) == 1:
                m = cands[0]
            else:
                m = None
                for c in cands:
                    if uid in os.path.basename(os.path.dirname(c["dir"])).split("_"):
                        m = c
                        break
                if m is None and cands:
                    m = cands[0]

            if m:
                if m["topic"]:
                    title = m["topic"]
                bpath = os.path.join(m["dir"], "_build.py")
                if os.path.exists(bpath) and allowed(bpath):
                    if bpath not in build_cache:
                        build_cache[bpath] = harvest_build(bpath)
                    h = build_cache[bpath]
                    overview = h["aim"] or ""
                    sources = h["sources"]

            if overview:
                aim_hits += 1
            if sources:
                source_hits += 1

            code = les.get("key_idea") or "9.0"
            idea_counter[code] += 1
            t_title = (key_idea_titles.get(code)
                       or les.get("key_idea_title") or "Review")
            topic = topics.setdefault(code, {
                "code": code, "title": no_dashes(t_title), "lessons": [],
                "vocab": [], "misconceptions": [],
            })

            lesson_obj = {
                "n": les.get("lesson"),
                "title": no_dashes(title),
                "date": date,
                "overview": no_dashes(overview),
                "objectives": [],
                "essentialQuestions": [],
            }
            if sources:
                lesson_obj["sources"] = sources
                first = sources[0]
                lesson_obj["source"] = {
                    "title": first["credit"] or clip(first["text"], 120),
                    "author": "",
                    "year": "",
                }
            topic["lessons"].append(lesson_obj)
            total_lessons += 1

        topic_list = list(topics.values())
        uvocab = vocab_by_unit.get(uid, [])
        if topic_list:
            topic_list[0]["vocab"] = uvocab
        total_terms += len(uvocab)
        dominant = idea_counter.most_common(1)[0][0] if idea_counter else "9.0"

        units_out.append({
            "id": uid,
            "title": no_dashes(title_case_unit(folder)),
            "blurb": UNIT_BLURBS.get(uid, ""),
            "weight": "NYS " + dominant,
            "topics": topic_list,
            "counts": {
                "topics": len(topic_list),
                "lessons": sum(len(t["lessons"]) for t in topic_list),
                "terms": len(uvocab),
            },
        })

    doc = {
        "id": "global",
        "accent": "global",
        "title": "Global History 9R",
        "subtitle": SUBTITLE,
        "note": NOTE,
        "specimen": "map",
        "units": units_out,
        "researchers": [],
    }

    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    print("Per unit:")
    print("  %-4s %-52s %-9s %6s %7s %6s" %
          ("id", "title", "weight", "topics", "lessons", "terms"))
    for u in units_out:
        print("  %-4s %-52s %-9s %6d %7d %6d" %
              (u["id"], u["title"][:52], u["weight"],
               u["counts"]["topics"], u["counts"]["lessons"], u["counts"]["terms"]))
    print()
    print("total lessons : %d" % total_lessons)
    print("total terms   : %d" % total_terms)
    print("lessons w/AIM : %d" % aim_hits)
    print("lessons w/src : %d" % source_hits)
    empty = [u["id"] for u in units_out if u["counts"]["terms"] == 0]
    print("units w/ zero vocab: %s" % (", ".join(empty) if empty else "none"))

    path = os.path.abspath(OUT)
    json.load(open(path, encoding="utf-8"))
    print("JSON parses OK: %s (%d bytes)" % (path, os.path.getsize(path)))


if __name__ == "__main__":
    main()
