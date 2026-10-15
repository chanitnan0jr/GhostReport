"""User journeys → segments as a left-to-right flowchart (deterministic, no LLM).

Each session's events, in `seq` order, are placed on fixed columns:

    Entry → Apply → Wallet gate → Started connecting → First result → Retry → Exit
          → Segment → Probe

A session skips the columns it never reached, so its edge jumps ahead. Its segment is
one of three groups of the report's cohorts (from `build_cohorts`, unchanged), so
every count here matches the report: Left before the wallet gate, Stopped at the wallet, Connected.
Only counts leave this module, never session IDs, and each node and edge is split by
source (seed / test / visitor).
"""

from collections import Counter, defaultdict
from collections.abc import Sequence
from typing import Any

from engine.cohorts import unique_events
from engine.models import Event, Exposure, ProbeResponse, SessionStats
from engine.seed import SOURCES, Source, session_source

COLUMNS = ("Entry", "Apply", "Wallet gate", "Started connecting", "First result", "Retry",
           "Exit", "Segment", "Probe")
# (column, key) → label, in the top-to-bottom order used within each column.
NODES: dict[tuple[int, str], str] = {
    (0, "viewed"): "Viewed a project",
    (0, "no_entry"): "No project view recorded",
    (1, "apply"): "Clicked Apply",
    (2, "gate"): "Saw the wallet gate",
    (3, "attempt"): "Started connecting",
    (4, "connected"): "Connected",
    (4, "errored"): "Network error (simulated)",
    (4, "rejected"): "Rejected",
    (4, "no_outcome_observed"): "No result recorded",
    (4, "pending"): "Waiting for the wallet",
    (5, "retry_connected"): "Retried → connected",
    (5, "retry_no_success"): "Retried → no success",
    (6, "not_now"): "Not now",
    (6, "back"): "Back to projects",
    (6, "inactive"): "Went quiet (10 min)",
    (6, "open"): "Still on the page",
    (7, "browsers"): "Left before the wallet gate",
    (7, "stalled_at_wallet"): "Stopped at the wallet",
    (7, "connected"): "Connected",
    (8, "answered"): "Probe answered",
    (8, "skipped"): "Probe skipped",
    (8, "shown_no_response"): "Probe shown, no response",
}
# Three behaviour segments, each a fixed group of the report's cohorts.
SEGMENTS: dict[str, dict[str, Any]] = {
    "browsers": {
        "cohorts": ("no_gate_event",), "probe": "DP2",
        "definition": "Viewed a project and left without the wallet gate being recorded.",
    },
    "stalled_at_wallet": {
        "cohorts": ("gate_event_no_attempt", "attempted_no_success"), "probe": "DP1",
        "definition": "Reached the wallet gate but no connection succeeded: chose Not now, "
                      "or started connecting with no success recorded.",
    },
    "connected": {
        "cohorts": ("connected",), "probe": None,
        "definition": "A wallet connection succeeded, first time or after a retry.",
    },
}
SEGMENT_OF = {cohort: key for key, spec in SEGMENTS.items() for cohort in spec["cohorts"]}
TOP_PATHS = 3
KIND = {0: "step", 1: "step", 2: "step", 3: "step", 4: "outcome", 5: "outcome", 6: "exit",
        7: "segment", 8: "probe"}


def node_id(column: int, key: str) -> str:
    return f"c{column}:{key}"


def path(session: SessionStats, names: Sequence[str], probe: str | None) -> list[str]:
    """The ordered node IDs one session passes through."""
    steps = [node_id(0, "viewed" if "project_viewed" in names else "no_entry")]
    if "apply_clicked" in names:
        steps.append(node_id(1, "apply"))
    if "wallet_gate_shown" in names:
        steps.append(node_id(2, "gate"))
    states = session.attempt_states
    if states:
        steps += [node_id(3, "attempt"), node_id(4, states[0])]
        if len(states) > 1:
            steps.append(node_id(5, "retry_connected" if "connected" in states[1:]
                                 else "retry_no_success"))
    steps += [node_id(6, session.exit_type), node_id(7, SEGMENT_OF[session.cohort])]
    if probe:
        steps.append(node_id(8, probe))
    return steps


COHORTS = ("no_gate_event", "gate_event_no_attempt", "attempted_no_success", "connected")
UNRESOLVED = {"no_outcome_observed", "pending"}


def recorded_steps(events: Sequence[Event], states: Sequence[str]) -> tuple[tuple[str, str], ...]:
    """One session's recorded event names in `seq` order. An attempt with no result
    gets a separate ("note", state) after its last event; it is never an event."""
    ordered = sorted(events, key=lambda e: e.seq)
    attempts = list(dict.fromkeys(e.attempt_id for e in ordered if e.attempt_id))
    last = {e.attempt_id: e.seq for e in ordered if e.attempt_id}
    steps: list[tuple[str, str]] = []
    for event in ordered:
        steps.append(("event", event.event))
        if event.attempt_id and event.seq == last[event.attempt_id]:
            index = attempts.index(event.attempt_id)
            if index < len(states) and states[index] in UNRESOLVED:
                steps.append(("note", states[index]))
    return tuple(steps)


def _split(counter: Counter[Source]) -> dict[Source, int]:
    return {source: counter[source] for source in SOURCES}


def journeys(
    events: Sequence[Event], sessions: Sequence[SessionStats],
    exposures: Sequence[Exposure] = (), responses: Sequence[ProbeResponse] = (), *,
    only: Source | None = None,
) -> dict[str, Any]:
    names: dict[str, list[str]] = defaultdict(list)
    for event in sorted(events, key=lambda e: (e.session_id, e.seq)):
        names[event.session_id].append(event.event)
    answered = {r.exposure_id: ("skipped" if r.skipped else "answered") for r in responses}
    probes = {e.session_id: answered.get(e.exposure_id, "shown_no_response")
              for e in exposures}
    asked = {e.session_id: e.decision_point for e in exposures}
    by_session: dict[str, list[Event]] = defaultdict(list)
    for event in unique_events(events):
        by_session[event.session_id].append(event)
    cohort_total: Counter[str] = Counter()
    cohort_paths: dict[str, Counter[tuple[tuple[str, str], ...]]] = defaultdict(Counter)
    cohort_probes: dict[str, dict[str, Counter[str]]] = defaultdict(lambda: defaultdict(Counter))
    node_counts: dict[str, Counter[Source]] = defaultdict(Counter)
    edge_counts: dict[tuple[str, str], Counter[Source]] = defaultdict(Counter)
    coverage: dict[str, Counter[str]] = defaultdict(Counter)
    cohorts: dict[str, Counter[str]] = defaultdict(Counter)
    paths: dict[str, Counter[tuple[str, ...]]] = defaultdict(Counter)
    total: Counter[Source] = Counter()
    for session in sessions:
        source = session_source(session.session_id)
        if only is not None and source != only:
            continue
        total[source] += 1
        steps = path(session, names[session.session_id], probes.get(session.session_id))
        for step in steps:
            node_counts[step][source] += 1
        for a, b in zip(steps, steps[1:], strict=False):
            edge_counts[(a, b)][source] += 1
        segment = SEGMENT_OF[session.cohort]
        coverage[segment][session.coverage] += 1
        cohorts[segment][session.cohort] += 1
        # The flow up to the exit; the segment and probe columns are the same for all.
        paths[segment][tuple(step for step in steps if not step.startswith(("c7:", "c8:")))] += 1
        cohort_total[session.cohort] += 1
        cohort_paths[session.cohort][recorded_steps(by_session[session.session_id],
                                                    session.attempt_states)] += 1
        if session.session_id in probes:
            cohort_probes[session.cohort][asked[session.session_id]][
                probes[session.session_id]] += 1
    order = {node_id(c, k): i for i, (c, k) in enumerate(NODES)}
    nodes = [{
        "id": node_id(column, key), "column": column, "row": order[node_id(column, key)],
        "label": label, "kind": KIND[column],
        "count": sum(node_counts[node_id(column, key)].values()),
        "by_source": _split(node_counts[node_id(column, key)]),
    } for (column, key), label in NODES.items() if node_id(column, key) in node_counts]
    edges = [{
        "source": a, "target": b, "count": sum(counts.values()), "by_source": _split(counts),
    } for (a, b), counts in sorted(edge_counts.items(),
                                   key=lambda item: (order[item[0][0]], order[item[0][1]]))]
    label = {node_id(c, k): text for (c, k), text in NODES.items()}
    segments = [{
        "id": node_id(7, key), "segment": key, "label": NODES[(7, key)],
        "definition": spec["definition"], "cohorts": dict(cohorts[key]),
        "probe": spec["probe"], "sessions": sum(node_counts[node_id(7, key)].values()),
        "by_source": _split(node_counts[node_id(7, key)]),
        "coverage": {"complete": coverage[key]["complete"],
                     "unknown": coverage[key]["unknown"]},
        # Most common flows inside the segment (ties broken by path, so stable).
        "top_paths": [{"steps": [label[step] for step in steps], "sessions": count}
                      for steps, count in sorted(paths[key].items(),
                                                 key=lambda item: (-item[1], item[0]))
                      [:TOP_PATHS]],
    } for key, spec in SEGMENTS.items()]
    # Per report cohort: the most common recorded event sequences (event names only)
    # and question outcomes by current membership.
    cohort_rows = [{
        "cohort": cohort, "sessions": cohort_total[cohort],
        "probes": {point: {status: counts[status]
                           for status in ("answered", "skipped", "shown_no_response")}
                   for point, counts in sorted(cohort_probes[cohort].items())},
        "top_paths": [{"steps": [{kind: value} for kind, value in steps], "sessions": count}
                      for steps, count in sorted(cohort_paths[cohort].items(),
                                                 key=lambda item: (-item[1], item[0]))
                      [:TOP_PATHS]],
    } for cohort in COHORTS]
    return {
        "direction": "LR",
        "columns": [{"index": i, "label": label} for i, label in enumerate(COLUMNS)],
        "nodes": nodes, "edges": edges, "segments": segments, "cohorts": cohort_rows,
        "sessions": sum(total.values()), "by_source": _split(total), "only": only,
        "notes": [
            "Rejecting the wallet is not instrumented, so a rejection shows as "
            "'No result recorded'.",
            "Segments group the report's cohorts (Left before the wallet gate = "
            "no_gate_event; Stopped at the wallet = gate_event_no_attempt + "
            "attempted_no_success; Connected = "
            "connected). Coverage 'unknown' sessions are counted but cannot support "
            "absence claims.",
        ],
    }


def mermaid(graph: dict[str, Any]) -> str:
    """The same graph as a Mermaid `flowchart LR` (for the README and the deck)."""
    lines = ["flowchart LR"]
    for column in graph["columns"]:
        members = [n for n in graph["nodes"] if n["column"] == column["index"]]
        if not members:
            continue
        lines.append(f'  subgraph col{column["index"]}["{column["label"]}"]')
        lines += [f'    {n["id"].replace(":", "_")}["{n["label"]} ({n["count"]})"]'
                  for n in members]
        lines.append("  end")
    lines += [f'  {e["source"].replace(":", "_")} -->|{e["count"]}| '
              f'{e["target"].replace(":", "_")}' for e in graph["edges"]]
    return "\n".join(lines) + "\n"


def session_path(
    session_id: str, events: Sequence[Event], sessions: Sequence[SessionStats],
    exposures: Sequence[Exposure] = (), responses: Sequence[ProbeResponse] = (),
) -> dict[str, Any] | None:
    """One session's own path through the flowchart ("See where you landed")."""
    session = next((s for s in sessions if s.session_id == session_id), None)
    if session is None:
        return None
    names = [e.event for e in sorted(events, key=lambda e: e.seq)
             if e.session_id == session_id]
    answered = {r.exposure_id: ("skipped" if r.skipped else "answered") for r in responses}
    probe = next((answered.get(e.exposure_id, "shown_no_response") for e in exposures
                  if e.session_id == session_id), None)
    steps = path(session, names, probe)
    segment = SEGMENT_OF[session.cohort]
    return {
        "source": session_source(session_id),
        "segment": segment, "segment_label": NODES[(7, segment)],
        "nodes": steps,
        "edges": [{"source": a, "target": b} for a, b in zip(steps, steps[1:], strict=False)],
        "probe": probe,
    }
