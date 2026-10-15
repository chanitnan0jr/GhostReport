"""Validated contracts for evidence, policy, probes and report snapshots."""

from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

Identifier = Annotated[str, Field(min_length=1, max_length=200)]
PositiveInt = Annotated[int, Field(strict=True, gt=0)]
Cohort = Literal["connected", "attempted_no_success", "gate_event_no_attempt", "no_gate_event"]
Coverage = Literal["complete", "unknown"]
DecisionPoint = Literal["DP0", "DP1", "DP2"]
EventName = Literal[
    "project_viewed", "apply_clicked", "wallet_gate_shown", "wallet_attempted",
    "wallet_connected", "wallet_rejected", "wallet_errored", "not_now_clicked", "back_nav",
]
ATTEMPT_EVENTS = frozenset(
    {"wallet_attempted", "wallet_connected", "wallet_rejected", "wallet_errored"}
)
EXIT_EVENTS = frozenset({"not_now_clicked", "back_nav"})


class Model(BaseModel):
    """Reject unknown fields, including probability, at every typed boundary."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class EventProps(Model):
    """Only synthetic project identifiers are accepted in the MVP."""

    project_id: Annotated[str, Field(pattern=r"^p[0-9]{1,6}$")] | None = None


class Event(Model):
    """Canonical event; received_at must be assigned by the ingest boundary."""

    event_id: Identifier
    session_id: Identifier
    seq: PositiveInt
    attempt_id: Identifier | None = None
    event: EventName
    occurred_at: AwareDatetime
    received_at: AwareDatetime
    page: Literal["ProjectList", "ProjectPage", "ApplyModal", "MockWalletPopup", "ApplicationForm"]
    schema_version: Literal[1] = 1
    props: EventProps = Field(default_factory=EventProps)

    @model_validator(mode="after")
    def validate_attempt(self) -> Self:
        """Attempt outcomes must be attributable to one connect attempt."""
        if (self.event in ATTEMPT_EVENTS) != (self.attempt_id is not None):
            raise ValueError("attempt_id is required only for attempt events")
        return self


RULE_EVENTS = frozenset({"wallet_gate_shown"})  # events that reviewed rules (R2) rely on


class Verification(Model):
    """A passing instrumentation test for one event, at one commit."""

    event: EventName
    test: Identifier
    commit: Identifier
    passed_at: AwareDatetime


class Run(Model):
    """One database belongs to one run, with explicit provenance."""

    run_id: Identifier
    mode: Literal["live", "demo", "seed", "pilot", "replay"]
    code_commit: Identifier
    app_build: Identifier
    verifications: tuple[Verification, ...] = ()
    policy_version: Literal["mvp-v1"] = "mvp-v1"
    catalog_version: Literal["mvp-v1"] = "mvp-v1"

    def verification(self) -> dict[str, dict[str, object]]:
        """Per rule event: verified only by a passing test on this run's exact commit."""
        result: dict[str, dict[str, object]] = {}
        for event in sorted(RULE_EVENTS):
            match = next((v for v in self.verifications
                          if v.event == event and v.commit == self.code_commit), None)
            result[event] = {
                "verified": match is not None, "commit": match.commit if match else None,
                "test": match.test if match else None,
                "passed_at": match.passed_at.isoformat() if match else None,
            }
        return result

    def summary(self) -> dict[str, object]:
        """Run provenance for API responses, including derived verification state."""
        return {**self.model_dump(mode="json"), "build_verified": self.build_verified,
                "verification": self.verification()}

    @property
    def build_verified(self) -> bool:
        """Absence rules apply only if every rule event was verified on this exact commit."""
        verified = {v.event for v in self.verifications if v.commit == self.code_commit}
        return RULE_EVENTS <= verified


class CodeRef(Model):
    """A literal quote inside a bounded, one-based source range."""

    file: Identifier
    lines: tuple[PositiveInt, PositiveInt]
    quote: Annotated[str, Field(min_length=1)]

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.lines[0] > self.lines[1]:
            raise ValueError("code reference range is reversed")
        return self


class CodeScope(Model):
    """Absence claims apply only to files actually searched."""

    commit_sha: Identifier
    searched_files: tuple[str, ...]
    unresolved_imports: tuple[str, ...] = ()
    truncated: bool = False


class CodeFact(Model):
    id: Identifier
    desc: str
    code_ref: CodeRef
    instrumentation: Literal["found_in_code", "not_found_in_scope", "unknown"] = "unknown"


class WorkflowMap(Model):
    version: Identifier
    scope: CodeScope
    states: tuple[CodeFact, ...] = ()
    outcomes: tuple[CodeFact, ...] = ()
    ui_facts: tuple[CodeFact, ...] = ()

    @model_validator(mode="after")
    def unique_ids(self) -> Self:
        ids = [f.id for f in (*self.states, *self.outcomes, *self.ui_facts)]
        if len(ids) != len(set(ids)):
            raise ValueError("workflow fact IDs must be unique")
        return self


class Hypothesis(Model):
    id: Identifier
    statement: Annotated[str, Field(min_length=1)]
    class_id: str | None = None  # LLM proposal; never authorizes a rule.
    code_evidence: tuple[str, ...] = ()
    generic: bool = True

    @model_validator(mode="after")
    def require_grounding(self) -> Self:
        if not self.generic and not self.code_evidence:
            raise ValueError("non-generic hypotheses require code evidence")
        return self


class HypothesisSet(Model):
    workflow_version: Identifier
    hypotheses: tuple[Hypothesis, ...]

    @model_validator(mode="after")
    def require_open_world(self) -> Self:
        ids = [h.id for h in self.hypotheses]
        if len(ids) != len(set(ids)) or "H_other" not in ids or len(ids) < 4:
            raise ValueError("require unique IDs, at least 3 hypotheses and H_other")
        return self


class ClassMapping(Model):
    hypothesis_id: Identifier
    class_id: Identifier
    approved_by: Identifier
    approved_at: AwareDatetime


class SessionStats(Model):
    session_id: Identifier
    cohort: Cohort
    coverage: Coverage
    coverage_reasons: tuple[str, ...]
    exit_type: Literal["not_now", "back", "inactive", "open"]
    attempt_states: tuple[str, ...] = ()
    after_retry: bool = False
    event_ids: tuple[str, ...]


class Decision(Model):
    decision_point: DecisionPoint
    action_id: str
    data_version: str
    reason: str
    result: Literal["observed", "not_observed", "unknown_coverage"] | None = None
    session_ids: tuple[str, ...] = ()
    evidence_ids: tuple[str, ...] = ()
    contradicted_hypotheses: tuple[str, ...] = ()
    rule_ids: tuple[str, ...] = ()
    catalog_version: Literal["mvp-v1"] = "mvp-v1"


class ProbeOption(Model):
    id: Identifier
    label: Annotated[str, Field(min_length=1)]
    hypothesis_ids: tuple[str, ...]


class ProbeQuestion(Model):
    question_version: Identifier
    investigation_id: Identifier
    decision_point: Literal["DP1", "DP2"]
    stem: str
    options: tuple[ProbeOption, ...]
    approved_by: Identifier
    approved_at: AwareDatetime

    @model_validator(mode="after")
    def validate_options(self) -> Self:
        ids = [o.id for o in self.options]
        if len(ids) != len(set(ids)) or not 2 <= len(ids) <= 5 or "other" not in ids:
            raise ValueError("require up to 4 options plus other; skip is a separate response")
        other = next(o for o in self.options if o.id == "other")
        if other.label != "Something else" or other.hypothesis_ids != ("H_other",):
            raise ValueError("other must map to H_other")
        return self


class ProbePlan(Model):
    plan_id: Identifier
    investigation_id: Identifier
    question_version: Identifier
    target_cohorts: tuple[Cohort, ...]
    target_n: PositiveInt
    budget: PositiveInt
    ends_at: AwareDatetime


class Exposure(Model):
    exposure_id: Identifier
    plan_id: Identifier
    run_id: Identifier
    investigation_id: Identifier
    question_version: Identifier
    decision_point: Literal["DP1", "DP2"]
    session_id: Identifier
    shown_at: AwareDatetime
    event_seq_at_shown: PositiveInt
    options_shown: tuple[str, ...]
    cohort_status: Literal["pending", "resolved", "unknown_coverage"] = "pending"
    server_cohort_at_shown: Cohort | None = None
    received_via: Literal["beacon", "inferred_from_response"] = "beacon"

    @model_validator(mode="after")
    def resolved_cohort(self) -> Self:
        if (self.cohort_status == "resolved") != (self.server_cohort_at_shown is not None):
            raise ValueError("only resolved exposures have an authoritative cohort")
        if len(self.options_shown) != len(set(self.options_shown)):
            raise ValueError("duplicate displayed options")
        return self


class ProbeResponse(Model):
    exposure_id: Identifier
    option_ids: tuple[str, ...] = ()
    skipped: bool = False
    responded_at: AwareDatetime

    @model_validator(mode="after")
    def answer_or_skip(self) -> Self:
        if self.skipped == bool(self.option_ids):
            raise ValueError("provide selected options or skip, exclusively")
        if len(self.option_ids) != len(set(self.option_ids)):
            raise ValueError("duplicate selections")
        return self


class Finding(Model):
    hypothesis_id: str
    cohort: Cohort
    question_version: str
    decision_point: Literal["DP1", "DP2"]
    selected: int
    respondents: int
    self_report: Literal["Unresolved", "Selected by ≥ 50%", "Selected", "Not selected"]
    observation: Literal["Contradicted by rule R2", "No contradiction", "Unknown coverage"]
    evidence_conflict: bool
    evidence_ids: tuple[str, ...]
    rule_version: Literal["mvp-v1"] = "mvp-v1"


class InvestigationState(Model):
    investigation_id: Identifier
    run_id: Identifier
    version: PositiveInt
    data_cutoff: AwareDatetime
    workflow: WorkflowMap
    hypothesis_set: HypothesisSet
    class_mappings: tuple[ClassMapping, ...] = ()
    # Approved probes are part of what v1 locks; served from here once locked.
    probe_questions: tuple[ProbeQuestion, ...] = ()
    probe_plans: tuple[ProbePlan, ...] = ()
    sessions: tuple[SessionStats, ...] = ()
    decisions: tuple[Decision, ...] = ()
    findings: tuple[Finding, ...] = ()
