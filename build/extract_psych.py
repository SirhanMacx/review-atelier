# -*- coding: utf-8 -*-
"""
Extract REVIEW-ONLY content for AP Psychology into data/psych.json.

Hard rule: no assessment content. We read ONLY these lesson keys:
    title, nys, overview, objectives, essential_questions, vocab,
    misconceptions, primary_source
and never sbmcq / questions / correct / rationale / rubric / answer keys.
"""
import ast, json, re, csv, sys
from pathlib import Path

ROOT = Path("/Volumes/CURRICULA/Curriculum_Agent_Workspace_2026_2027/06_Generated_Curricula/AP_Psychology")
BUILD = ROOT / "_build"
OUT = Path(__file__).resolve().parent.parent / "data" / "psych.json"

BANNED_KEYS = {"sbmcq", "questions", "correct", "rationale", "rubric", "answers",
               "answer_key", "key", "scoring", "exit_key"}

UNITS = [
    ("0", "Science Practices and Research Methods",
     "How psychologists ask questions and defend answers with evidence.", None),
    ("1", "Biological Bases of Behavior",
     "The body's hardware: genes, neurons, brain, sleep, and the senses.", "15-25%"),
    ("2", "Cognition",
     "How the mind perceives, thinks, remembers, forgets, and is measured.", "15-25%"),
    ("3", "Development and Learning",
     "How people change across a lifespan, and how experience teaches.", "15-25%"),
    ("4", "Social Psychology and Personality",
     "How other people shape us, and what makes a self consistent.", "15-25%"),
    ("5", "Mental and Physical Health",
     "Stress, wellbeing, disorders, and the treatments that help.", "15-25%"),
    ("6", "AP Exam Review",
     "Pulling five units back together before exam day.", None),
]

FILES = {
    "0": ["unit00_lessons.py"], "1": ["unit01_lessons.py"], "2": ["unit02_lessons.py"],
    "3": ["unit03_lessons.py"], "4": ["unit04_lessons.py"], "5": ["unit05_lessons.py"],
    "6": ["u6_review_a.py", "u6_review_b.py"],
}


def _ev(node, env):
    """literal_eval, plus string concatenation and references to earlier top-level names."""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, (ast.List, ast.Tuple)):
        return [_ev(e, env) for e in node.elts]
    if isinstance(node, ast.Set):
        return {_ev(e, env) for e in node.elts}
    if isinstance(node, ast.Dict):
        return {_ev(k, env): _ev(v, env) for k, v in zip(node.keys, node.values)}
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return _ev(node.left, env) + _ev(node.right, env)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _ev(node.operand, env)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.Name):
        if node.id in env:
            return env[node.id]
        raise ValueError(f"unresolved name {node.id}")
    if isinstance(node, ast.JoinedStr):     # f-string with only literal parts
        parts = []
        for v in node.values:
            if isinstance(v, ast.Constant):
                parts.append(str(v.value))
            elif isinstance(v, ast.FormattedValue):
                parts.append(str(_ev(v.value, env)))
        return "".join(parts)
    raise ValueError(f"unsupported node {type(node).__name__}")


def literal_assign(path, name):
    """Pull a top-level `NAME = <literal>` out of a data module without importing it.

    Walks top-level assignments in order so later values may reference earlier names.
    """
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    env = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        try:
            val = _ev(node.value, env)
        except ValueError:
            continue                      # skip anything non-literal
        for t in node.targets:
            if isinstance(t, ast.Name):
                env[t.id] = val
    if name in env:
        return env[name]
    # fall back to nested assignments (some data lists live inside builder functions)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == name for t in node.targets):
            try:
                return _ev(node.value, env)
            except ValueError:
                continue
    return None


def clean(s):
    if not isinstance(s, str):
        return s
    s = s.replace("—", " - ").replace("–", " to ")   # no em/en dashes
    return re.sub(r"\s+", " ", s).strip()


def topic_from_nys(nys):
    if not isinstance(nys, str):
        return None, None
    m = re.search(r"Topic\s+(\d+\.\d+)[,:]?\s*([^(]*)", nys)
    if m:
        return m.group(1), clean(m.group(2)).rstrip(" ,")
    return None, clean(nys)


def parse_lessons(unit_id):
    out = []
    for fname in FILES[unit_id]:
        p = BUILD / fname
        if not p.exists():
            print(f"  ! missing {fname}", file=sys.stderr)
            continue
        lessons = literal_assign(p, "LESSONS") or []
        for L in lessons:
            if not isinstance(L, dict):
                continue
            code, tname = topic_from_nys(L.get("nys"))
            vocab = []
            for v in (L.get("vocab") or []):
                if isinstance(v, (list, tuple)) and len(v) >= 2:
                    term, dfn = clean(v[0]), clean(v[1])
                    if term and dfn:
                        vocab.append({"term": term, "def": dfn})
            mis = [clean(m) for m in (L.get("misconceptions") or []) if isinstance(m, str)]
            objs = [clean(o) for o in (L.get("objectives") or []) if isinstance(o, str)]
            eqs = [clean(q) for q in (L.get("essential_questions") or []) if isinstance(q, str)]
            ps = L.get("primary_source")
            src = None
            if isinstance(ps, dict) and ps.get("title"):
                src = {k: clean(ps.get(k)) for k in ("title", "author", "year") if ps.get(k)}
            out.append({
                "n": L.get("lesson_no"),
                "title": clean(L.get("title")),
                "topic": code,
                "topicTitle": tname,
                "overview": clean(L.get("overview")),
                "essentialQuestions": eqs,
                "objectives": objs,
                "vocab": vocab,
                "misconceptions": mis,
                "source": src,
            })
    return out


def researchers():
    p = BUILD / "build_myers_guide.py"
    rows = literal_assign(p, "RESEARCHERS") or []
    out = []
    for r in rows:
        if isinstance(r, (list, tuple)) and len(r) >= 3:
            who, what, where = clean(r[0]), clean(r[1]), clean(r[2])
            m = re.match(r"^U(\d)", where or "")
            out.append({"who": who, "what": what, "where": where,
                        "unit": m.group(1) if m else None})
    return out


def main():
    units = []
    for uid, title, blurb, weight in UNITS:
        lessons = parse_lessons(uid)
        # topic roll-up
        topics, seen = [], {}
        for L in lessons:
            code = L["topic"] or f"{uid}.0"
            if code not in seen:
                seen[code] = {"code": code, "title": L["topicTitle"] or L["title"],
                              "lessons": [], "vocab": [], "misconceptions": []}
                topics.append(seen[code])
            t = seen[code]
            t["lessons"].append({"n": L["n"], "title": L["title"],
                                 "overview": L["overview"],
                                 "objectives": L["objectives"],
                                 "essentialQuestions": L["essentialQuestions"],
                                 "source": L["source"]})
            t["vocab"].extend(L["vocab"])
            t["misconceptions"].extend(L["misconceptions"])
        # dedupe vocab within a topic, keep first definition
        for t in topics:
            seen_terms, dedup = set(), []
            for v in t["vocab"]:
                k = v["term"].lower()
                if k not in seen_terms:
                    seen_terms.add(k); dedup.append(v)
            t["vocab"] = dedup
            t["misconceptions"] = list(dict.fromkeys(t["misconceptions"]))
        nv = sum(len(t["vocab"]) for t in topics)
        units.append({"id": uid, "title": title, "blurb": blurb, "weight": weight,
                      "topics": topics, "counts": {"topics": len(topics),
                                                   "lessons": len(lessons), "terms": nv}})
        print(f"  U{uid} {title}: {len(topics)} topics, {len(lessons)} lessons, {nv} terms")

    data = {
        "id": "psych", "accent": "psych",
        "title": "AP Psychology",
        "subtitle": "The science of mind and behavior",
        "note": "Aligned to the College Board Course and Exam Description, Course Framework V.1 (2024 redesign).",
        "specimen": "brain",
        "units": units,
        "researchers": researchers(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tot = sum(u["counts"]["terms"] for u in units)
    print(f"\nWROTE {OUT}  |  {len(units)} units, {tot} terms, {len(data['researchers'])} researchers")
    print(f"      {OUT.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
