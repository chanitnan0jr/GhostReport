"""Hypothesis evidence map: every link already in the locked investigation and the data.

Columns, left to right: code facts → hypotheses → answer options and rule R2 → findings
(k of n respondents, split by source) → segment. Nothing here is written by an LLM, and
a hypothesis is never called a cause: findings stay self-report, rule R2 an observation.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from engine.investigation import Investigation
from engine.journeys import NODES, SEGMENT_OF
from engine.stages import RULE_CATALOG
from engine.workflow_view import workflow_view

R2_CLASS = "HC-gate-permission"
COLUMNS = ("Code evidence", "Hypotheses", "Answer options and rules", "Findings", "Segment")


def evidence_graph(investigation: Investigation,
                   findings: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, str]] = []

    def add(node_id: str, column: int, kind: str, **fields: Any) -> None:
        nodes.setdefault(node_id, {"id": node_id, "column": column, "kind": kind, **fields})

    def link(source: str, target: str, relation: str) -> None:
        if {"source": source, "target": target, "relation": relation} not in edges:
            edges.append({"source": source, "target": target, "relation": relation})

    code = {n["id"]: n for n in workflow_view("app", investigation)["nodes"]}
    approved = {m.hypothesis_id: m.class_id for m in investigation.class_mappings}
    by_hypothesis: dict[str, list[Mapping[str, Any]]] = {}
    for finding in findings:
        by_hypothesis.setdefault(finding["hypothesis_id"], []).append(finding)

    for hypothesis in investigation.hypotheses.hypotheses:
        hid = f"h:{hypothesis.id}"
        rows = by_hypothesis.get(hypothesis.id, [])
        add(hid, 1, "hypothesis", label=hypothesis.id, statement=hypothesis.statement,
            approved_class=approved.get(hypothesis.id), generic=hypothesis.generic,
            v1="Unresolved (locked before any evidence)",
            current=sorted({r["self_report"] for r in rows if r["respondents"]})
            or ["Unresolved"])
        for fact_id in hypothesis.code_evidence:
            fact = code.get(fact_id)
            if fact is None:
                continue
            add(f"code:{fact_id}", 0, "code", label=fact_id, desc=fact["desc"],
                file=fact["file"], lines=fact["lines"], quote=fact["quote"],
                instrumentation=fact["instrumentation"], permalink=fact["permalink"])
            link(f"code:{fact_id}", hid, "cited by")
        if approved.get(hypothesis.id) == R2_CLASS:
            add("rule:R2", 2, "rule", label="Rule R2", text=RULE_CATALOG["R2"])
            link(hid, "rule:R2", "checked by")

    for question in investigation.questions:
        point = question.decision_point
        plan = next((p for p in investigation.plans
                     if p.question_version == question.question_version), None)
        cohorts = plan.target_cohorts if plan else ()
        for option in question.options:
            oid = f"o:{point}:{option.id}"
            add(oid, 2, "option", label=option.label, decision_point=point)
            for hypothesis_id in option.hypothesis_ids:
                link(f"h:{hypothesis_id}", oid, "answer option")
        for cohort in cohorts:
            segment = SEGMENT_OF[cohort]
            add(f"s:{segment}", 4, "segment", label=NODES[(7, segment)], segment=segment)

    asked = {(q.decision_point, h) for q in investigation.questions
             for o in q.options for h in o.hypothesis_ids}
    for finding in findings:
        hypothesis_id, point = finding["hypothesis_id"], finding["decision_point"]
        if (point, hypothesis_id) not in asked:
            continue  # no answer option for it at this point: it was never asked there
        fid = f"f:{point}:{hypothesis_id}"
        add(fid, 3, "finding", label=f"{hypothesis_id} at {point}", decision_point=point,
            cohort=finding["cohort"], selected=finding["selected"],
            respondents=finding["respondents"], by_source=finding.get("by_source", {}),
            self_report=finding["self_report"], observation=finding["observation"],
            text=finding.get("text", ""))
        link(f"h:{hypothesis_id}", fid, "self-report")
        for option in (o for q in investigation.questions if q.decision_point == point
                       for o in q.options if hypothesis_id in o.hypothesis_ids):
            link(f"o:{point}:{option.id}", fid, "counted in")
        if "rule:R2" in nodes and approved.get(hypothesis_id) == R2_CLASS:
            link("rule:R2", fid, finding["observation"])
        link(fid, f"s:{SEGMENT_OF[finding['cohort']]}", "asked in")
        add(f"s:{SEGMENT_OF[finding['cohort']]}", 4, "segment",
            label=NODES[(7, SEGMENT_OF[finding["cohort"]])],
            segment=SEGMENT_OF[finding["cohort"]])

    # What to highlight when a hypothesis is clicked: everything reachable from it
    # (downstream) plus the code that cites it, never other hypotheses.
    outgoing: dict[str, list[str]] = {}
    for edge in edges:
        outgoing.setdefault(edge["source"], []).append(edge["target"])
    highlight = {}
    for hid in (n for n in nodes if n.startswith("h:")):
        seen, stack = {hid}, [hid]
        while stack:
            for target in outgoing.get(stack.pop(), []):
                if target not in seen and not target.startswith("h:"):
                    seen.add(target)
                    stack.append(target)
        seen |= {e["source"] for e in edges if e["target"] == hid}
        # Options and findings of other hypotheses are reachable via shared options;
        # keep only findings of this hypothesis.
        seen = {n for n in seen if not n.startswith("f:") or n.endswith(f":{hid[2:]}")}
        highlight[hid] = sorted(seen)

    return {
        "columns": [{"index": i, "label": label} for i, label in enumerate(COLUMNS)],
        "nodes": sorted(nodes.values(), key=lambda n: (n["column"], n["id"])),
        "edges": edges,
        "highlight": highlight,
        "notes": [
            "Hypotheses were proposed from the code and locked in v1 before any answer.",
            "Findings are self-reports ('k of n respondents'); rule R2 is an observation "
            "from events. Neither establishes a cause.",
        ],
    }
