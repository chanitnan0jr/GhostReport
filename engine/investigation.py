"""Reviewed investigation inputs: workflow, hypotheses, approved mappings and probes."""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from engine.catalog import validate_mappings, validate_question
from engine.guards import ground_hypotheses
from engine.models import (
    ClassMapping,
    DecisionPoint,
    HypothesisSet,
    ProbePlan,
    ProbeQuestion,
    WorkflowMap,
)

DEFAULT_FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "demo_investigation.json"


@dataclass(frozen=True)
class Investigation:
    """Everything approved before v1 is locked. Stage A/B output replaces the fixture later."""

    investigation_id: str
    workflow: WorkflowMap
    hypotheses: HypothesisSet
    class_mappings: tuple[ClassMapping, ...]
    questions: tuple[ProbeQuestion, ...]
    plans: tuple[ProbePlan, ...]

    def question(self, plan: ProbePlan) -> ProbeQuestion:
        return next(q for q in self.questions if q.question_version == plan.question_version)

    def plan(self, plan_id: str) -> ProbePlan | None:
        return next((p for p in self.plans if p.plan_id == plan_id), None)

    def dump(self) -> dict[str, Any]:
        """The same JSON shape `load_investigation` reads."""
        return {
            "investigation_id": self.investigation_id,
            "workflow": self.workflow.model_dump(mode="json"),
            "hypotheses": self.hypotheses.model_dump(mode="json"),
            "class_mappings": [m.model_dump(mode="json") for m in self.class_mappings],
            "questions": [q.model_dump(mode="json") for q in self.questions],
            "plans": [p.model_dump(mode="json") for p in self.plans],
        }

    def plan_for(self, decision_point: DecisionPoint) -> ProbePlan | None:
        return next(
            (p for p in self.plans if self.question(p).decision_point == decision_point), None,
        )


def load_investigation(path: Path = DEFAULT_FIXTURE) -> Investigation:
    """Validate the same invariants the lock enforces, so a bad fixture fails at startup."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    investigation_id = raw["investigation_id"]
    workflow = WorkflowMap.model_validate(raw["workflow"])
    hypotheses = HypothesisSet.model_validate(raw["hypotheses"])
    if ground_hypotheses(hypotheses, workflow) != hypotheses:
        raise ValueError("hypotheses cite evidence missing from the workflow map")
    mappings = tuple(ClassMapping.model_validate(m) for m in raw["class_mappings"])
    validate_mappings(hypotheses, mappings)
    questions = tuple(ProbeQuestion.model_validate(q) for q in raw["questions"])
    for question in questions:
        validate_question(question, hypotheses)
        if question.investigation_id != investigation_id:
            raise ValueError("question belongs to another investigation")
    versions = {q.question_version for q in questions}
    plans = tuple(ProbePlan.model_validate(p) for p in raw["plans"])
    for plan in plans:
        if plan.investigation_id != investigation_id or plan.question_version not in versions:
            raise ValueError("plan references an unknown investigation or question")
    points = [q.decision_point for q in questions if q.question_version in
              {p.question_version for p in plans}]
    if len(points) != len(set(points)) or len(versions) != len(questions):
        raise ValueError("require one question version per decision point")
    return Investigation(
        investigation_id=investigation_id, workflow=workflow, hypotheses=hypotheses,
        class_mappings=mappings, questions=questions, plans=plans,
    )
