from pathlib import Path
from typing import Any

import pytest

from engine.llm import LLM
from engine.models import Hypothesis
from engine.narrative import check, facts, generate, template
from tests.test_stages import Script

HYPOTHESES = [Hypothesis(id="H1", statement="I didn't know I needed a wallet"),
              Hypothesis(id="H2", statement="Just looking, because I was curious"),
              Hypothesis(id="H_other", statement="A reason not yet proposed")]


def finding(hid: str, selected: int, respondents: int, seed: int) -> dict[str, Any]:
    by_source = {"seed": {"selected": seed, "respondents": 4}}
    if respondents > 4:
        by_source["visitor"] = {"selected": selected - seed, "respondents": respondents - 4}
    return {"decision_point": "DP1", "cohort": "gate_event_no_attempt", "hypothesis_id": hid,
            "selected": selected, "respondents": respondents, "by_source": by_source,
            "self_report": "Selected", "observation": "No contradiction"}


CURRENT = {
    "population": "seed 20 + visitors 3",
    "sources": {"seed": 20, "test": 0, "visitor": 3},
    "cohorts": [{"cohort": "gate_event_no_attempt", "sessions": 9},
                {"cohort": "connected", "sessions": 14}],
    "probes": [{"decision_point": "DP1", "target_cohorts": ["gate_event_no_attempt"],
                "counts": {"shown": 9, "answered": 6, "skipped": 3, "shown_no_response": 0}}],
    "findings": [finding("H1", 4, 6, 3), finding("H2", 2, 6, 1), finding("H_other", 0, 6, 0)],
}
FACTS = facts(CURRENT, HYPOTHESES, locked=True)


def test_template_passes_its_own_checker() -> None:
    text = template(FACTS)
    assert check(text, FACTS) == []
    assert "seed 20 + visitors 3" in text and "4 of 6 respondents" in text
    assert "(seed 3 of 4 · visitors 1 of 2)" in text


@pytest.mark.parametrize(("text", "problem"), [
    ("H1 was chosen by 4 of 6 respondents.", "population split missing"),
    ("Population seed 20 + visitors 3. H1 was chosen by 4 of 6 respondents because it "
     "was confusing.", "forbidden wording: 'because'"),
    ("Population seed 20 + visitors 3. H1 was chosen by 66% of people.", "forbidden"),
    ("Population seed 20 + visitors 3. H2 was chosen by 4 of 6 respondents.",
     "matches no named hypothesis"),
    ("Population seed 20 + visitors 3. 24 people saw the gate.", "number not in facts: 24"),
    ("Population seed 20 + visitors 3. H1 was chosen by 4 of 7 respondents.", "not in facts"),
    ("Population seed 20 + visitors 3. 9 of 14 sessions reached the gate.", "sessions"),
    ("Population seed 20 + visitors 3. H9 was chosen by 4 of 6 respondents.", "unknown"),
    ("Population seed 20 + visitors 3. Most respondents chose H1.", "vague quantity"),
    ("Population seed 20 + visitors 3. Almost half of the users left.", "vague quantity"),
    ("Population seed 20 + visitors 3. H1 was chosen by 4 of 6.", "without a unit"),
    ("Population seed 20 + visitors 3. H1 was chosen by 4 of 6 respondents (seed 2 of 4).",
     "split '2 of 4'"),
])
def test_checker_rejects_ungrounded_claims(text: str, problem: str) -> None:
    assert any(problem in p for p in check(text, FACTS))


def test_checker_accepts_grounded_claims_and_quoted_statements() -> None:
    text = ('Population: seed 20 + visitors 3 (seed sessions are simulated users). '
            'At DP1, 6 of 9 sessions answered. H2 ("Just looking, because I was curious") '
            'was selected by 2 of 6 respondents, and H1 by 4 of 6 respondents (seed 3 of 4).')
    assert check(text, FACTS) == []


def test_generate_falls_back_to_the_template(tmp_path: Path) -> None:
    llm = LLM(cache_path=tmp_path / "cache.sqlite")
    bad = {"paragraph": "Population: seed 20 + visitors 3. H1 caused most drop-off, "
                        "with 4 of 6 respondents agreeing."}
    llm.complete = script = Script([bad, bad])
    result = generate(llm, FACTS)
    assert result["source"] == "template" and result["text"] == template(FACTS)
    assert any("caus" in p for p in result["rejected"])
    assert "checker_problems" in script.sent[1][1]["content"]  # one repair round
    good = ("Population: seed 20 + visitors 3, where seed sessions are simulated users. "
            "H1 was selected by 4 of 6 respondents at DP1.")
    llm.complete = Script([{"paragraph": good}])
    fresh = facts({**CURRENT, "population": "seed 20 + visitors 3"}, HYPOTHESES, locked=True)
    assert generate(LLM(cache_path=tmp_path / "other.sqlite", complete=llm.complete),
                    fresh)["source"] == "llm"


def test_generate_repairs_once_with_the_checker_problems(tmp_path: Path) -> None:
    good = ("Population: seed 20 + visitors 3; seed sessions are simulated users. "
            "H1 was selected by 4 of 6 respondents at DP1.")
    script = Script([{"paragraph": "Population: seed 20 + visitors 3. H1 is likely."},
                     {"paragraph": good}])
    result = generate(LLM(cache_path=tmp_path / "c.sqlite", complete=script), FACTS)
    assert result == {"text": good, "source": "llm", "rejected": []}
