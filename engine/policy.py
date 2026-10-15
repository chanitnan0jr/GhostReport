"""Deterministic telemetry decisions with explicit, non-probabilistic traces."""

from collections.abc import Sequence

from engine.catalog import ACTION_ID, validate_mappings
from engine.models import ClassMapping, Decision, Event, HypothesisSet, SessionStats


def select_dp0(
    sessions: Sequence[SessionStats], events: Sequence[Event], hypotheses: HypothesisSet,
    mappings: tuple[ClassMapping, ...], *, data_version: str,
    evaluated: frozenset[tuple[str, str]] = frozenset(),
) -> tuple[Decision, ...]:
    """Evaluate the reviewed gate check once per data version.

    R2 applies only to the approved, narrow gate-permission class in complete
    no-attempt sessions. This check has no defensible two-sided partition;
    consequently it never computes SPL1.1 or information gain.
    """
    validate_mappings(hypotheses, mappings)
    targets = tuple(sorted(
        m.hypothesis_id for m in mappings if m.class_id == "HC-gate-permission"
    ))
    if not targets or (ACTION_ID, data_version) in evaluated:
        return (Decision(
            decision_point="DP0", action_id="no_action", data_version=data_version,
            reason="No approved applicable rule or check already evaluated for this data version",
        ),)
    event_by_id = {e.event_id: e for e in events}
    groups: dict[str, list[SessionStats]] = {
        "observed": [], "not_observed": [], "unknown_coverage": [],
    }
    for session in sessions:
        if session.cohort not in {"no_gate_event", "gate_event_no_attempt"}:
            continue
        if not set(session.event_ids) <= event_by_id.keys():
            raise ValueError("policy requires all source events for the session snapshot")
        observed = any(event_by_id[i].event == "wallet_gate_shown" for i in session.event_ids)
        outcome = "observed" if observed else (
            "not_observed" if session.coverage == "complete" else "unknown_coverage"
        )
        groups[outcome].append(session)
    decisions: list[Decision] = []
    for outcome, subset in groups.items():
        if not subset:
            continue
        decisions.append(Decision(
            decision_point="DP0", action_id=ACTION_ID, data_version=data_version,
            reason=("R2: no gate event in verified, contiguous entry-to-exit windows"
                    if outcome == "not_observed" else "Recorded gate evidence or incomplete coverage"),
            result=outcome,
            session_ids=tuple(s.session_id for s in subset),
            evidence_ids=tuple(i for s in subset for i in s.event_ids),
            contradicted_hypotheses=targets if outcome == "not_observed" else (),
            rule_ids=("R2",) if outcome == "not_observed" else (),
        ))
    return tuple(decisions) or (Decision(
        decision_point="DP0", action_id="no_action", data_version=data_version,
        reason="No no-attempt sessions in this snapshot",
    ),)
