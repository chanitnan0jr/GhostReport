"""Self-report counts and rule observations remain separate evidence dimensions."""

from collections.abc import Sequence

from engine.catalog import validate_question
from engine.models import (
    Cohort,
    Decision,
    Exposure,
    Finding,
    HypothesisSet,
    ProbeQuestion,
    ProbeResponse,
    SessionStats,
)


def reconcile(
    *, run_id: str, investigation_id: str, hypotheses: HypothesisSet,
    question: ProbeQuestion, cohort: Cohort, exposures: Sequence[Exposure],
    responses: Sequence[ProbeResponse], sessions_at_shown: Sequence[SessionStats],
    decisions_at_shown: Sequence[Decision],
) -> tuple[Finding, ...]:
    """Aggregate by question/DP/cohort, never by exposure_id.

    Callers reconstruct sessions and decisions through each exposure's sequence.
    Only resolved exposures and valid non-skip responses enter denominators.
    Evidence IDs retain session-level contradiction and coverage scope.
    """
    validate_question(question, hypotheses)
    if question.investigation_id != investigation_id:
        raise ValueError("question belongs to another investigation")
    by_exposure: dict[str, Exposure] = {}
    for exposure in exposures:
        if exposure.exposure_id in by_exposure:
            if by_exposure[exposure.exposure_id] != exposure:
                raise ValueError("conflicting exposure records")
        by_exposure[exposure.exposure_id] = exposure
    by_response: dict[str, ProbeResponse] = {}
    for response in responses:
        if response.exposure_id not in by_exposure:
            raise ValueError("response requires a recorded or inferred exposure")
        if response.exposure_id in by_response and by_response[response.exposure_id] != response:
            raise ValueError("one immutable response per exposure")
        by_response[response.exposure_id] = response
    group = [e for e in by_exposure.values() if (
        e.run_id == run_id and e.investigation_id == investigation_id
        and e.question_version == question.question_version
        and e.decision_point == question.decision_point
        and e.cohort_status == "resolved" and e.server_cohort_at_shown == cohort
    )]
    sessions = {s.session_id: s for s in sessions_at_shown}
    seen: set[str] = set()
    for exposure in group:
        if exposure.session_id in seen:
            raise ValueError("more than one exposure per session in this question group")
        if (exposure.session_id not in sessions
                or sessions[exposure.session_id].cohort != cohort):
            raise ValueError("require the session snapshot at exposure, not current cohort")
        if set(exposure.options_shown) != {o.id for o in question.options}:
            raise ValueError("exposure differs from the approved question")
        seen.add(exposure.session_id)
    answered: list[tuple[Exposure, ProbeResponse]] = []
    for exposure in group:
        answer = by_response.get(exposure.exposure_id)
        if answer is None:
            continue
        if answer.responded_at < exposure.shown_at:
            raise ValueError("response predates exposure")
        if not set(answer.option_ids) <= set(exposure.options_shown):
            raise ValueError("response selected an option that was not shown")
        if not answer.skipped:
            answered.append((exposure, answer))
    findings: list[Finding] = []
    for hypothesis in hypotheses.hypotheses:
        option_ids = {o.id for o in question.options if hypothesis.id in o.hypothesis_ids}
        relevant = [(e, r) for e, r in answered if set(e.options_shown) & option_ids]
        selected = [(e, r) for e, r in relevant if set(r.option_ids) & option_ids]
        k, n = len(selected), len(relevant)
        label = ("Unresolved" if n < 3 else "Selected by ≥ 50%" if k * 2 >= n
                 else "Selected" if k > 0 else "Not selected")
        contradicted = {
            sid for decision in decisions_at_shown
            if hypothesis.id in decision.contradicted_hypotheses and "R2" in decision.rule_ids
            for sid in decision.session_ids if sid in seen
            and sessions[sid].coverage == "complete"
        }
        unknown = {sid for sid in seen if sessions[sid].coverage != "complete"}
        observation = ("Contradicted by rule R2" if contradicted else
                       "Unknown coverage" if unknown else "No contradiction")
        findings.append(Finding(
            hypothesis_id=hypothesis.id, cohort=cohort,
            question_version=question.question_version, decision_point=question.decision_point,
            selected=k, respondents=n, self_report=label, observation=observation,
            evidence_conflict=bool(selected) and bool(contradicted),
            evidence_ids=tuple(sorted(
                {e.exposure_id for e, _ in relevant}
                | {f"R2:session:{sid}" for sid in contradicted}
                | {f"unknown_coverage:session:{sid}" for sid in unknown}
            )),
        ))
    return tuple(findings)


def exposure_counts(exposures: Sequence[Exposure], responses: Sequence[ProbeResponse]) -> dict[str, int]:
    """Describe observed delivery; missing beacons cannot be counted as shown."""
    by_id = {e.exposure_id: e for e in exposures}
    answers = {r.exposure_id: r for r in responses}
    if not answers.keys() <= by_id.keys():
        raise ValueError("responses require recorded or inferred exposures")
    return {
        "shown": len(by_id),
        "answered": sum(not r.skipped for r in answers.values()),
        "skipped": sum(r.skipped for r in answers.values()),
        "shown_no_response": len(by_id.keys() - answers.keys()),
        "pending": sum(e.cohort_status == "pending" for e in by_id.values()),
        "unknown_coverage": sum(e.cohort_status == "unknown_coverage" for e in by_id.values()),
        "inferred_from_response": sum(
            e.received_via == "inferred_from_response" for e in by_id.values()
        ),
    }
