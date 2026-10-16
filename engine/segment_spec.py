"""Validated journey definitions. Templates remain the report's source of truth.

Models contain definitions, never LLM-written counts or session assignments.
All comparisons are computed from recorded events, outside the locked report.
"""

import hashlib
import json
import re
from collections import Counter, defaultdict
from collections.abc import Sequence
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from engine.llm import LLM, LLMError
from engine.models import Event, SessionStats
from engine.seed import SOURCES, session_source

Project = Literal["app", "ens"]
WORDING = re.compile(
    r"%|\b(confirmed|root cause|causes?|caused|causing|proved|browsers?|curious|"
    r"gave up|not interested|unmotivated|hesitant|confused|confusion|frustrated|"
    r"afraid|unaware|distrust|reluctant|zero|one|two|three|four|five|six|seven|eight|"
    r"nine|ten|twenty|half|most|majority)\b", re.IGNORECASE)
KEY = r"^[A-Za-z][A-Za-z0-9_.:-]{0,95}$"
EVENT_ARITY = {"has": (1, 1), "lacks": (1, 1), "has_after": (2, 2),
               "last_event_in": (1, 20)}


def predicate_schema(schema: dict[str, Any]) -> None:
    """Publish the same operator shapes that the runtime validator enforces."""
    branches = []
    for op in (*EVENT_ARITY, "all", "any", "attempt_outcome", "always"):
        properties: dict[str, Any] = {
            "events": {"maxItems": 0}, "children": {"maxItems": 0},
            "outcome": {"type": "null"},
        }
        required = []
        if op in EVENT_ARITY:
            low, high = EVENT_ARITY[op]
            properties["events"] = {"minItems": low, "maxItems": high}
            required = ["events"]
        elif op in ("all", "any"):
            properties["children"] = {"minItems": 1, "maxItems": 10}
            required = ["children"]
        elif op == "attempt_outcome":
            properties["outcome"] = {"enum": ["none", "connected", "errored"]}
            required = ["outcome"]
        branches.append({"if": {"properties": {"op": {"const": op}}, "required": ["op"]},
                         "then": {"properties": properties, "required": required}})
    schema["allOf"] = branches


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Predicate(Model):
    model_config = ConfigDict(json_schema_extra=predicate_schema)

    op: Literal["has", "lacks", "has_after", "last_event_in", "attempt_outcome",
                "all", "any", "always"]
    events: tuple[str, ...] = Field(default=(), max_length=20)
    outcome: Literal["none", "connected", "errored"] | None = None
    children: tuple["Predicate", ...] = Field(default=(), max_length=10)

    @model_validator(mode="after")
    def shape(self) -> "Predicate":
        if self.op in EVENT_ARITY:
            low, high = EVENT_ARITY[self.op]
            if not low <= len(self.events) <= high:
                expected = f"exactly {low} event" if low == high == 1 else (
                    f"exactly {low} events" if low == high else f"{low} to {high} events")
                raise ValueError(
                    f"{self.op} requires {expected}; received {len(self.events)}. "
                    "Use all/any with separate predicates to combine event conditions.")
            if self.children or self.outcome:
                raise ValueError(f"{self.op} accepts only events, not children or outcome")
        elif self.op in ("all", "any"):
            if not self.children or self.events or self.outcome:
                raise ValueError("compound predicate needs only children")
        elif self.op == "attempt_outcome":
            if self.outcome is None or self.events or self.children:
                raise ValueError("attempt_outcome needs only outcome")
        elif self.events or self.children or self.outcome:
            raise ValueError("always takes no arguments")
        return self


class Evidence(Model):
    node_id: str = Field(pattern=KEY)
    file: str | None = Field(default=None, min_length=1, max_length=300)
    lines: tuple[int, int] | None = None
    quote: str | None = Field(default=None, max_length=6000)


class Column(Model):
    state_id: str = Field(pattern=KEY)
    events: tuple[str, ...] = Field(default=(), max_length=20)


class Rule(Model):
    id: str = Field(pattern=KEY)
    label: str = Field(min_length=1, max_length=100)
    segment: str = Field(pattern=KEY)
    predicate: Predicate
    evidence: tuple[Evidence, ...] = Field(min_length=1, max_length=10)
    rationale: str = Field(min_length=1, max_length=400)


class Segment(Model):
    id: str = Field(pattern=KEY)
    label: str = Field(min_length=1, max_length=100)


class SegmentSpec(Model):
    project: Project
    version: int = Field(ge=1)
    columns: tuple[Column, ...] = Field(min_length=1, max_length=40)
    rules: tuple[Rule, ...] = Field(min_length=2, max_length=30)
    segments: tuple[Segment, ...] = Field(min_length=1, max_length=30)


def digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def walk(predicate: Predicate) -> list[Predicate]:
    return [predicate, *(item for c in predicate.children for item in walk(c))]


def required_events(predicate: Predicate) -> set[str]:
    if predicate.op in ("has", "has_after"):
        return set(predicate.events)
    if predicate.op == "all":
        return set().union(*(required_events(c) for c in predicate.children))
    if predicate.op == "any":
        return set.intersection(*(required_events(c) for c in predicate.children))
    return set()


def implies(later: Predicate, earlier: Predicate) -> bool:
    """A conservative check for rules that first-match ordering makes unreachable."""
    if later == earlier:
        return True
    if earlier.op == "has":
        return earlier.events[0] in required_events(later)
    if earlier.op == "any":
        return any(implies(later, c) for c in earlier.children)
    if earlier.op == "all":
        return all(implies(later, c) for c in earlier.children)
    return False


def validate(spec: SegmentSpec, workflow: dict[str, Any], vocabulary: Sequence[str]) -> list[str]:
    """References must equal the checked Workflow Map; text is never trusted."""
    errors: list[str] = []
    nodes = {n["id"]: n for n in workflow["nodes"]}
    states = [n["id"] for n in sorted(workflow["nodes"], key=lambda n: n["order"])
              if n["kind"] == "state"]
    if spec.project != workflow["target"]:
        errors.append("project does not match Workflow Map")
    if [c.state_id for c in spec.columns] != states:
        errors.append("columns must follow every Workflow Map state in order")
    for kind, ids in (("rule", [r.id for r in spec.rules]),
                      ("segment", [s.id for s in spec.segments])):
        if len(ids) != len(set(ids)):
            errors.append(f"duplicate {kind} id")
    if spec.rules[-1].predicate.op != "always" or spec.rules[-1].label != "No rule matched":
        errors.append("last rule must be the No rule matched catch-all")
    if any(r.predicate.op == "always" for r in spec.rules[:-1]):
        errors.append("only the last rule may be a catch-all")
    for index, rule in enumerate(spec.rules[:-1]):
        if any(implies(rule.predicate, previous.predicate) for previous in spec.rules[:index]):
            errors.append(f"unreachable rule under first-match order: {rule.id}")
    event_names = set(vocabulary)
    segments = {s.id for s in spec.segments}
    if segments != {r.segment for r in spec.rules}:
        errors.append("segments must exactly group the rules")
    for text in [s.label for s in spec.segments] + [t for r in spec.rules
                                                   for t in (r.label, r.rationale)]:
        if WORDING.search(text) or re.search(r"\d|https?://|[<>]", text):
            errors.append("labels/rationales must describe records, without intent or numbers")
    used = {e for c in spec.columns for e in c.events}
    for rule in spec.rules:
        predicates = walk(rule.predicate)
        if len(predicates) > 60:
            errors.append("predicate is too complex")
        if any(p.op == "always" for p in predicates[1:]):
            errors.append("catch-all cannot be nested")
        for pred in predicates:
            used.update(pred.events)
            if pred.op == "attempt_outcome":
                used.add({"none": "wallet_attempted", "connected": "wallet_connected",
                          "errored": "wallet_errored"}[pred.outcome or "none"])
        for ref in rule.evidence:
            node = nodes.get(ref.node_id)
            if node is None:
                errors.append(f"unknown evidence id: {ref.node_id}")
            elif ref.file is None and ref.lines is None and ref.quote is None:
                if node.get("ref_check") == "wrong":
                    errors.append(f"evidence failed manual review: {ref.node_id}")
            elif (ref.file, list(ref.lines or ()), ref.quote) != (
                    node["file"], node["lines"], node["quote"]):
                errors.append(f"evidence differs from Workflow Map: {ref.node_id}")
            elif node.get("ref_check") == "wrong":
                errors.append(f"evidence failed manual review: {ref.node_id}")
    errors.extend(f"unknown event: {e}" for e in sorted(used - event_names))
    return sorted(set(errors))


def resolve_refs(spec: SegmentSpec, workflow: dict[str, Any]) -> SegmentSpec:
    """The engine supplies source facts; the model only needs to propose node IDs."""
    nodes = {n["id"]: n for n in workflow["nodes"]}
    return spec.model_copy(update={"rules": tuple(rule.model_copy(update={
        "evidence": tuple(Evidence(node_id=ref.node_id,
                                   file=nodes[ref.node_id]["file"],
                                   lines=tuple(nodes[ref.node_id]["lines"]),
                                   quote=nodes[ref.node_id]["quote"])
                          for ref in rule.evidence)}) for rule in spec.rules)})


def matches(predicate: Predicate, names: Sequence[str], complete: bool) -> bool | None:
    """None means an absence-dependent rule cannot be evaluated with this coverage."""
    op, events = predicate.op, predicate.events
    if op == "always":
        return True
    if op == "has":
        return events[0] in names
    if op == "lacks":
        return False if events[0] in names else True if complete else None
    if op == "has_after":
        return any(a == events[0] and events[1] in names[:i] for i, a in enumerate(names))
    if op == "last_event_in":
        return bool(names and names[-1] in events)
    if op == "attempt_outcome":
        if predicate.outcome == "none":
            return False if "wallet_attempted" in names else True if complete else None
        return f"wallet_{predicate.outcome}" in names
    values = [matches(c, names, complete) for c in predicate.children]
    if op == "all":
        return False if False in values else None if None in values else True
    return True if True in values else None if None in values else False


def assignment(spec: SegmentSpec, names: Sequence[str], complete: bool) -> tuple[str, str]:
    for rule in spec.rules:
        match = matches(rule.predicate, names, complete)
        if match is None:
            return "unknown_coverage", "unknown_coverage"
        if match:
            return rule.id, rule.segment
    raise ValueError("spec has no catch-all")


def event_groups(events: Sequence[Event]) -> dict[str, list[Event]]:
    from engine.cohorts import unique_events

    groups: dict[str, list[Event]] = defaultdict(list)
    for event in sorted(unique_events(events), key=lambda e: (e.session_id, e.seq)):
        groups[event.session_id].append(event)
    return groups


def aggregate_context(events: Sequence[Event], sessions: Sequence[SessionStats]) -> dict[str, Any]:
    """No IDs, addresses, responses or ground truth enter the model context."""
    groups = event_groups(events)
    paths = Counter(tuple(e.event for e in groups[s.session_id]) for s in sessions)
    coverage = Counter(s.coverage for s in sessions)
    return {"top_paths": [{"events": list(path), "sessions": n}
                          for path, n in paths.most_common(20)],
            "coverage": dict(coverage), "sessions": len(sessions)}


def comparison(spec: SegmentSpec, workflow: dict[str, Any], events: Sequence[Event],
               sessions: Sequence[SessionStats], *, code_only: bool = False) -> dict[str, Any]:
    """Compute counts and template cross-tabs; no session identifiers leave this view."""
    nodes = {n["id"]: n for n in workflow["nodes"]}
    columns = [{"id": c.state_id, "label": nodes[c.state_id]["desc"]} for c in spec.columns]
    result: dict[str, Any] = {"columns": columns, "code_only": code_only,
                              "segments": [], "nodes": [], "edges": []}
    if code_only:
        result["segments"] = [s.model_dump() for s in spec.segments]
        result["nodes"] = [{"id": c["id"], "column": i,
                            "label": c["id"] if nodes[c["id"]].get("ref_check") == "wrong"
                            else c["label"],
                            "ref_check": nodes[c["id"]].get("ref_check"),
                            "ref_note": nodes[c["id"]].get("ref_note")}
                           for i, c in enumerate(columns)]
        result["nodes"] += [
            {"id": f"segment:{s.id}", "column": len(columns), "label": s.label}
            for s in spec.segments]
        result["edges"] = [
            {"id": f"{a['id']}->{b['id']}", "source": a["id"], "target": b["id"]}
            for a, b in zip(columns, columns[1:], strict=False)]
        for rule in spec.rules:
            ref = rule.evidence[0]
            owner = ref.node_id if ref.node_id in {c.state_id for c in spec.columns} else next(
                (c.state_id for c in spec.columns if nodes[c.state_id]["file"] == ref.file),
                spec.columns[-1].state_id)
            result["edges"].append({"id": f"rule:{rule.id}", "source": owner,
                                    "target": f"segment:{rule.segment}"})
        return result
    groups = event_groups(events)
    totals: Counter[str] = Counter()
    sources: dict[str, Counter[str]] = defaultdict(Counter)
    template: dict[str, Counter[str]] = defaultdict(Counter)
    rule_counts: Counter[str] = Counter()
    node_counts: Counter[str] = Counter()
    edge_counts: Counter[tuple[str, str]] = Counter()
    for session in sessions:
        names = [e.event for e in groups[session.session_id]]
        rule_id, segment = assignment(spec, names, session.coverage == "complete")
        totals[segment] += 1
        sources[segment][session_source(session.session_id)] += 1
        template[segment][session.cohort] += 1
        rule_counts[rule_id] += 1
        steps = [c.state_id for c in spec.columns if any(e in names for e in c.events)]
        steps.append(f"segment:{segment}")
        node_counts.update(steps)
        edge_counts.update(zip(steps, steps[1:], strict=False))
    segments = [*spec.segments, Segment(id="unknown_coverage", label="Unknown coverage")]
    result.update(total_sessions=len(sessions), rules=dict(rule_counts))
    result["segments"] = [
        {**s.model_dump(), "sessions": totals[s.id], "total_sessions": len(sessions),
         "by_source": {k: sources[s.id][k] for k in SOURCES},
         "template_cohorts": dict(template[s.id])} for s in segments]
    result["nodes"] = [
        {"id": c.state_id, "column": i, "label": nodes[c.state_id]["desc"],
         **({"sessions": node_counts[c.state_id], "total_sessions": len(sessions)}
            if c.events else {})}
        for i, c in enumerate(spec.columns)] + [
        {"id": f"segment:{s.id}", "column": len(columns), "label": s.label,
         "sessions": totals[s.id], "total_sessions": len(sessions)} for s in segments]
    result["edges"] = [{"id": f"{a}->{b}", "source": a, "target": b,
                        "sessions": n, "total_sessions": len(sessions)}
                       for (a, b), n in sorted(edge_counts.items())]
    return result


def template_spec(workflow: dict[str, Any]) -> SegmentSpec:
    """First-match positive event rules reproduce R1–R4 without making absence claims."""
    states = sorted((n for n in workflow["nodes"] if n["kind"] == "state"),
                    key=lambda n: n["order"])
    evidence = Evidence(node_id=states[0]["id"], file=states[0]["file"],
                        lines=tuple(states[0]["lines"]), quote=states[0]["quote"])
    rules = [("connected", "Connected", "connected", "wallet_connected"),
             ("attempted_no_success", "Attempt recorded without a success record",
              "stalled_at_wallet", "wallet_attempted"),
             ("gate_event_no_attempt", "Gate shown without an attempt record",
              "stalled_at_wallet", "wallet_gate_shown"),
             ("no_gate_event", "No rule matched", "browsers", None)]
    return SegmentSpec(project="app", version=1, columns=tuple(
        Column(state_id=n["id"]) for n in states), rules=tuple(
            Rule(id=key, label=label, segment=segment,
                 predicate=(Predicate(op="any", children=tuple(
                     Predicate(op="has", events=(name,)) for name in
                     ("wallet_attempted", "wallet_errored", "wallet_rejected")))
                     if key == "attempted_no_success" else
                     Predicate(op="has", events=(event,)) if event else Predicate(op="always")),
                 evidence=(evidence,),
                 rationale="Ordered recorded events determine this template group.")
            for key, label, segment, event in rules), segments=(
                Segment(id="connected", label="Connected"),
                Segment(id="stalled_at_wallet", label="Stopped at the wallet"),
                Segment(id="browsers", label="Left before the wallet gate")))


def generate(llm: LLM, context: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    for attempt in range(2):
        try:
            spec = llm.call("journeys", 2, SegmentSpec,
                            context=json.dumps(context, ensure_ascii=False),
                            instructions="Propose recorded-event definitions. "
                            + (f"Repair these validation problems: {errors}" if attempt else ""),
                            system=("journeys_system", 1))
        except LLMError as error:
            return {"draft": None, "validation": [f"llm: {error}"], "digest": None}
        errors = validate(spec, context["workflow"], context["event_vocabulary"])
        if not errors:
            spec = resolve_refs(spec, context["workflow"])
            data = spec.model_dump(mode="json")
            return {"draft": data, "validation": [], "digest": digest(data)}
    return {"draft": None, "validation": errors, "digest": None}
