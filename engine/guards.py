"""Validate references mechanically without claiming semantic correctness."""

from pathlib import Path

from engine.models import CodeFact, CodeRef, HypothesisSet, WorkflowMap


def validate_ref(root: Path, ref: CodeRef) -> bool:
    """Reject traversal, symlink escape, invalid ranges and fabricated quotations."""
    base = root.resolve()
    file = (base / ref.file).resolve()
    if not file.is_relative_to(base) or Path(ref.file).is_absolute():
        return False
    try:
        lines = file.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return False
    start, end = ref.lines
    return end <= len(lines) and ref.quote in "\n".join(lines[start - 1:end])


def validate_workflow(root: Path, workflow: WorkflowMap) -> tuple[WorkflowMap, tuple[str, ...]]:
    """Drop invalid references; downgrade uncertain instrumentation to unknown."""
    rejected: list[str] = []

    def clean(facts: tuple[CodeFact, ...]) -> tuple[CodeFact, ...]:
        output: list[CodeFact] = []
        for fact in facts:
            if (fact.code_ref.file not in workflow.scope.searched_files
                    or not validate_ref(root, fact.code_ref)):
                rejected.append(fact.id)
                continue
            uncertain = workflow.scope.truncated or bool(workflow.scope.unresolved_imports)
            if uncertain and fact.instrumentation == "not_found_in_scope":
                fact = CodeFact.model_validate({**fact.model_dump(), "instrumentation": "unknown"})
            output.append(fact)
        return tuple(output)

    result = WorkflowMap(
        version=workflow.version, scope=workflow.scope, states=clean(workflow.states),
        outcomes=clean(workflow.outcomes), ui_facts=clean(workflow.ui_facts),
    )
    return result, tuple(rejected)


def ground_hypotheses(hypotheses: HypothesisSet, workflow: WorkflowMap) -> HypothesisSet:
    """Remove unknown evidence IDs and mark ungrounded statements as generic."""
    if hypotheses.workflow_version != workflow.version:
        raise ValueError("hypotheses reference another workflow version")
    ids = {f.id for f in (*workflow.states, *workflow.outcomes, *workflow.ui_facts)}
    cleaned = []
    for hypothesis in hypotheses.hypotheses:
        evidence = tuple(i for i in hypothesis.code_evidence if i in ids)
        cleaned.append(type(hypothesis).model_validate({
            **hypothesis.model_dump(), "code_evidence": evidence,
            "generic": hypothesis.generic or not evidence,
        }))
    return HypothesisSet(workflow_version=workflow.version, hypotheses=tuple(cleaned))
