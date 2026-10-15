"""Stage guards with a scripted LLM: the model proposes, deterministic code decides."""

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from engine.context_builder import build_context
from engine.llm import LLM, LLMError, Message
from engine.stages import approve, run_stage_a, run_stage_b

NOW = datetime(2026, 10, 15, 6, 0, tzinfo=UTC)
APPLY = """import { track } from './track';
export function ApplyModal({ wallet }) {
  if (!wallet) return requireWallet();
  track('wallet_gate_shown', 'ApplyModal');
  return <button>Apply</button>;
}
"""
WALLET = """export function onReject(error) {
  callbacks.onFailure(error.message);
}
export function onConnect() {
  track('wallet_connected', 'MockWalletPopup');
}
"""


class Script:
    """Returns queued replies and records what the model was sent."""

    def __init__(self, replies: list[Any]) -> None:
        self.replies = [r if isinstance(r, str) else json.dumps(r) for r in replies]
        self.sent: list[list[Message]] = []

    def __call__(self, messages: list[Message], model: str,
                 thinking: bool) -> tuple[str, dict[str, Any]]:
        self.sent.append(messages)
        return self.replies.pop(0), {"prompt_tokens": 1, "completion_tokens": 1}


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "ApplyModal.tsx").write_text(APPLY)
    (tmp_path / "src" / "wallet.ts").write_text(WALLET)
    (tmp_path / "src" / "ApplyModal.test.tsx").write_text("track('leaked_event_name')\n")
    return tmp_path


@pytest.fixture
def llm(tmp_path: Path) -> Iterator[LLM]:
    instance = LLM(cache_path=tmp_path / "cache.sqlite", model="fake", thinking=False,
                   replay=False)
    yield instance
    instance.db.close()


def fact(id: str, file: str, lines: list[int], quote: str, inst: str = "unknown") -> dict[str, Any]:
    return {"id": id, "desc": id, "code_ref": {"file": file, "lines": lines, "quote": quote},
            "instrumentation": inst}


WORKFLOW = {
    "states": [fact("apply_gated", "src/ApplyModal.tsx", [3, 3], "if (!wallet) return")],
    "outcomes": [
        fact("rejected", "src/wallet.ts", [1, 3], "onReject(error)", "found_in_code"),
        fact("connected", "src/wallet.ts", [4, 6], "track('wallet_connected'", "found_in_code"),
        fact("made_up", "src/wallet.ts", [1, 1], "this text is not in the file"),
    ],
    "ui_facts": [fact("apply_button", "src/ApplyModal.tsx", [5, 5], "<button>Apply</button>")],
}
HYPOTHESES = {
    "hypotheses": [
        {"id": "H1", "statement": "Did not know", "class_id": "HC-unaware-requirement",
         "code_evidence": ["apply_button", "ghost_id"], "generic": False},
        {"id": "H2", "statement": "Permissions", "class_id": "HC-invented",
         "code_evidence": [], "generic": False},
        {"id": "H3", "statement": "Browsing", "class_id": "HC-browsing", "code_evidence": []},
        {"id": "H4", "statement": "Who asks", "class_id": "HC-unclear-requester",
         "code_evidence": ["apply_gated"], "generic": False},
    ],
    "proposed_actions": [
        {"action_type": "check_event", "params": {"event": "wallet_gate_shown",
                                                  "scope": "no_attempt"}, "rule_ids": ["R2"]},
        {"action_type": "check_event", "params": {"event": "apply_clicked"}, "rule_ids": ["R2"]},
        {"action_type": "run_shell", "params": {"cmd": "rm -rf /"}},
        {"action_type": "recommend_instrument", "params": {"outcome": "rejected"}},
    ],
    "probe_options": {
        "DP1": [{"label": "Didn't know I needed a wallet", "hypothesis_ids": ["H1"]},
                {"label": "Unsure who wants this", "hypothesis_ids": ["H4"]},
                {"label": "Something else", "hypothesis_ids": ["H_other"]}],
        "DP2": [{"label": "Just looking", "hypothesis_ids": ["H3"]},
                {"label": "Connect my wallet later", "hypothesis_ids": ["H1"]},
                {"label": "Wanted to apply", "hypothesis_ids": ["H1", "H9"]}],
    },
}


def test_context_builder_excludes_tests_and_finds_calls(repo: Path) -> None:
    pack = build_context(repo)
    assert "src/ApplyModal.test.tsx" not in pack.scope.searched_files
    assert {c.event for c in pack.analytics_calls} == {"wallet_gate_shown", "wallet_connected"}
    assert "untrusted data" in pack.render()


def test_stage_a_guards(repo: Path, llm: LLM) -> None:
    llm.complete = Script([WORKFLOW])
    workflow, rejected = run_stage_a(llm, build_context(repo), repo)
    outcomes = {o.id: o.instrumentation for o in workflow.outcomes}
    assert "made_up" not in outcomes and rejected["invalid_ref"] == ["made_up"]
    assert outcomes == {"rejected": "unknown", "connected": "found_in_code"}
    assert rejected["downgraded"] == ["rejected"]


def test_stage_a_repairs_once_then_fails(repo: Path, llm: LLM) -> None:
    script = Script(["{\"states\": []}", WORKFLOW])
    llm.complete = script
    run_stage_a(llm, build_context(repo), repo)
    assert len(script.sent) == 2 and "failed validation" in script.sent[1][-1]["content"]
    llm.complete = Script(["not json", "{\"outcomes\": [], \"probability\": 0.9}"])
    with pytest.raises(LLMError):
        run_stage_a(llm, build_context(repo, keywords=("Apply",)), repo)


def test_cache_and_replay(repo: Path, llm: LLM) -> None:
    llm.complete = Script([WORKFLOW])
    first, _ = run_stage_a(llm, build_context(repo), repo)
    llm.complete, llm.replay = Script([]), True
    assert run_stage_a(llm, build_context(repo), repo)[0] == first
    with pytest.raises(LLMError, match="REPLAY"):
        run_stage_a(llm, build_context(repo, keywords=("Apply",)), repo)


def test_stage_b_guards_and_approval(repo: Path, llm: LLM) -> None:
    llm.complete = Script([WORKFLOW, HYPOTHESES])
    pack = build_context(repo)
    workflow, _ = run_stage_a(llm, pack, repo)
    draft = run_stage_b(llm, pack, workflow, {})
    by_id = {h.id: h for h in draft.hypotheses.hypotheses}
    assert by_id["H1"].code_evidence == ("apply_button",) and not by_id["H1"].generic
    assert by_id["H2"].class_id is None and by_id["H2"].generic
    assert "H_other" in by_id and draft.rejected["class_id"] == ["H2:HC-invented"]
    assert [a["params"] for a in draft.actions] == [
        {"event": "wallet_gate_shown", "scope": "no_attempt"}]
    assert draft.rejected["action"] == ["check_event", "run_shell"]
    assert [r["params"]["outcome"] for r in draft.recommendations] == ["rejected"]
    dp1 = [(o.label, o.hypothesis_ids) for o in draft.probe_options["DP1"]]
    assert dp1 == [("Didn't know I needed a wallet", ("H1",)),
                   ("Not sure who is asking", ("H4",)), ("Something else", ("H_other",))]
    dp2 = [o.label for o in draft.probe_options["DP2"]]
    assert dp2 == ["Just looking", "Wanted to apply", "Something else"]
    investigation = approve(draft, approved_by="mentor", now=NOW,
                            ends_at=NOW + timedelta(hours=30))
    assert {m.hypothesis_id for m in investigation.class_mappings} == {"H1", "H3", "H4"}
    assert investigation.plan_for("DP1") is not None and investigation.plan_for("DP2") is not None
    with pytest.raises(ValueError):
        approve(draft, approved_by="mentor", now=NOW, ends_at=NOW)


def test_code_only_drops_rules_whose_event_is_unmapped(repo: Path, llm: LLM) -> None:
    llm.complete = Script([WORKFLOW, HYPOTHESES])
    pack = build_context(repo)
    workflow, _ = run_stage_a(llm, pack, repo)
    draft = run_stage_b(llm, pack, workflow, {"mode": "code_only"},
                        mapped_events=frozenset({"wallet_connected"}), code_only=True)
    assert draft.actions == () and draft.mode == "code_only"
    assert "check_event:unmapped wallet_gate_shown" in draft.rejected["action"]
    assert [g["rule_id"] for g in draft.cannot_check] == ["R2"]


def test_analytics_calls_include_repo_wrappers(tmp_path: Path) -> None:
    (tmp_path / "Flow.tsx").write_text(
        "const wallet = 1\nsendEvent('register:start', { wallet })\ntrack('ignored')\n")
    pack = build_context(tmp_path, analytics_calls=("sendEvent",))
    assert [(c.function, c.event) for c in pack.analytics_calls] == [
        ("sendEvent", "register:start")]
