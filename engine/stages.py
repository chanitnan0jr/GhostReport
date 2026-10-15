"""Stage A (workflow map) and Stage B (hypotheses) with deterministic post-guards.

The LLM proposes; code decides. Output that fails a guard is dropped and
recorded in `rejected`, never repaired by guessing.
"""

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from engine.catalog import CLASS_DEFINITIONS, STEMS, validate_mappings, validate_question
from engine.context_builder import ContextPack
from engine.guards import ground_hypotheses, validate_workflow
from engine.investigation import Investigation
from engine.llm import LLM
from engine.models import (
    ClassMapping,
    CodeFact,
    Hypothesis,
    HypothesisSet,
    ProbeOption,
    ProbePlan,
    ProbeQuestion,
    WorkflowMap,
)

STAGE_A, STAGE_B = ("stage_a", 1), ("stage_b", 1)
FORBIDDEN_KEY = re.compile(r"probabilit|^prob$|^p$|confidence|likelihood|certainty", re.IGNORECASE)
QUESTION = "Why do sessions in the never-attempted cohort not start connecting a wallet?"
REQUESTER = "Not sure who is asking"
OTHER = "Something else"
TARGETS = {"DP1": "gate_event_no_attempt", "DP2": "no_gate_event"}
GATE_EVENT = "wallet_gate_shown"
ACTION_CATALOG = {
    "check_event": {"params": {"event": GATE_EVENT, "scope": "no_attempt"},
                    "rule_ids": ["R2"], "cost": "tier 0",
                    "does": "count recorded gate events in complete no-attempt sessions"},
    "recommend_instrument": {"params": {"outcome": "<outcome id from the Workflow Map>"},
                             "cost": "not executed",
                             "does": "record a recommendation for developers"},
}
RULE_CATALOG = {"R2": "HC-gate-permission requires that the gate was shown in that session"}


class LLMModel(BaseModel):
    """Lenient on extra keys, strict on probabilities (schema guard)."""

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def no_probabilities(cls, data: Any) -> Any:
        def scan(value: Any) -> None:
            if isinstance(value, dict):
                for key, item in value.items():
                    if FORBIDDEN_KEY.search(str(key)):
                        raise ValueError(f"probability-like field not allowed: {key}")
                    scan(item)
            elif isinstance(value, list):
                for item in value:
                    scan(item)
        scan(data)
        return data


class RefDraft(LLMModel):
    file: str
    lines: tuple[int, int]
    quote: str = Field(min_length=1)


class FactDraft(LLMModel):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{1,60}$")
    desc: str
    code_ref: RefDraft
    instrumentation: Literal["found_in_code", "not_found_in_scope", "unknown"] = "unknown"


class WorkflowDraft(LLMModel):
    states: list[FactDraft] = []
    outcomes: list[FactDraft] = []
    ui_facts: list[FactDraft] = []

    @model_validator(mode="after")
    def not_empty(self) -> Self:
        if not self.states or not self.outcomes:
            raise ValueError("map at least one state and one outcome")
        return self


class HypothesisDraft(LLMModel):
    id: str = Field(pattern=r"^(H[0-9]{1,2}|H_other)$")
    statement: str = Field(min_length=1)
    class_id: str | None = None
    code_evidence: list[str] = []
    generic: bool = True


class ActionDraft(LLMModel):
    action_type: str
    params: dict[str, Any] = {}
    rule_ids: list[str] = []
    note: str = ""


class OptionDraft(LLMModel):
    label: str = Field(min_length=1, max_length=80)
    hypothesis_ids: list[str] = Field(min_length=1)


class HypothesesDraft(LLMModel):
    hypotheses: list[HypothesisDraft]
    proposed_actions: list[ActionDraft] = Field(min_length=1)
    probe_options: dict[Literal["DP1", "DP2"], list[OptionDraft]]

    @model_validator(mode="after")
    def enough(self) -> Self:
        if len([h for h in self.hypotheses if h.id != "H_other"]) < 3:
            raise ValueError("propose at least 3 hypotheses besides H_other")
        if len(self.probe_options.get("DP1") or []) < 2 or len(
                self.probe_options.get("DP2") or []) < 2:
            raise ValueError("write 2-3 probe options for both DP1 and DP2")
        return self


class InvestigationDraft(BaseModel):
    """Unapproved Stage A/B output; an operator turns it into an Investigation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    investigation_id: str
    repo_root: str
    workflow: WorkflowMap
    hypotheses: HypothesisSet
    actions: tuple[dict[str, Any], ...]
    recommendations: tuple[dict[str, Any], ...]
    probe_options: dict[str, tuple[ProbeOption, ...]]
    rejected: dict[str, list[str]]
    llm: dict[str, Any]
    mode: Literal["behavioral", "code_only"] = "behavioral"
    cannot_check: tuple[dict[str, str], ...] = ()


def _digest(*parts: str) -> str:
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()[:12]


def _calls_in(pack: ContextPack, fact: CodeFact) -> bool:
    start, end = fact.code_ref.lines
    return any(c.file == fact.code_ref.file and start <= c.line <= end
               for c in pack.analytics_calls)


def run_stage_a(
    llm: LLM, pack: ContextPack, root: Path, *, workflow_name: str = "wallet_onboarding",
) -> tuple[WorkflowMap, dict[str, list[str]]]:
    """Map the workflow, then drop refs that fail the code-ref guard.

    `found_in_code` must be backed by a detected analytics call in the cited
    range; otherwise it degrades to `unknown` (never to `not_found_in_scope`).
    """
    draft = llm.call(*STAGE_A, WorkflowDraft, context=pack.render(),
                     instructions=json.dumps({"workflow": workflow_name}))
    version = "wf-" + _digest(pack.render(), draft.model_dump_json())
    rejected: dict[str, list[str]] = {"duplicate_id": [], "invalid_ref": [], "downgraded": []}
    seen: set[str] = set()

    def facts(items: list[FactDraft], outcome: bool) -> tuple[CodeFact, ...]:
        result = []
        for item in items:
            if item.id in seen:
                rejected["duplicate_id"].append(item.id)
                continue
            seen.add(item.id)
            if item.code_ref.lines[0] < 1 or item.code_ref.lines[0] > item.code_ref.lines[1]:
                rejected["invalid_ref"].append(item.id)
                continue
            fact = CodeFact.model_validate({
                **item.model_dump(),
                "instrumentation": item.instrumentation if outcome else "unknown",
            })
            if outcome and fact.instrumentation == "found_in_code" and not _calls_in(pack, fact):
                fact = CodeFact.model_validate({**fact.model_dump(), "instrumentation": "unknown"})
                rejected["downgraded"].append(fact.id)
            result.append(fact)
        return tuple(result)

    workflow = WorkflowMap(
        version=version, scope=pack.scope, states=facts(draft.states, False),
        outcomes=facts(draft.outcomes, True), ui_facts=facts(draft.ui_facts, False),
    )
    workflow, invalid = validate_workflow(root, workflow)
    rejected["invalid_ref"].extend(invalid)
    return workflow, rejected


def run_stage_b(
    llm: LLM, pack: ContextPack, workflow: WorkflowMap, cohort_stats: dict[str, Any], *,
    investigation_id: str = "inv-never-attempted", repo_root: str = "app",
    mapped_events: frozenset[str] | None = None, code_only: bool = False,
) -> InvestigationDraft:
    """Hypotheses, catalog-only actions and probe options; nothing here is approved.

    `mapped_events` (canonical names the target emits; None = not checked) drops any
    check_event whose event is unmapped and records the rule as cannot_check (§10).
    """
    instructions = json.dumps({
        "investigation_question": QUESTION,
        "workflow_map": workflow.model_dump(mode="json"),
        "cohort_stats": cohort_stats,
        "hypothesis_classes": CLASS_DEFINITIONS,
        "action_catalog": ACTION_CATALOG,
        "rule_catalog": RULE_CATALOG,
    }, ensure_ascii=False, default=str)
    draft = llm.call(*STAGE_B, HypothesesDraft, context=pack.render(),
                     instructions=instructions)
    rejected: dict[str, list[str]] = {"class_id": [], "action": [], "option": [],
                                      "hypothesis": []}
    hypotheses: list[Hypothesis] = []
    for item in draft.hypotheses:
        if item.id == "H_other" or item.id in {h.id for h in hypotheses}:
            continue
        class_id = item.class_id
        if class_id is not None and class_id not in CLASS_DEFINITIONS:
            rejected["class_id"].append(f"{item.id}:{class_id}")
            class_id = None
        hypotheses.append(Hypothesis(
            id=item.id, statement=item.statement, class_id=class_id,
            code_evidence=tuple(item.code_evidence),
            generic=item.generic or not item.code_evidence,
        ))
    hypotheses.append(Hypothesis(id="H_other", statement="A reason not yet proposed"))
    grounded = ground_hypotheses(
        HypothesisSet(workflow_version=workflow.version, hypotheses=tuple(hypotheses)), workflow,
    )
    ids = {h.id for h in grounded.hypotheses}
    outcome_ids = {o.id for o in workflow.outcomes}
    actions, recommendations = [], []
    cannot_check = []
    if mapped_events is not None and GATE_EVENT not in mapped_events:
        cannot_check = [{"rule_id": rule, "needs_event": GATE_EVENT, "rule": text}
                        for rule, text in RULE_CATALOG.items()]
    for action in draft.proposed_actions:
        spec = ACTION_CATALOG.get(action.action_type)
        if action.action_type == "check_event" and spec is not None:
            if cannot_check:
                rejected["action"].append(f"check_event:unmapped {GATE_EVENT}")
                continue
            if action.params == spec["params"] and set(action.rule_ids) <= set(RULE_CATALOG):
                actions.append({**action.model_dump(), "note_affects_state": False})
                continue
        elif (action.action_type == "recommend_instrument"
              and action.params.get("outcome") in outcome_ids):
            recommendations.append(action.model_dump())
            continue
        rejected["action"].append(action.action_type)
    options: dict[str, tuple[ProbeOption, ...]] = {}
    requester = tuple(h.id for h in grounded.hypotheses
                      if h.class_id == "HC-unclear-requester") or ("H_other",)
    for point in ("DP1", "DP2"):
        kept: list[ProbeOption] = []
        for option in draft.probe_options.get(point, []):
            label = option.label.strip()
            mapped = tuple(h for h in option.hypothesis_ids if h in ids)
            # The fixed options already cover H_other and, at DP1, the requester class.
            covered = {"H_other", *requester} if point == "DP1" else {"H_other"}
            if (not mapped or set(mapped) <= covered or len(mapped) > 2
                    or label.lower() in {OTHER.lower(), "skip", REQUESTER.lower()}
                    or (point == "DP2" and "wallet" in label.lower())):
                rejected["option"].append(f"{point}:{label}")
                continue
            kept.append(ProbeOption(id=f"o{len(kept) + 1}", label=label, hypothesis_ids=mapped))
        kept = kept[:3]
        if point == "DP1":
            kept.append(ProbeOption(id="requester", label=REQUESTER, hypothesis_ids=requester))
        kept.append(ProbeOption(id="other", label=OTHER, hypothesis_ids=("H_other",)))
        options[point] = tuple(kept)
    if not any(h.class_id == "HC-browsing" for h in grounded.hypotheses):
        rejected["hypothesis"].append("no non-problem hypothesis proposed")
    return InvestigationDraft(
        investigation_id=investigation_id, repo_root=repo_root, workflow=workflow,
        hypotheses=grounded, actions=tuple(actions), recommendations=tuple(recommendations),
        probe_options=options, rejected=rejected,
        mode="code_only" if code_only else "behavioral", cannot_check=tuple(cannot_check),
        llm={"model": llm.model, "thinking": llm.thinking,
             "prompts": [f"{s}.v{v}" for s, v in (STAGE_A, STAGE_B)]},
    )


def approve(
    draft: InvestigationDraft, *, approved_by: str, now: datetime, ends_at: datetime,
    target_n: int = 10, budget: int = 30,
) -> Investigation:
    """The operator approves class mappings and probe questions together, once."""
    if ends_at <= now:
        raise ValueError("collection must end after approval")
    mappings = tuple(
        ClassMapping(hypothesis_id=h.id, class_id=h.class_id, approved_by=approved_by,
                     approved_at=now)
        for h in draft.hypotheses.hypotheses if h.class_id in CLASS_DEFINITIONS
    )
    questions, plans = [], []
    for point, options in draft.probe_options.items():
        version = f"{point.lower()}.{_digest(json.dumps([o.model_dump() for o in options]))}"
        questions.append(ProbeQuestion(
            question_version=version, investigation_id=draft.investigation_id,
            decision_point=point,
            stem=STEMS[point], options=options, approved_by=approved_by, approved_at=now,
        ))
        plans.append(ProbePlan(
            plan_id=f"plan-{version}", investigation_id=draft.investigation_id,
            question_version=version, target_cohorts=(TARGETS[point],),
            target_n=target_n, budget=budget, ends_at=ends_at,
        ))
    validate_mappings(draft.hypotheses, mappings)
    for question in questions:
        validate_question(question, draft.hypotheses)
    return Investigation(
        investigation_id=draft.investigation_id, workflow=draft.workflow,
        hypotheses=draft.hypotheses, class_mappings=mappings, questions=tuple(questions),
        plans=tuple(plans),
    )

