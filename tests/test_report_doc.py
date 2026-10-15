import json
from pathlib import Path
from typing import Any

import pytest

from engine.llm import LLM
from engine.report_doc import OUTLINE, check, context, digest, generate, template
from tests.test_stages import Script

SAMPLE = json.loads((Path(__file__).parent.parent / "fixtures" / "report.sample.json")
                    .read_text(encoding="utf-8"))
CONTEXT = context(SAMPLE)
DOC = template(CONTEXT)


def replace(old: str, new: str) -> str:
    assert old in DOC, old
    return DOC.replace(old, new, 1)


def test_template_passes_its_own_checker_and_cites_every_finding() -> None:
    assert check(DOC, CONTEXT) == []
    findings = [f["id"] for f in CONTEXT["facts"] if f["kind"] == "finding"]
    assert findings and all(f"[fact:{f}]" in DOC for f in findings)
    assert "2 of 3 respondents" in DOC


def test_context_digest_ignores_the_current_cutoff() -> None:
    later = json.loads(json.dumps(SAMPLE))
    later["current"]["data_cutoff"] = "2030-01-01T00:00:00+00:00"
    assert digest(context(later)) == digest(CONTEXT)
    later["current"]["cohorts"][0]["sessions"] += 1
    assert digest(context(later)) != digest(CONTEXT)


@pytest.mark.parametrize(("edited", "problem"), [
    (lambda: replace("2 of 3 respondents", "3 of 3 respondents"), "matches no cited fact"),
    (lambda: replace("[fact:population]", "[fact:population_total]"), "unknown citation"),
    (lambda: replace("## 4. Evidence Gaps", "## 4. Gaps"), "sections must be exactly"),
    (lambda: replace("were grouped by", "were grouped, because of the gate, by"),
     "forbidden wording"),
    (lambda: replace("[fact:limit_commit]", ""), "must cite [fact:limit_commit]"),
    (lambda: replace("## Appendix", "<b>x</b>\n\n## Appendix"), "no HTML"),
    (lambda: replace("## Appendix", "Two respondents agreed.\n\n## Appendix"),
     "numbers without a citation"),
    (lambda: replace("## Appendix", "Nine outcomes. [fact:instrumentation]\n\n## Appendix"),
     "number 9 is not in the cited facts"),
    (lambda: replace("## Appendix", "It was seen in 4 sessions.\n\n## Appendix"),
     "numbers without a citation"),
])
def test_checker_rejects_untraceable_claims(edited: Any, problem: str) -> None:
    assert any(problem in p for p in check(edited(), CONTEXT))


def test_checker_keeps_answers_apart_from_recorded_observations() -> None:
    mixed = replace(
        "## Appendix",
        "H1 was selected by 2 of 3 respondents and 4 of 6 sessions reached the gate. "
        "[fact:finding_dp1_h1] [fact:cohort_gate_event_no_attempt]\n\n## Appendix")
    assert any("self-reported answers and recorded observations" in p
               for p in check(mixed, CONTEXT))


def test_an_unknown_outcome_is_not_called_a_gap() -> None:
    value = json.loads(json.dumps(SAMPLE))
    value["workflow"]["outcomes"][0]["instrumentation"] = "unknown"
    ctx = context(value)
    assert check(template(ctx), ctx) == []
    claim = template(ctx).replace(
        "## Appendix",
        "- `wallet_rejected` is a tracking gap. [fact:outcome_wallet_rejected]\n\n## Appendix")
    assert any("not a gap" in p for p in check(claim, ctx))


def test_rejected_document_is_sent_back_once_then_falls_back(tmp_path: Path) -> None:
    bad = {"markdown": DOC.replace("2 of 3 respondents", "3 of 3 respondents")}
    calls = Script([bad, {"markdown": DOC}])
    result = generate(LLM(cache_path=tmp_path / "llm.sqlite", complete=calls), CONTEXT)
    assert result["source"] == "llm" and result["rejected"] == []
    assert "checker_problems" in calls.sent[1][-1]["content"]

    calls = Script([bad, bad])
    result = generate(LLM(cache_path=tmp_path / "other.sqlite", complete=calls), CONTEXT)
    assert result["source"] == "template" and result["markdown"] == DOC
    assert any("matches no cited fact" in p for p in result["rejected"])


def test_console_mock_document_matches_the_engine() -> None:
    """console/src/mock.ts serves this file; regenerate with UPDATE_FIXTURES=1."""
    import os

    body = json.loads(json.dumps(SAMPLE))  # the same source split console/src/mock.ts adds
    current = body["current"]
    current["sources"] = {"seed": len(current["sessions"]), "test": 0, "visitor": 0}
    for f in current["findings"]:
        f["by_source"] = {"seed": {"selected": f["selected"], "respondents": f["respondents"]}}
    value = context(body)
    expected = {
        "markdown": template(value), "source": "template", "rejected": [], "pending": False,
        "context_sha256": digest(value), "snapshot_id": digest(value)[:16],
        "generated_at": None, "prompt": None, "title": value["title"],
        "investigation_id": value["investigation_id"],
        "outline": list(OUTLINE), "facts": value["facts"],
    }
    path = Path(__file__).parent.parent / "fixtures" / "report.document.sample.json"
    if os.getenv("UPDATE_FIXTURES") == "1":
        path.write_text(json.dumps(expected, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    assert json.loads(path.read_text(encoding="utf-8")) == expected


def test_a_count_of_the_cited_facts_is_traceable() -> None:
    value = json.loads(json.dumps(SAMPLE))
    ctx = context(value)
    counted = template(ctx).replace(
        "## Appendix",
        "2 outcomes were not found in the searched files. "
        "[fact:outcome_wallet_rejected] [fact:outcome_wallet_errored]\n\n"
        "3 outcomes were reviewed. [fact:outcome_wallet_rejected]\n\n"
        "The two outcomes are listed. [fact:outcome_wallet_rejected] "
        "[fact:outcome_wallet_errored]\n\n## Appendix")
    problems = check(counted, ctx)
    assert not any("2 outcomes" in p for p in problems)
    assert any("number 3 is not in the cited facts" in p for p in problems)


def test_placeholders_become_cited_numbers_that_pass_the_checker() -> None:
    from engine.report_doc import expand, handles, placeholders

    by_id = {fact["id"]: handle for handle, fact in handles(CONTEXT).items()}
    gate, h1 = by_id["cohort_gate_event_no_attempt"], by_id["finding_dp1_h1"]
    hyp = by_id["hypothesis_h1"]
    assert placeholders(CONTEXT)["cohort_gate_event_no_attempt"][f"{{{gate}}}"] == (
        "4 of 6 sessions")
    draft = DOC.replace(
        "## Appendix",
        f"The gate was recorded without an attempt in {{{gate}}}.\n\n"
        f"H1 {{{hyp}.statement}} was selected by {{{h1}}}.\n\n"
        f"| Cohort | Sessions |\n| --- | --- |\n| Gate | {{{gate}}} |\n\n## Appendix")
    expanded = expand(draft, CONTEXT)
    assert "in 4 of 6 sessions [fact:cohort_gate_event_no_attempt]." in expanded
    assert "selected by 2 of 3 respondents [fact:hypothesis_h1] [fact:finding_dp1_h1]." in (
        expanded)
    assert "| Gate | 4 of 6 sessions [fact:cohort_gate_event_no_attempt] |" in expanded
    assert check(expanded, CONTEXT) == []
    unknown = expand(DOC.replace("## Appendix", "Seen in {f999}.\n\n## Appendix"), CONTEXT)
    assert any("unknown placeholder {f999}" in p for p in check(unknown, CONTEXT))
