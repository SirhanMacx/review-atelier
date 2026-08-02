#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_enl.py - build data/enl.json for the Global History 9 ENL review site.

REVIEW-ONLY. This script never emits answers, answer keys, model answers,
quiz/test/exam items, rubrics, or scoring. From the archive _spec.json files it
reads ONLY title / eq / language_objective / vocab and ignores blocks + slides
entirely (that is where answers live).

Sources (read-only):
  1. CALENDAR_2026-27_ENL.csv        -> unit spine, teaching order, dates, day counts
  2. */_UNIT_PLAN.md                 -> corroboration of titles and sub-arcs
  3. 03_RVC/.../lp_data_c5b.py       -> aims, language objectives, scaffolds, misconceptions (AST, never imported)
  4. _archive_..._lockstep_build/**/_spec.json -> multilingual vocab (topic-keyword remapped to ENL units)
  5. 0{3,4}/_Vocab_Supplements/*.docx -> extra multilingual glossary rows (stdlib zip + xml only)
"""

import ast
import csv
import json
import os
import re
import sys
import zipfile
from collections import OrderedDict, defaultdict

CURR = "/Volumes/CURRICULA/Curriculum_Agent_Workspace_2026_2027/06_Generated_Curricula"
V2 = os.path.join(CURR, "Global_9_ENL_V2")
CALENDAR = os.path.join(V2, "00_Project_Charter", "CALENDAR_2026-27_ENL.csv")
LP_DATA = os.path.join(V2, "03_RVC", "_Lesson_Plans", "_build", "lp_data_c5b.py")
ARCHIVE = os.path.join(CURR, "_archive_Global_9_ENL_lockstep_build")
SUPPLEMENT_DIRS = [
    os.path.join(V2, "03_RVC", "_Vocab_Supplements"),
    os.path.join(V2, "04_Classical", "_Vocab_Supplements"),
]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "data", "enl.json")


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def is_apple_double(path):
    return os.path.basename(path).startswith("._")


DASHES = dict.fromkeys(map(ord, "—–‒―"), None)


def clean(text):
    """Normalize whitespace and remove em/en dashes from prose we emit."""
    if not text:
        return ""
    t = str(text)
    t = t.replace("—", " to ").replace("–", " to ")
    t = t.replace("‒", " to ").replace("―", " to ")
    t = re.sub(r"\s*\bto\s+to\b\s*", " to ", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    return t.strip(" ;,")


def strip_prefix(text, prefixes):
    t = clean(text)
    for p in prefixes:
        if t.upper().startswith(p.upper()):
            t = t[len(p):].strip()
    return t.strip()


# --------------------------------------------------------------------------
# 1. calendar
# --------------------------------------------------------------------------

UNIT_META = OrderedDict([
    # calendar unit label -> (id, display title, blurb)
    ("Intro", ("0", "Course Launch", "Two opening days where you meet the class, read the course outline in English, Chinese, and Spanish, and draw a world map from memory.")),
    ("U1 Geography", ("1", "Geography", "A vocabulary-first on-ramp to map words: continents, the equator, hemispheres, map keys, and landforms like desert, mountain, ocean, and island.")),
    ("U2 Paleo-Neo", ("2", "Paleolithic and Neolithic", "How people moved from hunting and gathering to farming, and why growing food in one place changed everything.")),
    ("U3 River Valley Civilizations", ("3", "River Valley Civilizations", "The first cities and states along four rivers: Mesopotamia, Egypt, India, and China, with a vocabulary block before each one.")),
    ("EI thread", ("EI", "Enduring Issues Thread", "A short skills thread that teaches you what makes a problem an enduring issue and how to write about one.")),
    ("U4 Classical", ("4", "Classical World", "Greece, Rome, and Han China: how each built power, who counted as a citizen, what they invented, and why each empire weakened.")),
    ("U5 Post-Classical", ("5", "Post-Classical World", "The Middle Ages, the Crusades, the Mongols, the Black Death, and the Reformation, plus the trade routes that tied these worlds together.")),
    ("U6 Renaissance", ("6", "Renaissance", "A short unit on the rebirth of art and learning in Europe, the Medici, the printing press, and the artists you will study for the exhibit project.")),
    ("U7 Age of Exploration", ("7", "Age of Exploration", "Why Europeans sailed, what Columbus and the conquistadors did, the Columbian Exchange, and the Maya, Aztec, and Inca they met.")),
    ("U8 Final / EI / Time Travel", ("8", "Year-End Review", "The last stretch of the year: review by unit, enduring issues writing practice, and the Time Travel capstone.")),
])

# sub-arcs (topics) within a unit. First entry is the default catch-all.
SUB_ARCS = {
    "U3 River Valley Civilizations": [
        ("U3A", "Mesopotamia", ["mesopotamia", "sumer", "hammurabi", "fertile crescent",
                                "tigris", "euphrates", "cuneiform", "ziggurat", "gilgamesh",
                                "babylon", "river valley", "civilization", "city-state"]),
        ("U3B", "Egypt", ["egypt", "nile", "pharaoh", "pyramid", "hieroglyph", "mummy",
                          "mummific", "nubia", "kush"]),
        ("U3C", "India", ["india", "indus", "mohenjo", "harappa", "hindu", "caste",
                          "buddh", "siddhartha", "vedic", "ganges"]),
        ("U3D", "China", ["china", "chinese", "shang", "zhou", "qin", "oracle bone",
                          "confuc", "daois", "taois", "huang", "mandate of heaven",
                          "dynasty", "belief system"]),
    ],
    "U4 Classical": [
        ("U4A", "Greece", ["greece", "greek", "athens", "athenian", "sparta", "polis",
                           "democracy", "alexander", "hellenis", "socrates", "plato",
                           "aristotle", "olympic", "peloponnes", "persian war"]),
        ("U4B", "Rome", ["rome", "roman", "republic", "patrician", "plebeian", "caesar",
                         "augustus", "senate", "aqueduct", "gladiator", "christian",
                         "byzantine", "constantin", "punic", "carthage"]),
        ("U4C", "Han China", ["han", "silk road", "silk roads", "wudi", "confucian",
                              "civil service", "sinific"]),
    ],
}

# archive lesson title keywords -> V2 ENL unit label
ARCHIVE_UNIT_KEYWORDS = [
    # Intro: the "thinking like a historian" launch days.
    ("Intro", ["what is history", "how do historians think", "mystery from the past",
               "source is reliable", "historian"]),
    ("U1 Geography", ["geography", "geographic", "map ", "maps", "continent", "hemisphere",
                      "equator", "latitude", "longitude", "cartograph", "landform"]),
    ("U2 Paleo-Neo", ["paleolithic", "neolithic", "hunter", "gatherer", "foraging",
                      "domestic", "farming", "agricultur", "human origins", "lucy",
                      "out of africa", "stone age", "catalhoyuk", "otzi"]),
    ("U3 River Valley Civilizations", ["mesopotamia", "sumer", "hammurabi", "fertile crescent",
                                       "tigris", "euphrates", "cuneiform", "ziggurat",
                                       "gilgamesh", "babylon", "egypt", "nile", "pharaoh",
                                       "pyramid", "hieroglyph", "mummif", "nubia", "kush",
                                       "indus", "mohenjo", "harappa", "hindu", "caste",
                                       "vedic", "buddh", "siddhartha", "shang", "oracle bone",
                                       "zhou", "mandate of heaven", "confuc", "daois", "taois",
                                       "river valley", "river world", "judaism", "hebrew",
                                       "first cities", "writing and", "city and state",
                                       "belief system", "legalism"]),
    ("U4 Classical", ["greece", "greek", "athens", "athenian", "sparta", "polis",
                      "alexander", "hellenis", "socrates", "plato", "aristotle",
                      "peloponnes", "persian war", "rome", "roman", "republic",
                      "patrician", "plebeian", "caesar", "augustus", "aqueduct",
                      "punic", "carthage", "han ", "han dynasty", "qin ", "silk road",
                      "classical", "golden age", "maurya", "gupta", "christianity",
                      "byzantin", "fall of rome", "empire and citizen"]),
    ("U5 Post-Classical", ["middle ages", "medieval", "feudal", "manor", "crusade",
                           "mongol", "black death", "plague", "reformation", "luther",
                           "scientific revolution", "islam", "muslim", "caliph",
                           "postclassical", "post-classical", "charlemagne", "viking",
                           "knight", "monarch", "magna carta", "hundred years",
                           "indian ocean", "trans-saharan", "trans saharan", "mali",
                           "mansa musa", "ghana", "ottoman", "zheng he", "ibn battuta",
                           "marco polo", "swahili", "song dynasty", "tang", "samurai",
                           "shogun", "japan", "kiev", "russia", "aztec empire rise",
                           "trade network", "long-distance trade", "trade game",
                           "trader", "compass", "astrolabe", "lateen", "caravan",
                           "cultural diffusion", "slavery before the atlantic"]),
    ("U6 Renaissance", ["renaissance", "medici", "printing press", "gutenberg",
                        "humanism", "da vinci", "michelangelo", "raphael", "donatello",
                        "machiavelli", "patron"]),
    ("U7 Age of Exploration", ["exploration", "explorer", "columbus", "conquistador",
                               "cortes", "pizarro", "columbian exchange", "aztec",
                               "inca", "maya", "mesoamerica", "encounter", "caravel",
                               "circumnavig", "magellan", "da gama", "middle passage",
                               "encomienda", "new world", "atlantic slave"]),
]


def load_calendar():
    rows = []
    with open(CALENDAR, newline="", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            if not r.get("date"):
                continue
            rows.append(r)
    rows.sort(key=lambda r: r["date"])
    return rows


def is_gap(row):
    return row.get("ENL_file_or_GAP", "").strip().upper().startswith("GAP")


# --------------------------------------------------------------------------
# 2. lp_data (AST harvest, never imported)
# --------------------------------------------------------------------------

def load_lp_data():
    """Walk the AST for D.append(dict(...)) calls; keep literal kwargs only."""
    if not os.path.exists(LP_DATA):
        return {}
    with open(LP_DATA, encoding="utf-8") as fh:
        tree = ast.parse(fh.read(), filename=LP_DATA)

    wanted = {"date", "slug", "topic", "aim", "lang_obj", "scaffolds", "misconceptions"}
    out = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        fn = node.func
        if not (isinstance(fn, ast.Attribute) and fn.attr == "append"
                and isinstance(fn.value, ast.Name) and fn.value.id == "D"):
            continue
        if not node.args:
            continue
        inner = node.args[0]
        if not (isinstance(inner, ast.Call) and isinstance(inner.func, ast.Name)
                and inner.func.id == "dict"):
            continue
        rec = {}
        for kw in inner.keywords:
            if kw.arg not in wanted:
                continue          # ignores assessment / pacing by construction
            try:
                rec[kw.arg] = ast.literal_eval(kw.value)
            except (ValueError, TypeError, SyntaxError):
                continue          # non-literal (helper call) -> skip
        if rec.get("date"):
            out[rec["date"]] = rec
    return out


# --------------------------------------------------------------------------
# 3. archive vocab
# --------------------------------------------------------------------------

def find_specs():
    specs = []
    for root, dirs, files in os.walk(ARCHIVE):
        dirs[:] = [d for d in dirs if not d.startswith("._")]
        if not re.match(r"Lesson_\d+", os.path.basename(root)):
            continue
        for name in files:
            if name == "_spec.json" and not name.startswith("._"):
                specs.append(os.path.join(root, name))
    return sorted(specs)


def match_unit(text):
    t = (text or "").lower()
    best = None
    best_score = 0
    for unit, kws in ARCHIVE_UNIT_KEYWORDS:
        score = sum(len(k) for k in kws if k in t)
        if score > best_score:
            best_score, best = score, unit
    return best


def match_topic(unit_label, text, topics):
    """Return topic code for the most specific sub-arc, else the unit's first topic."""
    if len(topics) == 1:
        return topics[0][0]
    t = (text or "").lower()
    best, best_score = None, 0
    for code, _title, kws in SUB_ARCS.get(unit_label, []):
        score = sum(len(k) for k in kws if k in t)
        if score > best_score:
            best_score, best = score, code
    return best or topics[0][0]


def load_archive_vocab():
    """-> (unit_label -> [(text_for_topic_routing, vocab_entry)]), report dict"""
    buckets = defaultdict(list)
    report = defaultdict(int)
    unmatched = []
    lessons_seen = 0
    for path in find_specs():
        try:
            with open(path, encoding="utf-8") as fh:
                spec = json.load(fh)
        except (ValueError, OSError) as exc:
            print("  ! skipped %s (%s)" % (path, exc))
            continue
        lessons_seen += 1
        # ONLY these keys. blocks/slides are never touched.
        title = spec.get("title") or ""
        eq = spec.get("eq") or ""
        lang_obj = spec.get("language_objective") or ""
        vocab = spec.get("vocab") or []
        archive_unit = spec.get("unit") or ""

        haystack = " ".join([title, os.path.basename(os.path.dirname(path)).replace("_", " ")])
        unit = match_unit(haystack)
        if not unit:
            unit = match_unit(" ".join([haystack, eq, archive_unit]))
        if not unit:
            report["UNMATCHED"] += 1
            unmatched.append(title)
            continue
        report[unit] += 1
        route_text = " ".join([title, eq, archive_unit])
        for v in vocab:
            if not isinstance(v, dict) or not v.get("en"):
                continue
            buckets[unit].append((route_text, {
                "term": clean(v.get("en")),
                "def": clean(v.get("def")),
                "pinyin": clean(v.get("pinyin")),
                "zh": (v.get("zh") or "").strip(),
                "es": clean(v.get("es")),
            }))
        # lesson-level prose (eq / language objective) kept for enrichment
        buckets[unit + "::meta"].append({
            "date": spec.get("date"), "title": clean(title),
            "eq": clean(eq), "lang_obj": clean(lang_obj),
        })
    return buckets, report, lessons_seen, unmatched


# --------------------------------------------------------------------------
# 4. docx glossary supplements (stdlib only)
# --------------------------------------------------------------------------

def docx_rows(path):
    """Parse word/document.xml into a list of rows (lists of cell strings)."""
    try:
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf-8", "replace")
    except (zipfile.BadZipFile, KeyError, OSError):
        return []

    rows, cells, cell = [], [], []
    token = re.compile(r"<w:t[^>]*>(.*?)</w:t>|</w:tc>|</w:tr>|<w:tab/>|<w:br/>", re.S)
    for m in token.finditer(xml):
        tok = m.group(0)
        if tok.startswith("<w:t"):
            txt = m.group(1) or ""
            txt = (txt.replace("&amp;", "&").replace("&lt;", "<")
                      .replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'"))
            cell.append(txt)
        elif tok == "</w:tc>":
            cells.append("".join(cell).strip())
            cell = []
        elif tok == "</w:tr>":
            if cell:
                cells.append("".join(cell).strip())
                cell = []
            if cells:
                rows.append(cells)
            cells = []
    return rows


HEADER_WORDS = ("english", "pinyin", "中文", "espa", "definition", "term")


def load_supplements():
    """-> list of (source_dir, filename, vocab_entry)"""
    out = []
    for d in SUPPLEMENT_DIRS:
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if not name.lower().endswith(".docx") or name.startswith("._"):
                continue
            path = os.path.join(d, name)
            for row in docx_rows(path):
                if len(row) < 2:
                    continue
                first = row[0].strip().lower()
                if not first or any(first.startswith(h) for h in HEADER_WORDS):
                    continue
                cols = (row + [""] * 5)[:5]
                entry = {
                    "term": clean(cols[0]),
                    "def": clean(cols[4]),
                    "pinyin": clean(cols[1]),
                    "zh": cols[2].strip(),
                    "es": clean(cols[3]),
                }
                if entry["term"]:
                    out.append((d, name, entry))
    return out


def richness(entry):
    return sum(1 for k in ("def", "pinyin", "zh", "es") if entry.get(k))


def merge_vocab(existing, incoming):
    """Dedupe by lowercase term; keep the richer entry."""
    index = {e["term"].lower(): i for i, e in enumerate(existing)}
    for e in incoming:
        key = e["term"].lower()
        if key in index:
            cur = existing[index[key]]
            if richness(e) > richness(cur):
                existing[index[key]] = e
        else:
            index[key] = len(existing)
            existing.append(e)
    return existing


def emit_vocab(entry):
    out = {"term": entry["term"], "def": entry.get("def", "")}
    for k in ("pinyin", "zh", "es"):
        if entry.get(k):
            out[k] = entry[k]
    return out


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------

def build():
    print("Loading calendar ...")
    rows = load_calendar()
    day_counts = defaultdict(int)
    gap_counts = defaultdict(int)
    for r in rows:
        day_counts[r["ENL_unit"]] += 1
        if is_gap(r):
            gap_counts[r["ENL_unit"]] += 1
    total_gaps = sum(gap_counts.values())
    print("  %d calendar rows, %d GAP/buffer days" % (len(rows), total_gaps))

    print("Harvesting lesson plans from lp_data_c5b.py (AST, not imported) ...")
    lp = load_lp_data()
    print("  %d lesson plan records" % len(lp))

    print("Reading archive _spec.json vocab ...")
    buckets, report, seen, unmatched = load_archive_vocab()
    print("  %d archive lessons read" % seen)

    print("Reading multilingual glossary .docx supplements ...")
    sup = load_supplements()
    print("  %d glossary rows from %d sheets"
          % (len(sup), len({s[1] for s in sup})))

    # ---- assemble units
    units = []
    per_unit_lessons = {}
    for label, (uid, utitle, blurb) in UNIT_META.items():
        arcs = SUB_ARCS.get(label)
        if arcs:
            topics = [(code, title, kws) for code, title, kws in arcs]
        else:
            topics = [("U%s" % uid, utitle, [])]

        topic_objs = OrderedDict()
        for code, title, _kws in topics:
            topic_objs[code] = {
                "code": code,
                "title": title,
                "lessons": [],
                "vocab": [],
                "misconceptions": [],
            }

        # archive lesson prose, keyed by date, for enrichment of non-RVC units
        meta_by_date = {}
        for m in buckets.get(label + "::meta", []):
            if m.get("date"):
                meta_by_date[m["date"]] = m

        n = 0
        for r in rows:
            if r["ENL_unit"] != label or is_gap(r):
                continue
            n += 1
            date = r["date"]
            slot = clean(r.get("ENL_lesson_slot"))
            plan = lp.get(date)

            title = clean(plan.get("topic")) if plan and plan.get("topic") else slot
            if not title:
                title = "Lesson %d" % n

            overview = ""
            objectives = []
            if plan:
                overview = strip_prefix(plan.get("aim", ""), ["AIM:"])
                lo = strip_prefix(plan.get("lang_obj", ""),
                                  ["LANGUAGE (say/write):", "LANGUAGE:"])
                if lo:
                    objectives.append(lo)
            if not overview:
                m = meta_by_date.get(date)
                if m and m.get("eq"):
                    overview = m["eq"]
                    if m.get("lang_obj") and not objectives:
                        objectives.append(m["lang_obj"])
            if not overview:
                overview = clean(r.get("notes_from_unified")) or slot

            route = " ".join([title, slot, overview])
            tcode = match_topic(label, route, topics)
            topic_objs[tcode]["lessons"].append({
                "n": n,
                "title": title,
                "date": date,
                "overview": overview,
                "objectives": objectives,
                "essentialQuestions": [],
                "source": None,
            })

            if plan and plan.get("misconceptions"):
                for mc in plan["misconceptions"]:
                    mc = clean(mc)
                    if mc and mc not in topic_objs[tcode]["misconceptions"]:
                        topic_objs[tcode]["misconceptions"].append(mc)

        per_unit_lessons[label] = n

        # ---- vocab: archive, routed to sub-topics
        for route_text, entry in buckets.get(label, []):
            tcode = match_topic(label, route_text, topics)
            merge_vocab(topic_objs[tcode]["vocab"], [entry])

        # ---- vocab: docx supplements (only RVC + Classical have them)
        sup_dir = None
        if label == "U3 River Valley Civilizations":
            sup_dir = SUPPLEMENT_DIRS[0]
        elif label == "U4 Classical":
            sup_dir = SUPPLEMENT_DIRS[1]
        if sup_dir:
            for d, fname, entry in sup:
                if d != sup_dir:
                    continue
                tcode = match_topic(label, fname, topics)
                merge_vocab(topic_objs[tcode]["vocab"], [entry])

        topics_out = []
        for t in topic_objs.values():
            t["vocab"] = [emit_vocab(v) for v in t["vocab"]]
            topics_out.append(t)

        units.append({
            "id": uid,
            "title": utitle,
            "blurb": clean(blurb),
            "weight": "%d days" % day_counts.get(label, 0),
            "topics": topics_out,
            "counts": {
                "topics": len(topics_out),
                "lessons": sum(len(t["lessons"]) for t in topics_out),
                "terms": sum(len(t["vocab"]) for t in topics_out),
            },
        })

    doc = {
        "id": "enl",
        "accent": "enl",
        "title": "Global History 9 ENL",
        "subtitle": "Words first, then the world",
        "note": clean("A review site for Global History 9 ENL. Every unit starts with its "
                      "key words in English, Pinyin, Chinese, and Spanish, then the lessons "
                      "in the order we teach them. Study help only. No answers here."),
        "specimen": "map",
        "multilingual": True,
        "languages": [
            {"code": "zh", "label": "中文 (Simplified)"},
            {"code": "es", "label": "Español"},
            {"code": "pinyin", "label": "Pinyin"},
        ],
        "units": units,
        "researchers": [],
    }

    # ------------- report -------------
    print("\n--- ARCHIVE MATCH REPORT (178 archive lessons -> ENL units) ---")
    for label in UNIT_META:
        if report.get(label):
            print("  %-32s %3d archive lessons" % (label, report[label]))
    print("  %-32s %3d archive lessons (vocab dropped)" % ("UNMATCHED", report.get("UNMATCHED", 0)))
    if unmatched:
        for t in unmatched[:12]:
            print("      dropped: %s" % t)
        if len(unmatched) > 12:
            print("      ... and %d more" % (len(unmatched) - 12))

    print("\n--- PER-UNIT COUNTS ---")
    print("  %-28s %6s %8s %7s %6s" % ("unit", "days", "lessons", "terms", "topics"))
    tot_l = tot_v = 0
    for label, u in zip(UNIT_META, units):
        print("  %-28s %6s %8d %7d %6d" % (u["title"], u["weight"].split()[0],
                                           u["counts"]["lessons"], u["counts"]["terms"],
                                           u["counts"]["topics"]))
        tot_l += u["counts"]["lessons"]
        tot_v += u["counts"]["terms"]
    print("  %-28s %6d %8d %7d" % ("TOTAL", len(rows), tot_l, tot_v))
    print("  GAP / buffer days excluded from lesson lists: %d" % total_gaps)

    zh = es = pin = 0
    for u in units:
        for t in u["topics"]:
            for v in t["vocab"]:
                zh += 1 if v.get("zh") else 0
                es += 1 if v.get("es") else 0
                pin += 1 if v.get("pinyin") else 0
    print("\n--- TRANSLATION COVERAGE (%d unique terms) ---" % tot_v)
    print("  Chinese: %d (%.0f%%)   Spanish: %d (%.0f%%)   Pinyin: %d (%.0f%%)"
          % (zh, 100.0 * zh / max(tot_v, 1), es, 100.0 * es / max(tot_v, 1),
             pin, 100.0 * pin / max(tot_v, 1)))
    return doc


def guard(doc):
    """Fail loudly if anything answer-shaped leaked in."""
    # structural check: no answer-bearing KEY may exist anywhere in the tree.
    # (words like "rubric" can legitimately appear as a vocabulary term or in a
    # misconception note, so we check structure, not substrings.)
    banned_keys = {"a", "answer", "answers", "model_answer", "exit_ticket",
                   "blocks", "slides", "key", "rubric", "scoring", "questions"}
    stack = [doc]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            bad = banned_keys & set(node)
            if bad:
                raise SystemExit("REFUSING TO WRITE: answer-shaped key(s) %s" % sorted(bad))
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    blob = json.dumps(doc, ensure_ascii=False).lower()
    for phrase in ("answer key", "correct answer", "model answer"):
        if phrase in blob:
            raise SystemExit("REFUSING TO WRITE: found phrase %r" % phrase)
    for u in doc["units"]:
        for t in u["topics"]:
            for v in t["vocab"]:
                for k in ("pinyin", "zh", "es"):
                    if k in v and not v[k]:
                        raise SystemExit("empty translation key emitted on %r" % v["term"])
    for key in ("id", "accent", "title", "subtitle", "note", "specimen",
                "multilingual", "languages", "units", "researchers"):
        if key not in doc:
            raise SystemExit("missing top-level key %s" % key)


def main():
    doc = build()
    guard(doc)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    size = os.path.getsize(OUT)
    with open(OUT, encoding="utf-8") as fh:
        json.load(fh)
    print("\nWrote %s" % OUT)
    print("JSON parses OK. Size: %s bytes (%.1f KB)" % (format(size, ","), size / 1024.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
