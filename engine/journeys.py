"""User journeys → segments as a left-to-right flowchart (deterministic, no LLM).

Each session's events, in `seq` order, are placed on fixed columns:

    Entry → Apply → Wallet gate → Started connecting → First result → Retry → Exit
          → Segment → Probe

A session skips the columns it never reached, so its edge jumps ahead. The segment is
the session's cohort from `build_cohorts`, the same rule the report uses, so every
count here matches the report. Only counts leave this module, never session IDs, and
each node and edge is split by source (seed / test / visitor).
"""

from collections import Counter, defaultdict
from collections.abc import Sequence
from typing import Any

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
    (7, "connected"): "Connected",
    (7, "attempted_no_success"): "Tried, no success",
    (7, "gate_event_no_attempt"): "Saw the gate, never tried",
    (7, "no_gate_event"): "Never saw the gate",
    (8, "answered"): "Probe answered",
    (8, "skipped"): "Probe skipped",
    (8, "shown_no_response"): "Probe shown, no response",
}
SEGMENTS = {
    "connected": "a wallet connection succeeded",
    "attempted_no_success": "started connecting at least once; no success recorded",
    "gate_event_no_attempt": "the wallet gate was recorded; connecting never started",
    "no_gate_event": "no wallet gate was recorded",
}
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
    steps += [node_id(6, session.exit_type), node_id(7, session.cohort)]
    if probe:
        steps.append(node_id(8, probe))
    return steps


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
    node_counts: dict[str, Counter[Source]] = defaultdict(Counter)
    edge_counts: dict[tuple[str, str], Counter[Source]] = defaultdict(Counter)
    coverage: dict[str, Counter[str]] = defaultdict(Counter)
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
        coverage[session.cohort][session.coverage] += 1
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
    segments = [{
        "id": node_id(7, cohort), "cohort": cohort, "label": NODES[(7, cohort)],
        "definition": definition, "sessions": sum(node_counts[node_id(7, cohort)].values()),
        "by_source": _split(node_counts[node_id(7, cohort)]),
        "coverage": {"complete": coverage[cohort]["complete"],
                     "unknown": coverage[cohort]["unknown"]},
    } for cohort, definition in SEGMENTS.items()]
    return {
        "direction": "LR",
        "columns": [{"index": i, "label": label} for i, label in enumerate(COLUMNS)],
        "nodes": nodes, "edges": edges, "segments": segments,
        "sessions": sum(total.values()), "by_source": _split(total), "only": only,
        "notes": [
            "Rejecting the wallet is not instrumented, so a rejection shows as "
            "'No result recorded'.",
            "Segments use the report's cohort rule; coverage 'unknown' sessions are "
            "counted but cannot support absence claims.",
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
