"""Report narrative (design §5, §6): facts JSON → one paragraph, claim-checked.

The LLM sees only the facts JSON, never sessions or code. Every number it writes must
come from the facts, every "k of n respondents" must match the finding of the hypothesis
named in the same sentence, the population split must be quoted verbatim, and causal or
probabilistic wording is rejected. Anything that fails falls back to the template.
"""

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from pydantic import Field

from engine.llm import LLM
from engine.models import Hypothesis
from engine.report import SOURCE_LABELS
from engine.stages import LLMModel

NARRATIVE = ("narrative", 1)
FORBIDDEN = re.compile(
    r"\b(caus\w*|because|due to|led to|leads? to|result(?:s|ed)? in|reason (?:is|was)|"
    r"prov\w*|probab\w*|likel\w*|confiden\w*|percent\w*|majority|most users|all users|"
    r"significan\w*)\b|%",
    re.IGNORECASE,
)
K_OF_N = re.compile(r"\b(\d+) of (\d+) (respondents?|sessions?)\b", re.IGNORECASE)
# "seed 3 of 4 · visitors 1 of 2": a respondents split, checked like respondents.
SPLIT = re.compile(r"\b(?:seed|visitors|test) (\d+) of (\d+)\b")
BARE_K_OF_N = re.compile(
    r"(?<!seed )(?<!visitors )(?<!test )\b\d+ of \d+\b(?! (?:respondents?|sessions?)\b)",
    re.IGNORECASE,
)
NUMBER = re.compile(r"(?<![\w.])\d+(?![\w.])")
HYPOTHESIS = re.compile(r"\bH(\d+|_other)\b")
SENTENCE = re.compile(r"(?<=[.!?])\s+")


class NarrativeDraft(LLMModel):
    paragraph: str = Field(min_length=40, max_length=1500)


def facts(current: Mapping[str, Any], hypotheses: Sequence[Hypothesis], *,
          locked: bool) -> dict[str, Any]:
    """Everything the narrative may state; no timestamps, so it changes only with data."""
    statements = {h.id: h.statement for h in hypotheses}
    sources = dict(current["sources"])
    return {
        "locked": locked,
        "population": current["population"],
        "sources": sources,
        "sessions": sum(sources.values()),
        "cohorts": [{"cohort": row["cohort"], "sessions": row["sessions"]}
                    for row in current["cohorts"]],
        "probes": [{
            "decision_point": p["decision_point"], "target_cohorts": list(p["target_cohorts"]),
            **{k: p["counts"].get(k, 0)
               for k in ("shown", "answered", "skipped", "shown_no_response")},
        } for p in current["probes"]],
        "findings": [{
            "decision_point": f["decision_point"], "cohort": f["cohort"],
            "hypothesis_id": f["hypothesis_id"],
            "statement": statements.get(f["hypothesis_id"], ""),
            "selected": f["selected"], "respondents": f["respondents"],
            "by_source": f.get("by_source", {}), "self_report": f["self_report"],
            "observation": f["observation"],
        } for f in current["findings"] if f["respondents"] > 0],
    }


def facts_digest(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def _numbers(value: Any) -> set[int]:
    """Numeric fields only: digits inside strings (statements, labels) are not facts."""
    if isinstance(value, bool):
        return set()
    if isinstance(value, int):
        return {value}
    if isinstance(value, Mapping):
        return set().union(*(_numbers(v) for v in value.values())) if value else set()
    if isinstance(value, (list, tuple)):
        return set().union(*(_numbers(v) for v in value)) if value else set()
    return set()


def check(text: str, value: Mapping[str, Any]) -> list[str]:
    """Problems with `text` against the facts; empty means every claim is grounded."""
    if value["population"] not in text:
        return [f"population split missing: {value['population']!r}"]
    # Quoted hypothesis statements are the respondents' words, not claims by the narrative.
    for statement in sorted({f["statement"] for f in value["findings"]}, key=len, reverse=True):
        if statement:
            text = text.replace(f'"{statement}"', '"…"')
    text = text.replace(value["population"], "")
    problems = [f"forbidden wording: {m.group(0)!r}" for m in FORBIDDEN.finditer(text)]
    allowed = _numbers(value)
    problems += [f"number not in facts: {n}" for n in NUMBER.findall(text)
                 if int(n) not in allowed]
    known = {f["hypothesis_id"] for f in value["findings"]}
    pairs: dict[str, set[tuple[int, int]]] = {}
    for f in value["findings"]:
        own = {(f["selected"], f["respondents"])}
        own |= {(s["selected"], s["respondents"]) for s in f["by_source"].values()}
        pairs.setdefault(f["hypothesis_id"], set()).update(own)
    session_pairs = {(c["sessions"], value["sessions"]) for c in value["cohorts"]}
    session_pairs |= {(p[k], p["shown"]) for p in value["probes"]
                      for k in ("answered", "skipped", "shown_no_response")}
    cohort_size = {c["cohort"]: c["sessions"] for c in value["cohorts"]}
    session_pairs |= {(p["shown"], cohort_size[c]) for p in value["probes"]
                      for c in p["target_cohorts"] if c in cohort_size}
    problems += [f"'{m.group(0)}' without a unit (respondents or sessions)"
                 for m in BARE_K_OF_N.finditer(text)]
    for sentence in SENTENCE.split(text):
        named = {f"H{m}" for m in HYPOTHESIS.findall(sentence)}
        problems += [f"unknown hypothesis: {h}" for h in sorted(named - known)]
        for k, n, unit in K_OF_N.findall(sentence):
            pair = (int(k), int(n))
            if unit.lower().startswith("respondent"):
                if not any(pair in pairs.get(h, set()) for h in named):
                    problems.append(f"'{k} of {n} respondents' matches no named hypothesis")
            elif pair not in session_pairs:
                problems.append(f"'{k} of {n} sessions' matches no cohort or probe count")
        for k, n in SPLIT.findall(sentence):
            if not any((int(k), int(n)) in pairs.get(h, set()) for h in named):
                problems.append(f"split '{k} of {n}' matches no named hypothesis")
        if re.search(r"\brespondents?\b", sentence) and not K_OF_N.search(sentence):
            problems.append("respondents mentioned without 'k of n respondents'")
    return problems


def template(value: Mapping[str, Any]) -> str:
    """Deterministic fallback; passes `check` by construction."""
    parts = [f"Population: {value['population']} sessions"
             + (" (seed sessions are simulated users)." if value["sources"].get("seed")
                else ".")]
    if not value["locked"]:
        parts.append("The investigation is not locked yet, so no probe results are reported.")
    for probe in value["probes"]:
        if not probe["shown"]:
            continue
        parts.append(
            f"At {probe['decision_point']} the question was shown in {probe['shown']} sessions: "
            f"{probe['answered']} answered, {probe['skipped']} skipped, "
            f"{probe['shown_no_response']} gave no response."
        )
        rows = sorted((f for f in value["findings"]
                       if f["decision_point"] == probe["decision_point"]
                       and f["hypothesis_id"] != "H_other" and f["selected"]),
                      key=lambda f: (-f["selected"], f["hypothesis_id"]))
        for f in rows[:2]:
            split = " · ".join(f"{SOURCE_LABELS[s]} {v['selected']} of {v['respondents']}"
                               for s, v in f["by_source"].items() if v["respondents"])
            parts.append(
                f"{f['hypothesis_id']} (\"{f['statement']}\") was selected by "
                f"{f['selected']} of {f['respondents']} respondents"
                + (f" ({split})." if split else ".")
            )
    parts.append("These are self-reports from the people who answered; "
                 "they do not establish why others left.")
    return " ".join(parts)


def generate(llm: LLM, value: Mapping[str, Any]) -> dict[str, Any]:
    """LLM paragraph if it passes the claim checker, else the template (with reasons)."""
    fallback = template(value)
    try:
        draft = llm.call(*NARRATIVE, NarrativeDraft, context="",
                         instructions=json.dumps(value, ensure_ascii=False),
                         system=("narrative_system", 1))
    except Exception as error:  # noqa: BLE001 - any LLM failure falls back to the template
        return {"text": fallback, "source": "template", "rejected": [f"llm: {error}"]}
    problems = check(draft.paragraph, value)
    if problems:
        return {"text": fallback, "source": "template", "rejected": problems,
                "llm_text": draft.paragraph}
    return {"text": draft.paragraph, "source": "llm", "rejected": []}
