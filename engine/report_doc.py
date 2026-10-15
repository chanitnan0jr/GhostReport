"""Investigation report document: report facts with IDs → one checked Markdown document.

The backend computes every number (cohorts, coverage, R2, k of n respondents, limits). The
LLM only arranges those facts into a fixed outline and cites them as `[fact:<id>]`. `check`
traces every number, "k of n" pair and citation in each sentence back to the facts that
sentence cites, keeps self-reported answers out of sentences about recorded observations,
and rejects causal wording. Anything that fails is regenerated once with the problems,
then the deterministic `template` is served instead. One document is written per context
digest (the evidence snapshot), so a report can be checked again later.
"""

import hashlib
import json
import re
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from pydantic import Field

from engine.llm import LLM
from engine.narrative import BARE_K_OF_N, K_OF_N, NUMBER, SPLIT, VAGUE
from engine.stages import LLMModel

DOCUMENT = ("report_doc", 2)
SYSTEM = ("report_doc_system", 2)
TITLE = "Investigating wallet onboarding drop-off"
OUTLINE = (
    "Executive Summary", "1. Investigation Scope", "2. Observed User Behavior",
    "3. Hypothesis Findings", "4. Evidence Gaps", "5. Recommended Actions",
    "6. Limitations", "Appendix",
)
COHORTS = ("no_gate_event", "gate_event_no_attempt", "attempted_no_success", "connected")
COHORT_LABELS = {
    "no_gate_event": "No gate event recorded",
    "gate_event_no_attempt": "Gate shown, no attempt",
    "attempted_no_success": "Attempted, no success recorded",
    "connected": "Connected",
}
COHORT_RULES = {
    "no_gate_event": "No wallet gate event was recorded.",
    "gate_event_no_attempt": "The wallet gate was recorded; no connection attempt followed.",
    "attempted_no_success": "A connection attempt was recorded without a recorded success.",
    "connected": "A wallet connection was recorded.",
}
SOURCE_NAMES = {"seed": "seed", "test": "test", "visitor": "visitors"}
R2_ACTION = "check_gate:no_attempt:R2"
R2_CLASS = "HC-gate-permission"
MIN_RESPONDENTS = 3

# Causal, probabilistic or verdict wording, and words the console's wording guard withholds.
FORBIDDEN = re.compile(
    r"\b(caus\w*|because|due to|led to|leads? to|result(?:s|ed)? in|reason (?:is|was)|"
    r"prov\w*|disprov\w*|refut\w*|probab\w*|likel\w*|confiden\w*|percent\w*|majority|"
    r"most users|all users|significan\w*|confirm\w*|root|therefore|thus|hence|"
    r"consequently|explain\w*|attribut\w*|driv(?:e|es|en|ing)|suggest\w*|indicat\w*|"
    r"impl(?:y|ies|ied)|demonstrat\w*|so that|which means|meaning that|shows? that)\b|%",
    re.IGNORECASE,
)
WORD_VALUES = {"two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
               "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12}
NUMBER_WORDS = re.compile(rf"\b({'|'.join(WORD_VALUES)}|dozen|half)\b", re.IGNORECASE)
GAP_WORDS = re.compile(r"\b(gap|missing|untracked|not tracked|absent)\b", re.IGNORECASE)
GAP_HEDGE = re.compile(r"\b(not established|unknown|unresolved|cannot|undetermined)\b",
                       re.IGNORECASE)
CITATION = re.compile(r"\[fact:([a-z0-9_]+)\]")
PLACEHOLDER = re.compile(r"\{(f\d+)(?:\.([a-z0-9_]+))?\}")  # {f12}, {f12.2}, {f12.statement}
CODE_SPAN = re.compile(r"`[^`\n]*`")
HYPOTHESIS = re.compile(r"\bH(\d+|_other)\b")
# A citation after the full stop belongs to the sentence before it.
TRAILING_CITES = re.compile(r"([.!?])((?:\s*\[fact:[a-z0-9_]+\])+)")
SENTENCE = re.compile(r"(?<=[.!?])\s+")
CALLOUT = re.compile(r"^\[!(NOTE|WARNING)\]$")
TABLE_RULE = re.compile(r"^\|[\s:|-]+\|$")
UNSAFE_INLINE = re.compile(r"<[a-zA-Z/!]|!\[|\]\(|https?://|```")


class ReportDocument(LLMModel):
    markdown: str = Field(min_length=400, max_length=16000)


def _id(*parts: str) -> str:
    return "_".join(re.sub(r"[^a-z0-9]+", "_", p.lower()).strip("_") for p in parts)


def _ref(code_ref: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    if not code_ref:
        return []
    return [{"file": code_ref["file"], "lines": list(code_ref["lines"]),
             "quote": code_ref.get("quote", "")}]


def _fact(fact_id: str, kind: str, evidence: str, label: str, statement: str, source: str, *,
          pairs: Iterable[tuple[int, int, str]] = (), numbers: Iterable[int] = (),
          data: Mapping[str, Any] | None = None, refs: Sequence[Mapping[str, Any]] = (),
          related: Sequence[str] = ()) -> dict[str, Any]:
    pair_list = [[k, n, unit] for k, n, unit in pairs]
    values = set(numbers) | {v for k, n, _ in pair_list for v in (k, n)}
    return {
        "id": fact_id, "kind": kind, "evidence": evidence, "label": label,
        "statement": statement, "source": source, "numbers": sorted(values),
        "pairs": pair_list, "data": dict(data or {}), "refs": list(refs),
        "related": list(related),
    }


def _status(finding: Mapping[str, Any]) -> str:
    """Never a verdict: self-reports can only make evidence available."""
    if finding.get("evidence_conflict"):
        return "Mixed / unresolved"
    if finding["respondents"] < MIN_RESPONDENTS:
        return "Not enough respondents to read"
    return "Evidence available" if finding["selected"] else "Not selected"


def context(body: Mapping[str, Any]) -> dict[str, Any]:
    """Every fact the document may state, with an ID, the numbers it allows and its source.

    No current timestamps: the context, and so its digest, changes only with the evidence.
    """
    current = body["current"]
    run = body["run"]
    workflow = body.get("workflow") or {}
    facts: list[dict[str, Any]] = []
    total = len(current["sessions"])
    sources: dict[str, int] = dict(current.get("sources") or {})
    split = " + ".join(f"{SOURCE_NAMES[s]} {sources.get(s, 0)}"
                       for s in ("seed", "test", "visitor") if s != "test" or sources.get(s))
    facts.append(_fact(
        "population", "population", "observed", "Recorded sessions",
        f"{total} recorded sessions" + (f" ({split})." if sources else "."),
        "/api/report current.sessions, current.sources",
        pairs=[(sources[s], total, "sessions") for s in sources if sources[s]],
        numbers=[total, *sources.values()],
        data={"sessions": total, "sources": sources, "population": split},
    ))

    cohort_rows = {row["cohort"]: row for row in current["cohorts"]}
    members: dict[str, list[str]] = {}
    for session in current["sessions"]:
        members.setdefault(session["cohort"], []).append(session["session_id"])
    for cohort in COHORTS:
        row = cohort_rows.get(cohort, {"sessions": 0, "coverage_complete": 0,
                                       "coverage_unknown": 0, "exit_types": {}})
        exits = dict(row.get("exit_types") or {})
        facts.append(_fact(
            _id("cohort", cohort), "cohort", "observed", COHORT_LABELS[cohort],
            f"{COHORT_LABELS[cohort]}: {row['sessions']} of {total} sessions. "
            + COHORT_RULES[cohort],
            f"/api/report current.cohorts[cohort={cohort}]",
            pairs=[(row["sessions"], total, "sessions"),
                   (row["coverage_complete"], row["sessions"], "sessions"),
                   (row["coverage_unknown"], row["sessions"], "sessions")],
            numbers=list(exits.values()),
            data={"cohort": cohort, "rule": COHORT_RULES[cohort], "sessions": row["sessions"],
                  "coverage_complete": row["coverage_complete"],
                  "coverage_unknown": row["coverage_unknown"], "exit_types": exits,
                  "session_ids": members.get(cohort, [])},
        ))

    complete = sum(1 for s in current["sessions"] if s["coverage"] == "complete")
    unknown = total - complete
    reasons: dict[str, int] = {}
    for session in current["sessions"]:
        for reason in session.get("coverage_reasons", []):
            reasons[reason] = reasons.get(reason, 0) + 1
    facts.append(_fact(
        "coverage", "coverage", "observed", "Session coverage",
        f"{complete} of {total} sessions have complete coverage; "
        f"{unknown} of {total} sessions have unknown coverage.",
        "/api/report current.sessions[].coverage",
        pairs=[(complete, total, "sessions"), (unknown, total, "sessions")]
        + [(count, total, "sessions") for count in reasons.values()],
        data={"complete": complete, "unknown": unknown, "reasons": reasons},
    ))

    for probe in current["probes"]:
        counts = probe["counts"]
        dp = probe["decision_point"]
        targets = list(probe["target_cohorts"])
        shown = counts.get("shown", 0)
        facts.append(_fact(
            _id("probe", dp), "probe", "probe", f"Exit question at {dp}",
            f"At {dp} the question was shown in {shown} sessions: "
            f"{counts.get('answered', 0)} answered, {counts.get('skipped', 0)} skipped, "
            f"{counts.get('shown_no_response', 0)} gave no response.",
            f"/api/report current.probes[decision_point={dp}]",
            pairs=[(counts.get(k, 0), shown, "sessions")
                   for k in ("answered", "skipped", "shown_no_response")]
            + [(shown, cohort_rows[c]["sessions"], "sessions")
               for c in targets if c in cohort_rows],
            numbers=[shown],
            data={"decision_point": dp, "stem": probe.get("stem", ""),
                  "target_cohorts": targets,
                  **{k: counts.get(k, 0)
                     for k in ("shown", "answered", "skipped", "shown_no_response")}},
        ))
    for finding in current["findings"]:
        if finding["respondents"] <= 0:
            continue
        h = finding["hypothesis_id"]
        dp = finding["decision_point"]
        by_source = {s: v for s, v in (finding.get("by_source") or {}).items()
                     if v["respondents"]}
        split_text = ", ".join(f"{SOURCE_NAMES.get(s, s)} {v['selected']} of {v['respondents']}"
                               for s, v in by_source.items())
        facts.append(_fact(
            _id("finding", dp, h), "finding", "self_report", f"{h} at {dp}",
            f"{h} was selected by {finding['selected']} of {finding['respondents']} "
            f"respondents at {dp}" + (f" ({split_text})." if split_text else "."),
            f"/api/report current.findings[decision_point={dp}, hypothesis_id={h}]",
            pairs=[(finding["selected"], finding["respondents"], "respondents")]
            + [(v["selected"], v["respondents"], "respondents") for v in by_source.values()],
            data={"hypothesis_id": h, "decision_point": dp, "cohort": finding["cohort"],
                  "selected": finding["selected"], "respondents": finding["respondents"],
                  "by_source": by_source, "status": _status(finding),
                  "self_report": finding.get("self_report", ""),
                  "observation": finding.get("observation", ""),
                  "evidence_conflict": bool(finding.get("evidence_conflict"))},
            related=[_id("hypothesis", h), _id("probe", dp)],
        ))

    code_items = {item["id"]: item for group in ("states", "outcomes", "ui_facts")
                  for item in workflow.get(group, [])}
    mapped = {m["hypothesis_id"]: m["class_id"] for m in body.get("class_mappings", [])}
    for h in body["hypotheses"]:
        evidence_ids = [e for e in h.get("code_evidence", []) if e in code_items]
        class_id = mapped.get(h["id"], h.get("class_id"))
        facts.append(_fact(
            _id("hypothesis", h["id"]), "hypothesis", "plan", h["id"],
            f"{h['id']}: “{h['statement']}”",
            f"/api/report hypotheses[id={h['id']}]",
            data={"statement": h["statement"], "class_id": class_id,
                  "r2_applies": class_id == R2_CLASS, "locked": bool(body.get("locked"))},
            refs=[r for e in evidence_ids for r in _ref(code_items[e].get("code_ref"))],
            related=[_id("code", e) for e in evidence_ids],
        ))

    r2 = [d for d in current["decisions"] if d["action_id"] == R2_ACTION]
    groups = {k: sum(len(d["session_ids"]) for d in r2 if d["result"] == k)
              for k in ("observed", "not_observed", "unknown_coverage")}
    checked = sum(groups.values())
    contradicted = sorted({h for d in r2 for h in d.get("contradicted_hypotheses", [])})
    facts.append(_fact(
        "rule_r2", "rule", "observed", "Contradiction rule R2",
        (f"R2 checked {checked} sessions in the two no-attempt cohorts: "
         f"{groups['observed']} recorded a gate event, {groups['not_observed']} had complete "
         f"coverage and no gate event, {groups['unknown_coverage']} had unknown coverage. "
         + (f"R2 contradicted {', '.join(contradicted)} in complete-coverage sessions only."
            if contradicted else "R2 contradicted no hypothesis."))
        if r2 else "R2 has not been evaluated for this snapshot.",
        f"/api/report current.decisions[action_id={R2_ACTION}]",
        pairs=[(v, checked, "sessions") for v in groups.values()],
        numbers=[checked, 2],
        data={"evaluated": bool(r2), **groups, "checked": checked, "cohorts_checked": 2,
              "contradicted_hypotheses": contradicted,
              "scope": "complete-coverage sessions that meet R2 only; it never counts "
                       "against a cohort or establishes why sessions stopped"},
    ))

    outcomes = workflow.get("outcomes", [])
    status_text = {
        "found_in_code": "A tracking call was found in the searched code.",
        "not_found_in_scope": "No tracking call was found in the searched files; "
                              "a candidate for review.",
        "unknown": "The search scope does not settle whether this outcome is tracked; "
                   "it is not established as a gap.",
    }
    for item in workflow.get("states", []) + workflow.get("ui_facts", []):
        facts.append(_fact(
            _id("code", item["id"]), "code", "code", item["id"], item.get("desc", ""),
            f"/api/report workflow[id={item['id']}]",
            data={"instrumentation": item.get("instrumentation", "unknown")},
            refs=_ref(item.get("code_ref")),
        ))
    for item in outcomes:
        status = item.get("instrumentation", "unknown")
        facts.append(_fact(
            _id("outcome", item["id"].removeprefix("outcome_")), "outcome", "code", item["id"],
            f"{item.get('desc', '')} {status_text.get(status, '')}".strip(),
            f"/api/report workflow.outcomes[id={item['id']}]",
            data={"instrumentation": status, "desc": item.get("desc", "")},
            refs=_ref(item.get("code_ref")),
        ))
    tally = {k: sum(1 for o in outcomes if o.get("instrumentation") == k)
             for k in ("found_in_code", "not_found_in_scope", "unknown")}
    facts.append(_fact(
        "instrumentation", "instrumentation", "code", "Outcome instrumentation",
        f"{len(outcomes)} workflow outcomes: {tally['found_in_code']} tracked in code, "
        f"{tally['not_found_in_scope']} not found in the searched files, "
        f"{tally['unknown']} unknown.",
        "/api/report workflow.outcomes[].instrumentation",
        numbers=[len(outcomes), *tally.values()], data={"outcomes": len(outcomes), **tally},
    ))
    scope = workflow.get("scope") or {}
    searched = len(scope.get("searched_files", []))
    unresolved = len(scope.get("unresolved_imports", []))
    facts.append(_fact(
        "code_scope", "scope", "code", "Code search scope",
        f"{searched} files searched at commit {scope.get('commit_sha', 'unknown')}; "
        f"{unresolved} unresolved imports" + ("; the search was truncated."
                                             if scope.get("truncated") else "."),
        "/api/report workflow.scope",
        numbers=[searched, unresolved],
        data={"commit_sha": scope.get("commit_sha"), "searched_files": scope.get(
            "searched_files", []), "unresolved_imports": scope.get("unresolved_imports", []),
              "truncated": bool(scope.get("truncated"))},
    ))

    commit = str(run.get("code_commit", "unknown"))
    limits = [("limit_commit", "Commit", commit,
               bool(re.fullmatch(r"[0-9a-f]{7,40}", commit)), "/api/report run.code_commit"),
              ("limit_build", "Build", "verified" if run.get("build_verified") else "unverified",
               bool(run.get("build_verified")), "/api/report run.build_verified")]
    for event, info in (run.get("verification") or {}).items():
        limits.append((_id("limit_verify", event), f"{event} verification",
                       "verified" if info.get("verified") else "unverified",
                       info.get("verified") is True, f"/api/report run.verification.{event}"))
    for fact_id, label, value, ok, source in limits:
        facts.append(_fact(fact_id, "limit", "run", label, f"{label}: {value}.", source,
                           data={"value": value, "ok": ok}))

    # The report always names the unchanged template, never the comparison draft.
    from engine.segment_spec import digest as spec_digest
    from engine.segment_spec import template_spec

    template_workflow = {"target": "app", "nodes": [
        {"id": node["id"], "kind": "state", "order": i, **node["code_ref"]}
        for i, node in enumerate(workflow.get("states", []))]}
    if template_workflow["nodes"]:
        template_digest = spec_digest(template_spec(template_workflow).model_dump(mode="json"))
        facts.append(_fact("template_spec", "lock", "plan", "Template definitions",
                           f"Report cohort definitions use template digest {template_digest}.",
                           "/api/journeys/spec template", data={"digest": template_digest}))

    v1 = body.get("v1")
    facts.append(_fact(
        "lock_v1", "lock", "plan", "Hypothesis lock (v1)",
        f"Hypotheses locked in snapshot v1, digest {v1['digest']}." if v1
        else "Hypotheses are not locked yet.",
        "/api/report v1",
        data={"locked": bool(v1), "digest": v1["digest"] if v1 else None,
              "data_cutoff": v1["data_cutoff"] if v1 else None},
    ))
    facts.append(_fact(
        "run_mode", "run", "run", "Run mode",
        {"seed": "Seed run: a demonstration dataset of simulated sessions.",
         "demo": "Demo run: a prepared investigation with recorded activity.",
         "replay": "Replay: a recorded run, not a live investigation."}.get(
            run.get("mode", ""), f"{run.get('mode', 'unknown')} run."),
        "/api/report run.mode", data={"mode": run.get("mode")},
    ))
    return {"title": TITLE, "investigation_id": body["investigation_id"], "facts": facts}


def digest(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def _by_id(value: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    return {f["id"]: f for f in value["facts"]}


def _known_strings(value: Mapping[str, Any]) -> list[str]:
    """Quoted statements, stems and code descriptions are source text, not claims."""
    texts: set[str] = set()
    for f in value["facts"]:
        data = f["data"]
        texts |= {s for s in (data.get("statement"), data.get("stem"), data.get("desc")) if s}
        texts |= {r["quote"] for r in f["refs"] if r.get("quote")}
        if f["kind"] == "code":
            texts.add(f["statement"])
    return sorted(texts, key=len, reverse=True)


def _units(markdown: str) -> list[tuple[str, str, str, list[str]]]:
    """(section, kind, text, line citations) for every sentence, heading and table row.

    A sentence without its own citation is supported by the citations of its line (a list
    item, table row or paragraph line), e.g. "… 1 of 6 respondents. Status: … [fact:x]".
    """
    units: list[tuple[str, str, str, list[str]]] = []
    section = ""
    for raw in markdown.splitlines():
        line = raw.strip()
        if not line or line == "---" or TABLE_RULE.match(line):
            continue
        if line.startswith("#"):
            if line.startswith("## "):
                section = line[3:].strip()
            units.append((section, "heading", line.lstrip("#").strip(), []))
            continue
        if line.startswith("|"):
            units.append((section, "row", line, CITATION.findall(line)))
            continue
        line = re.sub(r"^(?:[-*]|\d+\.|>)\s*", "", line)
        if CALLOUT.match(line) or not line:
            continue
        line = TRAILING_CITES.sub(r"\2\1", line)
        line_cites = CITATION.findall(line)
        units += [(section, "sentence", s, line_cites)
                  for s in SENTENCE.split(line) if s.strip()]
    return units


def check(markdown: str, value: Mapping[str, Any]) -> list[str]:
    """Problems with the document against the facts; empty means every claim is traced."""
    facts = _by_id(value)
    problems: list[str] = []
    headings = [line[3:].strip() for line in markdown.splitlines() if line.startswith("## ")]
    if headings != list(OUTLINE):
        problems.append(f"sections must be exactly {list(OUTLINE)}, got {headings}")
    if sum(1 for line in markdown.splitlines() if line.startswith("# ")) != 1:
        problems.append("exactly one '# ' title is required")
    for number, raw in enumerate(markdown.splitlines(), 1):
        line = raw.strip()
        if raw.startswith(("    ", "\t")) or line.startswith("####"):
            problems.append(f"line {number}: only '#', '##' and '###' headings, no indented blocks")
        if UNSAFE_INLINE.search(CODE_SPAN.sub("", line)):
            problems.append(f"line {number}: no HTML, links, images or code fences")
        if line.startswith(">") and line != ">" and not line.startswith("> "):
            problems.append(f"line {number}: callout lines start with '> '")

    problems += [f"unknown placeholder {m.group(0)}: use one listed in the fact's placeholders"
                 for m in PLACEHOLDER.finditer(markdown)]
    known_h = {f["label"] for f in value["facts"] if f["kind"] == "hypothesis"}
    quoted = _known_strings(value)
    cited_in: dict[str, set[str]] = {}
    for section, kind, text, line_cites in _units(markdown):
        cites = CITATION.findall(text) or line_cites
        for c in cites:
            cited_in.setdefault(section, set()).add(c)
        problems += [f"unknown citation [fact:{c}]" for c in cites if c not in facts]
        cited = [facts[c] for c in cites if c in facts]
        plain = CITATION.sub(" ", CODE_SPAN.sub(" ", text))
        for statement in quoted:
            plain = plain.replace(statement, "…")
        problems += [f"forbidden wording {m.group(0)!r} in: {text[:80]}"
                     for m in FORBIDDEN.finditer(plain)]
        if kind == "heading":
            continue
        problems += [f"unknown hypothesis {h} in: {text[:80]}"
                     for h in sorted({f"H{m}" for m in HYPOTHESIS.findall(plain)} - known_h)]
        problems += [f"vague quantity {m.group(0)!r}: write 'k of n' and cite a fact"
                     for m in VAGUE.finditer(plain)]
        problems += [f"'{m.group(0)}' without a unit (respondents or sessions)"
                     for m in BARE_K_OF_N.finditer(plain)]
        # Spelled-out quantities are checked like digits ("two outcomes" = 2).
        words = [m.group(0) for m in NUMBER_WORDS.finditer(plain)]
        problems += [f"vague quantity {w!r}: write 'k of n' and cite a fact"
                     for w in words if w.lower() not in WORD_VALUES]
        numbers = NUMBER.findall(plain) + [str(WORD_VALUES[w.lower()]) for w in words
                                           if w.lower() in WORD_VALUES]
        if numbers and not cited:
            problems.append(f"numbers without a citation: {text[:80]}")
            continue
        allowed = {n for f in cited for n in f["numbers"]}
        # "2 outcomes … [fact:a] [fact:b]": a count of the facts the sentence itself cites.
        kinds_cited: dict[str, set[str]] = {}
        for f in cited:
            kinds_cited.setdefault(f["kind"], set()).add(f["id"])
        allowed |= {len(ids) for ids in kinds_cited.values()}
        problems += [f"number {n} is not in the cited facts: {text[:80]}"
                     for n in numbers if int(n) not in allowed]
        pairs = {(k, n, unit) for f in cited for k, n, unit in f["pairs"]}
        for k, n, unit in K_OF_N.findall(plain):
            unit = "respondents" if unit.lower().startswith("respondent") else "sessions"
            if (int(k), int(n), unit) not in pairs:
                problems.append(f"'{k} of {n} {unit}' matches no cited fact: {text[:80]}")
        for k, n in SPLIT.findall(plain):
            if (int(k), int(n), "respondents") not in pairs | {
                    (int(k), int(n), "sessions")}:
                problems.append(f"split '{k} of {n}' matches no cited fact: {text[:80]}")
        kinds = {f["evidence"] for f in cited}
        if "self_report" in kinds and kinds & {"observed", "code"}:
            problems.append("self-reported answers and recorded observations share one "
                            f"sentence; keep them apart: {text[:80]}")
        if (any(f["kind"] == "outcome" and f["data"]["instrumentation"] == "unknown"
                for f in cited) and GAP_WORDS.search(plain) and not GAP_HEDGE.search(plain)):
            problems.append(f"an outcome with unknown instrumentation is not a gap: {text[:80]}")

    everywhere = set().union(*cited_in.values()) if cited_in else set()
    if "population" not in cited_in.get("Executive Summary", set()):
        problems.append("the Executive Summary must cite [fact:population]")
    for f in value["facts"]:
        if f["kind"] == "limit" and not f["data"]["ok"] and f["id"] not in cited_in.get(
                "6. Limitations", set()):
            problems.append(f"6. Limitations must cite [fact:{f['id']}] ({f['statement']})")
        if f["kind"] == "finding" and f["id"] not in cited_in.get("3. Hypothesis Findings",
                                                                 set()):
            problems.append(f"3. Hypothesis Findings must cite [fact:{f['id']}]")
        if (f["kind"] == "outcome" and f["data"]["instrumentation"] == "unknown"
                and f["id"] not in cited_in.get("4. Evidence Gaps", set())):
            problems.append(f"4. Evidence Gaps must cite [fact:{f['id']}]")
    if not everywhere:
        problems.append("the document cites no facts")
    return problems


def _ref_text(fact: Mapping[str, Any]) -> str:
    if not fact["refs"]:
        return ""
    ref = fact["refs"][0]
    lines = ref["lines"]
    span = f"{lines[0]}" if len(lines) < 2 or lines[0] == lines[1] else f"{lines[0]}-{lines[1]}"
    return f"`{ref['file']}:{span}`"


def template(value: Mapping[str, Any]) -> str:
    """Deterministic document in the same outline; passes `check` by construction."""
    facts = _by_id(value)
    pop = facts["population"]["data"]
    total = pop["sessions"]
    sources = pop["sources"]
    cohorts = [facts[_id("cohort", c)] for c in COHORTS]
    coverage = facts["coverage"]["data"]
    probes = [f for f in value["facts"] if f["kind"] == "probe"]
    findings = [f for f in value["facts"] if f["kind"] == "finding"]
    hypotheses = [f for f in value["facts"] if f["kind"] == "hypothesis"]
    outcomes = [f for f in value["facts"] if f["kind"] == "outcome"]
    unknown = [f for f in outcomes if f["data"]["instrumentation"] == "unknown"]
    review = [f for f in outcomes if f["data"]["instrumentation"] == "not_found_in_scope"]
    limits = [f for f in value["facts"] if f["kind"] == "limit"]
    r2 = facts["rule_r2"]
    tally = facts["instrumentation"]["data"]
    lock = facts["lock_v1"]["data"]

    def sessions(k: int) -> str:
        return f"{k} of {total} sessions"

    out = [f"# {value['title']}", ""]
    out += ["## Executive Summary", ""]
    out.append(f"- **What was investigated.** {total} recorded sessions in investigation "
               f"`{value['investigation_id']}` were grouped by the events the application "
               "recorded. [fact:population]")
    gate, connected = facts[_id("cohort", "gate_event_no_attempt")], facts[
        _id("cohort", "connected")]
    out.append(f"- **What was observed.** {sessions(gate['data']['sessions'])} reached the "
               f"wallet gate without a recorded attempt, and "
               f"{sessions(connected['data']['sessions'])} recorded a connection. "
               f"[fact:{gate['id']}] [fact:{connected['id']}]")
    top = sorted((f for f in findings if f["data"]["selected"]
                  and f["data"]["hypothesis_id"] != "H_other"),
                 key=lambda f: (-f["data"]["selected"], f["data"]["hypothesis_id"]))[:2]
    for f in top:
        d = f["data"]
        statement = facts[_id("hypothesis", d["hypothesis_id"])]["data"]["statement"]
        out.append(f"- **What participants reported.** At {d['decision_point']}, "
                   f"{d['hypothesis_id']} (\u201c{statement}\u201d) was selected by "
                   f"{d['selected']} of {d['respondents']} respondents. [fact:{f['id']}]")
    out.append(f"- **What remains unknown.** {sessions(coverage['unknown'])} have unknown "
               f"coverage, and {tally['unknown']} workflow outcomes have unresolved "
               "instrumentation. [fact:coverage] [fact:instrumentation]")
    out.append("")
    out.append("> [!NOTE]")
    out.append("> These observations describe what the application recorded. They do not "
               "establish why a participant did or did not connect a wallet.")
    out.append("")

    out += ["## 1. Investigation Scope", "", "### Population and snapshot", ""]
    split = ", ".join(f"{SOURCE_NAMES[s]} {sources[s]}" for s in ("seed", "test", "visitor")
                      if sources.get(s))
    out.append(f"The snapshot holds {total} recorded sessions"
               + (f" ({split})" if split else "") + ". [fact:population]"
               + (" Seed sessions are simulated users, not participants."
                  if sources.get("seed") else ""))
    out.append("")
    out.append(f"Hypotheses were locked in snapshot v1 (digest `{lock['digest'][:12]}`) "
               "before answers were read. [fact:lock_v1]" if lock["locked"]
               else "Hypotheses are not locked yet, so no answers are reported. [fact:lock_v1]")
    out += ["", "### Cohort definitions", "",
            "| Cohort | Recorded rule | Sessions |", "| --- | --- | --- |"]
    for c in cohorts:
        out.append(f"| {c['label']} | {c['data']['rule']} | {sessions(c['data']['sessions'])} "
                   f"[fact:{c['id']}] |")
    out += ["", "Each session belongs to exactly one cohort, decided by recorded events only.",
            "", "### Locked hypotheses", ""]
    for h in hypotheses:
        out.append(f"- **{h['label']}** “{h['data']['statement']}” [fact:{h['id']}]")
    out.append("")

    out += ["## 2. Observed User Behavior", "", "### Recorded journeys", "",
            "| Cohort | Sessions | Recorded exits |", "| --- | --- | --- |"]
    for c in cohorts:
        exits = ", ".join(f"`{k}` {v}" for k, v in c["data"]["exit_types"].items()) or "None"
        out.append(f"| {c['label']} | {sessions(c['data']['sessions'])} | {exits} "
                   f"[fact:{c['id']}] |")
    out += ["", "### Coverage", ""]
    out.append(f"{sessions(coverage['complete'])} have complete coverage and "
               f"{sessions(coverage['unknown'])} have unknown coverage. [fact:coverage] "
               "An event that is not recorded in an unknown-coverage session is not evidence "
               "that the step did not happen.")
    out += ["", "### Instrumentation", ""]
    out.append(f"Of {tally['outcomes']} workflow outcomes, {tally['found_in_code']} have a "
               f"tracking call in the searched code, {tally['not_found_in_scope']} were not "
               f"found in the searched files, and {tally['unknown']} are unknown. "
               "[fact:instrumentation]")
    out.append("")

    out += ["## 3. Hypothesis Findings", ""]
    for probe in probes:
        d = probe["data"]
        out.append(f"At {d['decision_point']} the exit question was shown in {d['shown']} "
                   f"sessions: {d['answered']} of {d['shown']} sessions answered and "
                   f"{d['skipped']} of {d['shown']} sessions skipped. [fact:{probe['id']}]")
        out.append("")
    for h in hypotheses:
        own = [f for f in findings if f["data"]["hypothesis_id"] == h["label"]]
        out += [f"### {h['label']}", "", f"*“{h['data']['statement']}”* "
                f"[fact:{h['id']}]", ""]
        if not own:
            out += ["- **Self-reported evidence.** No respondent has seen this option yet.", ""]
        for f in own:
            d = f["data"]
            split_text = ", ".join(f"{SOURCE_NAMES.get(s, s)} {v['selected']} of "
                                   f"{v['respondents']}" for s, v in d["by_source"].items())
            out.append(f"- **Self-reported at {d['decision_point']}.** "
                       f"{d['selected']} of {d['respondents']} respondents selected this answer"
                       + (f" ({split_text})" if split_text else "") + f". [fact:{f['id']}] "
                       f"Evidence status: {d['status'].lower()}.")
        if h["data"]["r2_applies"]:
            contradicted = h["label"] in r2["data"]["contradicted_hypotheses"]
            out.append("- **Contradiction rule.** R2 applies to this hypothesis and "
                       + ("contradicted it in complete-coverage sessions only."
                          if contradicted else "did not contradict it.")
                       + " [fact:rule_r2]")
        else:
            out.append("- **Contradiction rule.** R2 does not apply to this hypothesis.")
        out.append("")
    out.append("Answers are self-reports from the people who responded. They are kept apart "
               "from what the application recorded.")
    out.append("")

    out += ["## 4. Evidence Gaps", "", "### Unresolved search scopes", ""]
    for f in unknown or []:
        out.append(f"- `{f['label']}` {_ref_text(f)}: instrumentation unknown; this is not "
                   f"established as a gap. [fact:{f['id']}]")
    if not unknown:
        out.append("- No outcome has unknown instrumentation.")
    out += ["", "### Missing instrumentation candidates", ""]
    for f in review:
        out.append(f"- `{f['label']}` {_ref_text(f)}: no tracking call was found in the "
                   f"searched files; a candidate for review. [fact:{f['id']}]")
    if not review:
        out.append("- No candidates: every searched outcome has a tracking call or an "
                   "unresolved scope.")
    scope = facts["code_scope"]["data"]
    out += ["", f"The search covered {len(scope['searched_files'])} files with "
            f"{len(scope['unresolved_imports'])} unresolved imports. [fact:code_scope]", ""]

    out += ["## 5. Recommended Actions", ""]
    step = 1
    if unknown:
        out.append(f"{step}. Resolve the search scope for the {tally['unknown']} outcomes with "
                   "unknown instrumentation before recommending new tracking. "
                   "[fact:instrumentation]")
        step += 1
    if review:
        out.append(f"{step}. Review the {tally['not_found_in_scope']} candidates not found in "
                   "the searched files; where the code has an outcome without a tracking "
                   "call, add the event and rerun the investigation. [fact:instrumentation]")
        step += 1
    out.append(f"{step}. Check that connection events carry their attempt context before "
               "relying on `attempt_id` to join attempts and outcomes.")
    step += 1
    if any(not f["data"]["ok"] for f in limits):
        out.append(f"{step}. Rerun from a committed, verified build, then verify the "
                   "gate event against that build. [fact:limit_build]")
    out.append("")

    out += ["## 6. Limitations", "", "> [!WARNING]"]
    for f in limits:
        if not f["data"]["ok"]:
            out.append(f"> - **{f['label']}:** {f['data']['value']}. [fact:{f['id']}]")
    if sources.get("seed"):
        out.append(f"> - **Simulated sessions:** {sources['seed']} of {total} sessions are "
                   "seed sessions from simulated users. [fact:population]")
    for probe in probes:
        d = probe["data"]
        out.append(f"> - **Non-response at {d['decision_point']}:** {d['skipped']} of "
                   f"{d['shown']} sessions skipped and {d['shown_no_response']} of {d['shown']} "
                   "sessions gave no response; their reasons are unknown. "
                   f"[fact:{probe['id']}]")
    out.append(f"> - **Unknown coverage:** {sessions(coverage['unknown'])} have unknown "
               "coverage, so an event not recorded there is not evidence of absent "
               "behaviour. [fact:coverage]")
    out.append("> - **Self-reports:** answers describe the people who responded; they do not "
               "establish why others left.")
    out.append("")

    out += ["## Appendix", "", "### v1 digest", ""]
    out.append(f"`{lock['digest']}` [fact:lock_v1]" if lock["locked"]
               else "Not locked yet. [fact:lock_v1]")
    if "template_spec" in facts:
        out += ["", "### Template definitions", "",
                f"`{facts['template_spec']['data']['digest']}` [fact:template_spec]",
                "The report uses the original template. Generated definitions are a separate "
                "comparison and do not change the locked hypotheses or these counts."]
    out += ["", "### Source references", ""]
    for f in outcomes:
        if f["refs"]:
            out.append(f"- {_ref_text(f)} `{f['label']}` [fact:{f['id']}]")
    out += ["", "### Raw facts", "",
            "Every fact cited above, with its source in `/api/report`, is published with "
            "this document and opens in the evidence inspector."]
    return "\n".join(out) + "\n"


def handles(value: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    """Short handles the LLM writes instead of numbers: f1, f2, … in fact order."""
    return {f"f{i}": fact for i, fact in enumerate(value["facts"], 1)}


def _placeholder(fact: Mapping[str, Any], key: str | None) -> str | None:
    """`{fN}` is the fact's first count, `{fN.2}` its second, `{fN.statement}` the quoted
    statement or question stem, `{fN.<field>}` a number or word from its data."""
    pairs = fact["pairs"]
    if key is None or key.isdigit():
        index = int(key or 1) - 1
        if 0 <= index < len(pairs):
            k, n, unit = pairs[index]
            return f"{k} of {n} {unit}"
        return str(fact["data"]["value"]) if key is None and "value" in fact["data"] else None
    item = fact["data"].get(key)
    if key in ("statement", "stem") and isinstance(item, str):
        return f"\u201c{item}\u201d"
    if isinstance(item, (int, str)) and not isinstance(item, bool):
        return str(item)
    return None


def placeholders(value: Mapping[str, Any]) -> dict[str, dict[str, str]]:
    """Every placeholder each fact offers, with the text it becomes."""
    table: dict[str, dict[str, str]] = {}
    for handle, fact in handles(value).items():
        keys: list[str | None] = [None, *(str(i) for i in range(2, len(fact["pairs"]) + 1)),
                                  *fact["data"]]
        offered = {(f"{{{handle}}}" if key is None else f"{{{handle}.{key}}}"):
                   text for key in keys if (text := _placeholder(fact, key)) is not None}
        table[fact["id"]] = offered
    return table


def expand(markdown: str, value: Mapping[str, Any]) -> str:
    """Insert each placeholder's text, and cite its fact in the same sentence or row."""
    table = handles(value)

    def fill(text: str, used: list[str]) -> str:
        def one(match: re.Match[str]) -> str:
            fact = table.get(match.group(1))
            text = _placeholder(fact, match.group(2)) if fact else None
            if fact is None or text is None:
                return match.group(0)  # left in place; `check` reports it
            if fact["id"] not in used:
                used.append(fact["id"])
            return text
        return PLACEHOLDER.sub(one, text)

    def cite(text: str, used: list[str]) -> str:
        missing = "".join(f" [fact:{i}]" for i in used if f"[fact:{i}]" not in text)
        if not missing:
            return text
        body, end = re.match(r"^(.*?)([.!?]?\s*)$", text, re.DOTALL).groups()  # type: ignore[union-attr]
        return body.rstrip() + missing + end

    out = []
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("#") or not PLACEHOLDER.search(line):
            out.append(fill(line, []) if stripped.startswith("#") else line)
            continue
        if stripped.startswith("|"):
            used: list[str] = []
            row = fill(line.rstrip(), used)
            cells = row.rsplit("|", 2)
            out.append(f"{cells[0]}|{cite(cells[1], used).rstrip()} |"
                       if len(cells) == 3 else row)
            continue
        line = TRAILING_CITES.sub(r"\2\1", line)
        parts = re.split(r"(?<=[.!?])(\s+)", line)
        rebuilt = []
        for part in parts:
            if part.isspace() or not part:
                rebuilt.append(part)
                continue
            used = []
            rebuilt.append(cite(fill(part, used), used))
        out.append("".join(rebuilt))
    return "\n".join(out) + ("\n" if markdown.endswith("\n") else "")


def generate(llm: LLM, value: Mapping[str, Any], *, attempts: int = 2) -> dict[str, Any]:
    """LLM document that passes `check`, else the template (with the reasons)."""
    fallback = template(value)
    problems: list[str] = []
    markdown = ""
    offered = placeholders(value)
    for _ in range(attempts):
        payload: dict[str, Any] = {
            "outline": OUTLINE,
            "context": {**value, "facts": [
                {"handle": handle, **fact, "placeholders": offered[fact["id"]]}
                for handle, fact in handles(value).items()]},
        }
        if problems:
            payload["previous_markdown"] = markdown
            payload["checker_problems"] = problems[:40]
        try:
            draft = llm.call(*DOCUMENT, ReportDocument, context="",
                             instructions=json.dumps(payload, ensure_ascii=False),
                             system=SYSTEM)
        except Exception as error:  # noqa: BLE001 - any LLM failure falls back to the template
            return {"markdown": fallback, "source": "template", "rejected": [f"llm: {error}"]}
        markdown = expand(draft.markdown.strip() + "\n", value)
        problems = check(markdown, value)
        if not problems:
            return {"markdown": markdown, "source": "llm", "rejected": []}
    return {"markdown": fallback, "source": "template", "rejected": problems}
