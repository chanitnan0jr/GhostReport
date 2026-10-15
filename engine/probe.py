"""Probe planning, local exit eligibility and authoritative exposure attribution."""

from collections.abc import Sequence
from datetime import datetime

from engine.catalog import validate_question
from engine.cohorts import build_cohorts
from engine.models import (
    Decision,
    Event,
    Exposure,
    HypothesisSet,
    ProbePlan,
    ProbeQuestion,
    SessionStats,
)


def plan_probe(
    plan: ProbePlan, question: ProbeQuestion, hypotheses: HypothesisSet, *, now: datetime,
    answered: int, shown: int,
) -> ProbePlan | None:
    """Prepare an approved, relevant plan while collection is still open.

    Counts are hints rather than reservations. Loaded plans can overshoot the
    target and budget; ends_at is checked again on every exit.
    """
    validate_question(question, hypotheses)
    if (plan.investigation_id, plan.question_version) != (
        question.investigation_id, question.question_version
    ):
        raise ValueError("plan and question do not belong together")
    if min(answered, shown) < 0 or answered > shown:
        raise ValueError("invalid collection counts")
    relevant = any(o.hypothesis_ids for o in question.options if o.id != "other")
    if relevant and now < plan.ends_at and answered < plan.target_n and shown < plan.budget:
        return plan
    return None


def at_exit(
    session: SessionStats, plan: ProbePlan | None, *, now: datetime, consent: bool,
    already_asked: bool, in_wallet_popup: bool, closed_hint: bool = False,
    data_version: str = "local",
) -> Decision:
    """Local DP1/DP2 decision; no LLM, network, or repeated tier-0 work."""
    point = "DP1" if session.exit_type == "not_now" else "DP2"
    reason = "Eligible exit with an approved, open probe plan"
    eligible = True
    if session.exit_type not in {"not_now", "back"}:
        reason, eligible = "Open and inactive sessions cannot be probed", False
    elif plan is None:
        reason, eligible = "No approved probe plan", False
    elif now >= plan.ends_at or closed_hint:
        reason, eligible = "Collection closed or plan expired", False
    elif not consent or already_asked or in_wallet_popup:
        reason, eligible = "Consent, session frequency or wallet UI guard", False
    elif session.cohort not in plan.target_cohorts:
        reason, eligible = "Session no longer belongs to the target cohort", False
    return Decision(
        decision_point=point, action_id="show_probe" if eligible else "no_action",
        data_version=data_version, reason=reason, session_ids=(session.session_id,),
    )


def resolve_exposure(
    exposure: Exposure, plan: ProbePlan, question: ProbeQuestion, events: Sequence[Event], *,
    observed_at: datetime, build_verified: bool, wait_seconds: int = 10,
) -> Exposure:
    """Derive cohort through the shown sequence, allowing late event delivery.

    No client cohort is accepted. Pending exposures do not enter denominators.
    Later connect events are excluded even if they arrive before reconciliation.
    """
    if wait_seconds < 0 or observed_at < exposure.shown_at:
        raise ValueError("invalid exposure resolution time")
    if (exposure.plan_id != plan.plan_id
            or exposure.investigation_id != plan.investigation_id
            or exposure.question_version != plan.question_version
            or question.investigation_id != plan.investigation_id
            or question.question_version != plan.question_version
            or exposure.decision_point != question.decision_point):
        raise ValueError("exposure, plan and question mismatch")
    if exposure.shown_at >= plan.ends_at or exposure.shown_at < question.approved_at:
        raise ValueError("exposure outside approved collection window")
    if (set(exposure.options_shown) != {o.id for o in question.options}
            or exposure.options_shown[-1:] != ("other",)):
        raise ValueError("exposure must contain approved options with other last")
    available = [
        e for e in events if e.session_id == exposure.session_id
        and e.seq <= exposure.event_seq_at_shown and e.received_at <= observed_at
    ]
    seqs = sorted({e.seq for e in available})
    if seqs != list(range(1, exposure.event_seq_at_shown + 1)):
        status = ("unknown_coverage" if (observed_at - exposure.shown_at).total_seconds()
                  >= wait_seconds else "pending")
        return Exposure.model_validate({**exposure.model_dump(), "cohort_status": status,
                                        "server_cohort_at_shown": None})
    stats = build_cohorts(available, observed_at, build_verified=build_verified)[0]
    expected_exit = "not_now" if exposure.decision_point == "DP1" else "back"
    if stats.exit_type != expected_exit or stats.cohort not in plan.target_cohorts:
        raise ValueError("exposure did not occur at an eligible exit")
    return Exposure.model_validate({**exposure.model_dump(), "cohort_status": "resolved",
                                    "server_cohort_at_shown": stats.cohort})
