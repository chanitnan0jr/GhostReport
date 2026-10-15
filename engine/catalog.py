"""Team-authored MVP catalog. LLM statements cannot create rules or actions."""

from typing import Literal

from engine.models import ClassMapping, HypothesisSet, Model, ProbeOption, ProbeQuestion

CATALOG_VERSION = "mvp-v1"
CLASS_DEFINITIONS = {
    "HC-unaware-requirement": "Did not know a wallet was required before applying",
    "HC-gate-permission": "Concern about the permissions displayed in this wallet gate",
    "HC-browsing": "Browsing projects without intending to apply now",
    "HC-unclear-requester": "Unsure whether the dApp, wallet or browser is asking",
}
ACTION_ID = "check_gate:no_attempt:R2"
STEMS = {
    "DP1": "What best describes your decision not to connect right now?",
    "DP2": "What were you hoping to do on this page?",
}


class CandidateAction(Model):
    """The only executable telemetry action in the MVP catalog."""

    action_type: Literal["check_event"]
    event: Literal["wallet_gate_shown"]
    scope: Literal["no_attempt"]
    rule_ids: tuple[Literal["R2"], ...] = ("R2",)


def validate_mappings(hypotheses: HypothesisSet, mappings: tuple[ClassMapping, ...]) -> None:
    """Approve class membership externally; unknown classes remain unruled."""
    ids = {h.id for h in hypotheses.hypotheses} - {"H_other"}
    seen: set[str] = set()
    for mapping in mappings:
        if (mapping.hypothesis_id not in ids or mapping.class_id not in CLASS_DEFINITIONS
                or mapping.hypothesis_id in seen):
            raise ValueError("invalid, duplicate, or unknown approved class mapping")
        seen.add(mapping.hypothesis_id)


def validate_question(question: ProbeQuestion, hypotheses: HypothesisSet) -> None:
    """Enforce fixed stems and the requester-attribution option for DP1."""
    if question.stem != STEMS[question.decision_point]:
        raise ValueError("probe stem must match the reviewed decision point")
    ids = {h.id for h in hypotheses.hypotheses}
    for option in question.options:
        if not option.hypothesis_ids or not set(option.hypothesis_ids) <= ids:
            raise ValueError("option must map to hypotheses from this investigation")
    if question.decision_point == "DP1" and not any(
        o.label == "Not sure who is asking" for o in question.options
    ):
        raise ValueError("DP1 requires the requester-attribution option")


def default_options() -> tuple[ProbeOption, ...]:
    """Fallback wording is reviewed by the operator before use."""
    return (
        ProbeOption(id="unaware", label="Didn't know I needed a wallet", hypothesis_ids=("H1",)),
        ProbeOption(id="permission", label="Concerned about permissions", hypothesis_ids=("H2",)),
        ProbeOption(id="browse", label="Just browsing", hypothesis_ids=("H3",)),
        ProbeOption(id="requester", label="Not sure who is asking", hypothesis_ids=("H_other",)),
        ProbeOption(id="other", label="Something else", hypothesis_ids=("H_other",)),
    )
