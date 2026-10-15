"""Assemble snapshots, DP0 traces and the v1/v2 report from stored evidence."""

import hashlib
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

from engine.catalog import ACTION_ID
from engine.cohorts import build_cohorts
from engine.investigation import Investigation
from engine.models import (
    Decision,
    Event,
    Exposure,
    Finding,
    InvestigationState,
    SessionStats,
)
from engine.policy import select_dp0
from engine.probe import resolve_exposure
from engine.reconcile import exposure_counts, reconcile
from engine.records import ProbeRecords
from engine.seed import SOURCES, Source, session_source
from engine.storage import Store

NO_ATTEMPT = frozenset({"no_gate_event", "gate_event_no_attempt"})


def data_version(sessions: Sequence[SessionStats]) -> str:
    """Changes only when the no-attempt sub-cohort gains or loses events."""
    ids = sorted(i for s in sessions if s.cohort in NO_ATTEMPT for i in s.event_ids)
    return hashlib.sha256("\n".join(ids).encode()).hexdigest()[:16]


def run_dp0(
    store: Store, records: ProbeRecords, investigation: Investigation, *, now: datetime,
) -> tuple[Decision, ...]:
    """Evaluate tier-0 checks once per data version and persist the trace."""
    events = store.events()
    sessions = build_cohorts(events, now, build_verified=store.run.build_verified)
    version = data_version(sessions)
    evaluated = records.evaluated()
    if (ACTION_ID, version) in evaluated or ("no_action", version) in evaluated:
        return ()
    decisions = select_dp0(
        sessions, events, investigation.hypotheses, investigation.class_mappings,
        data_version=version, evaluated=evaluated,
    )
    records.add_decisions(decisions, decided_at=now)
    return decisions


def latest_decisions(records: ProbeRecords) -> tuple[Decision, ...]:
    """The DP0 decisions of the most recently evaluated data version."""
    history = records.decisions()
    if not history:
        return ()
    version = history[-1][1].data_version
    return tuple(d for _, d in history if d.data_version == version)


def snapshots(store: Store, investigation_id: str) -> list[tuple[InvestigationState, str]]:
    rows = store.connection.execute(
        "SELECT payload, sha256 FROM investigations WHERE investigation_id = ? ORDER BY version",
        (investigation_id,),
    ).fetchall()
    return [(InvestigationState.model_validate_json(row[0]), row[1]) for row in rows]


def lock_v1(
    store: Store, records: ProbeRecords, investigation: Investigation, *, now: datetime,
    collection_minutes: float | None = None,
) -> tuple[InvestigationState, str]:
    """Lock hypotheses and probes before the first probe; idempotent once v1 exists.

    `collection_minutes` (live run) closes every plan that long after the lock.
    """
    existing = snapshots(store, investigation.investigation_id)
    if existing:
        return existing[0]
    plans = investigation.plans
    if collection_minutes is not None:
        closes = now + timedelta(minutes=collection_minutes)
        plans = tuple(p.model_copy(update={"ends_at": min(p.ends_at, closes)}) for p in plans)
    run_dp0(store, records, investigation, now=now)
    state = InvestigationState(
        investigation_id=investigation.investigation_id, run_id=store.run.run_id, version=1,
        data_cutoff=now, workflow=investigation.workflow, hypothesis_set=investigation.hypotheses,
        class_mappings=investigation.class_mappings,
        probe_questions=investigation.questions, probe_plans=plans,
        sessions=build_cohorts(store.events(), now, build_verified=store.run.build_verified),
        decisions=latest_decisions(records),
    )
    return state, store.append_snapshot(state)


def _session_at(events: Sequence[Event], exposure: Exposure, now: datetime,
                build_verified: bool) -> SessionStats | None:
    window = [e for e in events
              if e.session_id == exposure.session_id and e.seq <= exposure.event_seq_at_shown]
    stats = build_cohorts(window, now, build_verified=build_verified) if window else ()
    return stats[0] if stats else None


def evaluate(
    store: Store, records: ProbeRecords, investigation: Investigation, *, now: datetime,
) -> dict[str, Any]:
    """Compute the current (v2 candidate) evidence state without writing a snapshot."""
    events = store.events()
    verified = store.run.build_verified
    sessions = build_cohorts(events, now, build_verified=verified)
    decisions = latest_decisions(records)
    exposures = records.exposures()
    known = {e.exposure_id for e in exposures}
    responses = tuple(r for r in records.responses() if r.exposure_id in known)
    orphans = len(records.responses()) - len(responses)
    errors: list[dict[str, str]] = []
    resolved: list[Exposure] = []
    for exposure in exposures:
        plan = investigation.plan(exposure.plan_id)
        if plan is None:
            errors.append({"exposure_id": exposure.exposure_id, "reason": "unknown plan"})
            continue
        try:
            resolved.append(resolve_exposure(
                exposure, plan, investigation.question(plan), events,
                observed_at=now, build_verified=verified,
            ))
        except ValueError as error:
            errors.append({"exposure_id": exposure.exposure_id, "reason": str(error)})
    probes: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    for plan in investigation.plans:
        question = investigation.question(plan)
        mine = [e for e in resolved if e.plan_id == plan.plan_id]
        mine_ids = {e.exposure_id for e in mine}
        probes.append({
            "plan_id": plan.plan_id, "decision_point": question.decision_point,
            "question_version": question.question_version, "stem": question.stem,
            "target_cohorts": plan.target_cohorts, "target_n": plan.target_n,
            "budget": plan.budget, "ends_at": plan.ends_at,
            "counts": exposure_counts(mine, [r for r in responses if r.exposure_id in mine_ids]),
        })
        for cohort in plan.target_cohorts:
            group = [e for e in mine if e.server_cohort_at_shown == cohort]
            at_shown = [s for e in group if (s := _session_at(events, e, now, verified))]
            try:
                rows = reconcile(
                    run_id=store.run.run_id, investigation_id=investigation.investigation_id,
                    hypotheses=investigation.hypotheses, question=question, cohort=cohort,
                    exposures=mine, responses=[r for r in responses if r.exposure_id in mine_ids],
                    sessions_at_shown=at_shown, decisions_at_shown=decisions,
                )
            except ValueError as error:
                errors.append({"plan_id": plan.plan_id, "cohort": cohort, "reason": str(error)})
                continue
            split = {source: {
                row.hypothesis_id: row for row in reconcile(
                    run_id=store.run.run_id, investigation_id=investigation.investigation_id,
                    hypotheses=investigation.hypotheses, question=question, cohort=cohort,
                    exposures=part, responses=[r for r in responses if r.exposure_id in
                                               {e.exposure_id for e in part}],
                    sessions_at_shown=at_shown, decisions_at_shown=decisions,
                )} for source in SOURCES
                if (part := [e for e in mine if session_source(e.session_id) == source])}
            for finding in rows:
                by_source = {source: {"selected": parts[finding.hypothesis_id].selected,
                                      "respondents": parts[finding.hypothesis_id].respondents}
                             for source, parts in split.items()}
                findings.append({
                    **finding.model_dump(mode="json"),
                    "by_source": by_source,
                    "text": f"{finding.selected} of {finding.respondents} respondents"
                            + _split_text(by_source),
                })
    sources = {source: sum(session_source(s.session_id) == source for s in sessions)
               for source in SOURCES}
    return {
        "data_cutoff": now,
        "funnel": funnel(sessions, events),
        "cohorts": cohort_table(sessions),
        "sessions": sessions,
        "decisions": decisions,
        "probes": probes,
        "findings": findings,
        "orphan_responses": orphans,
        "seeded_sessions": sources["seed"],
        "sources": sources,
        "session_sources": {s.session_id: session_source(s.session_id) for s in sessions},
        "population": population(sources),
        "errors": errors,
    }


SOURCE_LABELS: dict[Source, str] = {"seed": "seed", "test": "test", "visitor": "visitors"}


def population(sources: dict[Source, int]) -> str:
    """Always shows the split, e.g. "seed 20 + visitors 3"; test runs only when present."""
    shown = [s for s in SOURCES if s != "test" or sources.get(s)]
    return " + ".join(f"{SOURCE_LABELS[s]} {sources.get(s, 0)}" for s in shown)


def _split_text(by_source: dict[Source, dict[str, int]]) -> str:
    parts = [f"{SOURCE_LABELS[s]} {v['selected']} of {v['respondents']}"
             for s, v in by_source.items() if v["respondents"]]
    return f" ({' · '.join(parts)})" if parts else ""


def funnel(sessions: Sequence[SessionStats], events: Sequence[Event]) -> dict[str, int]:
    names: dict[str, set[str]] = {}
    for event in events:
        names.setdefault(event.session_id, set()).add(event.event)
    ids = [s.session_id for s in sessions]
    return {
        "visitors": sum("project_viewed" in names.get(i, set()) for i in ids),
        "apply_clicked": sum("apply_clicked" in names.get(i, set()) for i in ids),
        "attempted": sum("wallet_attempted" in names.get(i, set()) for i in ids),
        "connected": sum(s.cohort == "connected" for s in sessions),
    }


def cohort_table(sessions: Sequence[SessionStats]) -> list[dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for session in sessions:
        row = rows.setdefault(session.cohort, {
            "cohort": session.cohort, "sessions": 0, "coverage_complete": 0,
            "coverage_unknown": 0, "exit_types": {},
        })
        row["sessions"] += 1
        row["coverage_complete" if session.coverage == "complete" else "coverage_unknown"] += 1
        row["exit_types"][session.exit_type] = row["exit_types"].get(session.exit_type, 0) + 1
    return sorted(rows.values(), key=lambda r: str(r["cohort"]))


def build_report(
    store: Store, records: ProbeRecords, investigation: Investigation, *, now: datetime,
) -> dict[str, Any]:
    """Side-by-side v1 (locked) and the current evidence state."""
    chain = snapshots(store, investigation.investigation_id)
    v1 = None
    if chain:
        state, digest = chain[0]
        v1 = {"digest": digest, "data_cutoff": state.data_cutoff, "sessions": state.sessions,
              "decisions": state.decisions}
    return {
        "run": store.run.summary(),
        "builds": store.builds(),
        "investigation_id": investigation.investigation_id,
        "workflow": investigation.workflow,
        "hypotheses": investigation.hypotheses.hypotheses,
        "class_mappings": investigation.class_mappings,
        "locked": v1 is not None,
        "v1": v1,
        "current": evaluate(store, records, investigation, now=now),
        "snapshots": [{"version": s.version, "digest": d, "data_cutoff": s.data_cutoff}
                      for s, d in chain],
    }


def append_successor(
    store: Store, records: ProbeRecords, investigation: Investigation, *, now: datetime,
    trusted_v1_digest: str,
) -> tuple[InvestigationState, str]:
    """Write v2+ with findings; requires the digest held outside the system."""
    chain = snapshots(store, investigation.investigation_id)
    if not chain:
        raise ValueError("lock v1 before writing a successor")
    run_dp0(store, records, investigation, now=now)
    current = evaluate(store, records, investigation, now=now)
    state = InvestigationState(
        investigation_id=investigation.investigation_id, run_id=store.run.run_id,
        version=len(chain) + 1, data_cutoff=now, workflow=investigation.workflow,
        hypothesis_set=investigation.hypotheses, class_mappings=investigation.class_mappings,
        probe_questions=chain[0][0].probe_questions, probe_plans=chain[0][0].probe_plans,
        sessions=current["sessions"], decisions=current["decisions"],
        findings=tuple(Finding.model_validate({k: v for k, v in f.items()
                                               if k not in ("text", "by_source")})
                       for f in current["findings"]),
    )
    return state, store.append_snapshot(state, trusted_v1_digest=trusted_v1_digest)
