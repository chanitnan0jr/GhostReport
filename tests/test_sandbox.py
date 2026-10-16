"""Sandboxes: isolated simulated runs that go through the real ingest and probe paths."""

import random
import sqlite3
import time
from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from engine import sandbox as sandbox_module
from engine.api import Settings, create_app
from engine.demo import INVESTIGATION
from engine.investigation import load_investigation
from engine.llm import LLM, LLMError
from engine.sandbox import BRANCHES, MAX_ATTEMPTS, SandboxHub, walk
from engine.segment_spec import template_spec
from engine.workflow_view import workflow_view
from tests.test_api import GATE_VERIFIED, Clock
from tests.test_stages import HYPOTHESES, Script

APP = Path(__file__).resolve().parents[1] / "app"  # the prepared Workflow Map cites it


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def calls() -> list[int]:
    return []


@pytest.fixture
def client(tmp_path: Path, clock: Clock, calls: list[int]) -> Iterator[TestClient]:
    def fake() -> LLM:
        script = Script([HYPOTHESES])

        def complete(messages: Any, model: str, thinking: bool) -> Any:
            calls.append(1)
            return script(messages, model, thinking)

        return LLM(cache_path=tmp_path / "cache.sqlite", model="fake", thinking=False,
                   replay=False, complete=complete)

    settings = Settings(run_id="judging", mode="demo", db_dir=tmp_path / "runs",
                        sandbox_root=tmp_path / "runs" / "sandboxes", dp0_seconds=0,
                        clock=clock, operator_token=None, code_commit="c1",
                        verifications=GATE_VERIFIED, target_repo=APP, llm=fake)
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def start(client: TestClient) -> tuple[str, dict[str, str]]:
    created = client.post("/api/sandbox")
    assert created.status_code == 201
    body = created.json()
    return body["sandbox_id"], {"Authorization": f"Bearer {body['token']}"}


def traffic(client: TestClient, sid: str, owner: dict[str, str], **body: Any) -> Any:
    response = client.post(f"/api/sandbox/{sid}/traffic", json=body, headers=owner)
    assert response.status_code == 200, response.text
    return response.json()


def wait_for_investigation(client: TestClient, sid: str) -> dict[str, Any]:
    for _ in range(200):
        state = client.get(f"/api/sandbox/{sid}/state").json()
        if state["investigate"]["status"] != "running":
            return state
        time.sleep(0.02)
    raise AssertionError("investigation did not finish")


def test_walk_never_produces_impossible_paths() -> None:
    branches = {group: dict(weights) for group, weights in BRANCHES.items()}
    endings = set()
    for seed in range(2000):
        steps, ending = walk(random.Random(seed), branches)
        names = [s[0] for s in steps]
        endings.add(ending)
        assert names[0] == "project_viewed" and names.count("project_viewed") == 1
        assert "wallet_rejected" not in names  # reject is not instrumented
        if "back_nav" in names:
            assert names == ["project_viewed", "back_nav"]
        if "apply_clicked" in names:
            assert names[1:3] == ["apply_clicked", "wallet_gate_shown"]
        attempts = [s for s in steps if s[0] == "wallet_attempted"]
        assert len(attempts) <= MAX_ATTEMPTS
        for index, (name, _, key, _) in enumerate(steps):
            if name in ("wallet_connected", "wallet_errored"):
                assert steps[index - 1][:3:2] == ("wallet_attempted", key)
            if name == "wallet_errored":
                assert key == "a1"  # the simulated RPC error hits the first attempt only
        if "wallet_connected" in names:
            assert names[-1] == "wallet_connected"
        if "not_now_clicked" in names:
            assert names[-1] == "not_now_clicked" and "wallet_gate_shown" in names
    assert endings == {"back", "not_now", "idle", "connected"}


def test_sandbox_is_its_own_run_and_only_reads_are_public(client: TestClient) -> None:
    judging = client.get("/api/report").json()["run"]["run_id"]
    sid, owner = start(client)
    report = client.get(f"/api/sandbox/{sid}/report").json()
    assert report["run"]["run_id"] == sid and report["run"]["mode"] == "sandbox"
    assert report["run"]["build_verified"] is True  # simulated, and labeled as such
    assert report["run"]["verification"]["wallet_gate_shown"]["test"].startswith("simulated:")
    assert client.get("/api/report").json()["run"]["run_id"] == judging
    assert client.get(f"/api/sandbox/{sid}/journeys").status_code == 200
    # Nothing outside the read list and the owner's controls is forwarded.
    for path in ("events", "lock-v1", "analyze", "approve", "snapshot", "probe-plan"):
        assert client.post(f"/api/sandbox/{sid}/{path}", headers=owner).status_code == 404
    assert client.get("/api/sandbox/sbx-0000000000000000/state").status_code == 404
    assert client.get("/api/sandbox/not-an-id/state").status_code == 404
    # The judging run's operator routes stay closed.
    assert client.post("/api/lock").status_code == 403


def test_controls_require_the_owner_token(client: TestClient) -> None:
    sid, owner = start(client)
    other_sid, other = start(client)
    url = f"/api/sandbox/{sid}/traffic"
    assert client.post(url, json={"n": 1}).status_code == 401
    assert client.post(url, json={"n": 1}, headers=other).status_code == 401
    assert client.post(url, json={"n": 1}, headers=owner).status_code == 200
    assert client.post(f"/api/sandbox/{sid}/lock", json={"source": "prepared"},
                       headers=other).status_code == 401
    assert other_sid != sid


def test_pre_lock_traffic_reaches_segments_without_questions(client: TestClient) -> None:
    sid, owner = start(client)
    result = traffic(client, sid, owner, n=40, seed=7)
    assert result["phase"] == "pre_lock" and result["probes"]["shown"] == 0
    assert sum(result["exits"].values()) == 40 and result["events_dropped"] == 0
    report = client.get(f"/api/sandbox/{sid}/report").json()
    assert report["locked"] is False
    assert report["current"]["sources"]["seed"] == 40  # simulated, never visitors
    assert sum(r["sessions"] for r in report["current"]["cohorts"]) == 40
    assert client.get(f"/api/sandbox/{sid}/state").json()["phase"] == "pre_lock"
    assert client.get(f"/api/sandbox/{sid}/reveal").json() == {"available": False,
                                                               "questions": []}


def test_same_seed_same_traffic(client: TestClient) -> None:
    a, owner_a = start(client)
    b, owner_b = start(client)
    first = traffic(client, a, owner_a, n=50, seed=42, drop_pct=10)
    second = traffic(client, b, owner_b, n=50, seed=42, drop_pct=10)
    for key in ("exits", "events_sent", "events_dropped", "probes"):
        assert first[key] == second[key]


def test_prepared_lock_then_answers_follow_the_mix(client: TestClient, clock: Clock) -> None:
    sid, owner = start(client)
    traffic(client, sid, owner, n=20, seed=1)
    locked = client.post(f"/api/sandbox/{sid}/lock", json={"source": "prepared"},
                         headers=owner)
    assert locked.status_code == 200
    digest = locked.json()["digest"]
    assert len(digest) == 64
    state = client.get(f"/api/sandbox/{sid}/state").json()
    assert state["phase"] == "locked" and state["locked"]["digest"] == digest
    dp1 = next(q for q in state["locked"]["questions"] if q["decision_point"] == "DP1")
    chosen = dp1["options"][0]["id"]
    clock.now += timedelta(minutes=1)
    result = traffic(client, sid, owner, n=100, seed=3, answer_rate=1, skip_rate=0,
                     mix={"DP1": {chosen: 1}},
                     branches={"project": {"back": 0, "apply": 1, "idle": 0},
                               "gate": {"not_now": 1, "connect": 0, "idle": 0}})
    assert result["phase"] == "post_lock"
    assert result["probes"]["shown"] == result["probes"]["answered"] > 0
    clock.now += timedelta(seconds=30)
    reveal = client.get(f"/api/sandbox/{sid}/reveal").json()
    assert reveal["available"] is True
    question = next(q for q in reveal["questions"] if q["decision_point"] == "DP1")
    option = next(o for o in question["options"] if o["id"] == chosen)
    assert option["set_share"] == 1.0
    assert option["counted_answers"] == question["counted"]["respondents"] == \
        result["probes"]["answered"]
    for row in question["hypotheses"]:
        if row["hypothesis_id"] in option["hypothesis_ids"]:
            assert row["selected"] == row["respondents"] == question["counted"]["respondents"]
            assert row["expected_share"] == 1.0
    report = client.get(f"/api/sandbox/{sid}/report").json()
    assert report["current"]["errors"] == []
    assert report["locked"] is True and report["v1"]["digest"] == digest


def test_back_exits_are_checked_by_r2(client: TestClient, clock: Clock) -> None:
    sid, owner = start(client)
    client.post(f"/api/sandbox/{sid}/lock", json={"source": "prepared"}, headers=owner)
    clock.now += timedelta(minutes=1)
    traffic(client, sid, owner, n=30, seed=5,
            branches={"project": {"back": 1, "apply": 0, "idle": 0}})
    report = client.get(f"/api/sandbox/{sid}/report").json()
    results = {d["result"] for d in report["current"]["decisions"]}
    assert "not_observed" in results  # complete windows without a gate event


def test_lost_events_leave_answers_uncounted(client: TestClient, clock: Clock) -> None:
    sid, owner = start(client)
    client.post(f"/api/sandbox/{sid}/lock", json={"source": "prepared"}, headers=owner)
    clock.now += timedelta(minutes=1)
    result = traffic(client, sid, owner, n=100, seed=11, drop_pct=40, answer_rate=1,
                     skip_rate=0,
                     branches={"project": {"back": 0, "apply": 1, "idle": 0},
                               "gate": {"not_now": 1, "connect": 0, "idle": 0}})
    assert result["events_dropped"] > 0
    clock.now += timedelta(seconds=30)
    question = next(q for q in client.get(f"/api/sandbox/{sid}/reveal").json()["questions"]
                    if q["decision_point"] == "DP1")
    assert question["counted"]["not_counted_unknown_coverage"] > 0
    assert question["counted"]["respondents"] < question["generated"]["answered"]
    report = client.get(f"/api/sandbox/{sid}/report").json()
    assert report["current"]["errors"] == []


def test_investigate_calls_the_llm_once_then_hits_the_cache(
    client: TestClient, calls: list[int],
) -> None:
    sid, owner = start(client)
    assert client.post(f"/api/sandbox/{sid}/investigate", headers=owner).status_code == 422
    traffic(client, sid, owner, n=20, seed=9)
    assert client.post(f"/api/sandbox/{sid}/investigate", headers=owner).status_code == 202
    state = wait_for_investigation(client, sid)
    assert state["investigate"]["status"] == "done", state["investigate"]
    assert state["phase"] == "draft_ready" and state["investigate"]["runs_used"] == 1
    assert state["investigate"]["cached"] is False and len(calls) == 1  # Stage B only
    assert {q["decision_point"] for q in state["draft"]["questions"]} == {"DP1", "DP2"}
    left = state["investigate"]["global_runs_left"]
    # The same snapshot in another sandbox costs nothing.
    other, other_owner = start(client)
    traffic(client, other, other_owner, n=20, seed=9)
    client.post(f"/api/sandbox/{other}/investigate", headers=other_owner)
    again = wait_for_investigation(client, other)
    assert again["investigate"]["cached"] is True and again["investigate"]["runs_used"] == 0
    assert again["investigate"]["global_runs_left"] == left and len(calls) == 1
    locked = client.post(f"/api/sandbox/{sid}/lock", json={"source": "ai"}, headers=owner)
    assert locked.status_code == 200 and locked.json()["source"] == "ai"
    state = client.get(f"/api/sandbox/{sid}/state").json()
    assert state["locked"]["source"] == "ai" and state["draft"] is None
    assert client.post(f"/api/sandbox/{sid}/investigate", headers=owner).status_code == 409


def test_ai_lock_needs_a_draft_and_budgets_are_enforced(tmp_path: Path, clock: Clock) -> None:
    settings = Settings(run_id="judging", mode="demo", db_dir=tmp_path,
                        sandbox_root=tmp_path / "sandboxes", dp0_seconds=0, clock=clock,
                        operator_token=None, code_commit="c1", verifications=GATE_VERIFIED)
    hub = SandboxHub(settings, llm_runs=0)
    assert hub.reserve() is False and hub.runs_left() == 0
    with TestClient(create_app(settings)) as client:
        sid, owner = start(client)
        response = client.post(f"/api/sandbox/{sid}/lock", json={"source": "ai"},
                               headers=owner)
        assert response.status_code == 409


def test_limits_and_expiry(client: TestClient, clock: Clock) -> None:
    sid, owner = start(client)
    url = f"/api/sandbox/{sid}/traffic"
    assert client.post(url, json={"n": 101}, headers=owner).status_code == 422
    assert client.post(url, json={"n": 5, "answer_rate": 0.9, "skip_rate": 0.2},
                       headers=owner).status_code == 422
    assert client.post(url, json={"n": 5, "branches": {"gate": {"jump": 1}}},
                       headers=owner).status_code == 422
    for _ in range(3):
        traffic(client, sid, owner, n=100)
    assert client.post(url, json={"n": 1}, headers=owner).status_code == 429
    clock.now += timedelta(hours=4)
    assert client.get(f"/api/sandbox/{sid}/state").status_code == 404


def test_reset_empties_the_sandbox_and_keeps_its_limits(
    client: TestClient, calls: list[int],
) -> None:
    sid, owner = start(client)
    other, other_owner = start(client)
    traffic(client, other, other_owner, n=10, seed=2)
    traffic(client, sid, owner, n=20, seed=9)
    client.post(f"/api/sandbox/{sid}/investigate", headers=owner)
    assert wait_for_investigation(client, sid)["investigate"]["runs_used"] == 1
    client.post(f"/api/sandbox/{sid}/lock", json={"source": "prepared"}, headers=owner)
    traffic(client, sid, owner, n=10, seed=3)
    assert client.get(f"/api/sandbox/{sid}/reveal").json()["available"] is True

    assert client.post(f"/api/sandbox/{sid}/reset").status_code == 401
    assert client.post(f"/api/sandbox/{sid}/reset", headers=other_owner).status_code == 401
    reset = client.post(f"/api/sandbox/{sid}/reset", headers=owner)
    assert reset.status_code == 200 and reset.json()["resets"] == 1
    state = client.get(f"/api/sandbox/{sid}/state").json()
    assert state["phase"] == "pre_lock" and state["sessions_total"] == 0
    assert state["batches"] == [] and state["draft"] is None and state["locked"] is None
    # Removed sessions and used AI runs still count: a reset refills no budget.
    assert state["sessions_used"] == 30 and state["investigate"]["runs_used"] == 1
    report = client.get(f"/api/sandbox/{sid}/report").json()
    assert report["locked"] is False and report["current"]["sessions"] == []
    assert client.get(f"/api/sandbox/{sid}/reveal").json()["available"] is False
    # The same owner keeps control, and the other sandbox is untouched.
    assert traffic(client, sid, owner, n=10, seed=4)["sessions_total"] == 10
    assert client.get(f"/api/sandbox/{other}/state").json()["sessions_total"] == 10
    assert len(client.get(f"/api/sandbox/{other}/report").json()["current"]["sessions"]) == 10


def test_reset_waits_for_a_running_investigation(tmp_path: Path, clock: Clock) -> None:
    import threading

    release = threading.Event()

    def slow() -> LLM:
        script = Script([HYPOTHESES])

        def complete(messages: Any, model: str, thinking: bool) -> Any:
            release.wait(5)
            return script(messages, model, thinking)
        return LLM(cache_path=tmp_path / "cache.sqlite", model="fake", thinking=False,
                   replay=False, complete=complete)

    settings = Settings(run_id="judging", mode="demo", db_dir=tmp_path / "runs",
                        sandbox_root=tmp_path / "runs" / "sandboxes", dp0_seconds=0,
                        clock=clock, operator_token=None, code_commit="c1",
                        verifications=GATE_VERIFIED, target_repo=APP, llm=slow)
    with TestClient(create_app(settings)) as client:
        sid, owner = start(client)
        traffic(client, sid, owner, n=20, seed=9)
        assert client.post(f"/api/sandbox/{sid}/investigate", headers=owner).status_code == 202
        assert client.post(f"/api/sandbox/{sid}/reset", headers=owner).status_code == 409
        release.set()
        assert wait_for_investigation(client, sid)["investigate"]["status"] == "done"
        assert client.post(f"/api/sandbox/{sid}/reset", headers=owner).status_code == 200


def test_failed_reinvestigation_cannot_approve_an_older_draft(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    sid, owner = start(client)
    traffic(client, sid, owner, n=20, seed=9)
    client.post(f"/api/sandbox/{sid}/investigate", headers=owner)
    assert wait_for_investigation(client, sid)["draft"] is not None
    traffic(client, sid, owner, n=10, seed=4)

    def fail(*args: Any, **kwargs: Any) -> Any:
        raise LLMError("Simulated upstream failure")

    monkeypatch.setattr(sandbox_module, "run_stage_b", fail)
    assert client.post(f"/api/sandbox/{sid}/investigate", headers=owner).status_code == 202
    state = wait_for_investigation(client, sid)
    assert state["investigate"]["status"] == "failed"
    assert state["phase"] == "pre_lock" and state["draft"] is None
    assert client.post(f"/api/sandbox/{sid}/lock", json={"source": "ai"},
                       headers=owner).status_code == 409
    assert client.post(f"/api/sandbox/{sid}/lock", json={"source": "prepared"},
                       headers=owner).status_code == 200


def test_legacy_failed_run_with_a_draft_is_not_approvable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    sid, owner = start(client)
    traffic(client, sid, owner, n=20, seed=9)
    client.post(f"/api/sandbox/{sid}/investigate", headers=owner)
    assert wait_for_investigation(client, sid)["draft"] is not None
    original = sandbox_module.Sandbox.state

    def legacy_failed_state(sandbox: sandbox_module.Sandbox) -> Any:
        sandbox.meta["investigate"]["status"] = "failed"
        return original(sandbox)

    monkeypatch.setattr(sandbox_module.Sandbox, "state", legacy_failed_state)
    state = client.get(f"/api/sandbox/{sid}/state").json()
    assert state["draft"] is None and state["phase"] == "pre_lock"
    assert client.post(f"/api/sandbox/{sid}/lock", json={"source": "ai"},
                       headers=owner).status_code == 409


@pytest.mark.parametrize("failure", [False, True])
def test_investigation_closes_llm_cache_on_success_and_failure(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, failure: bool,
) -> None:
    opened: list[sqlite3.Connection] = []
    closed: list[sqlite3.Connection] = []
    original_connect = sqlite3.connect

    class TrackedConnection(sqlite3.Connection):
        def close(self) -> None:
            closed.append(self)
            super().close()

    def connect(database: Any, *args: Any, **kwargs: Any) -> sqlite3.Connection:
        if str(database).endswith("cache.sqlite"):
            kwargs["factory"] = TrackedConnection
        connection: sqlite3.Connection = original_connect(database, *args, **kwargs)
        if isinstance(connection, TrackedConnection):
            opened.append(connection)
        return connection

    monkeypatch.setattr(sqlite3, "connect", connect)
    if failure:
        def fail(*args: Any, **kwargs: Any) -> Any:
            raise LLMError("DEEPSEEK_API_KEY is not set")
        monkeypatch.setattr(sandbox_module, "run_stage_b", fail)
    sid, owner = start(client)
    traffic(client, sid, owner, n=20, seed=9)
    before = client.get(f"/api/sandbox/{sid}/state").json()["investigate"]
    assert client.post(f"/api/sandbox/{sid}/investigate", headers=owner).status_code == 202
    state = wait_for_investigation(client, sid)
    assert len(opened) == 1 and closed == opened
    if failure:
        assert state["investigate"]["status"] == "failed"
        assert state["investigate"]["runs_used"] == 0
        assert state["investigate"]["global_runs_left"] == before["global_runs_left"]
    else:
        assert state["investigate"]["status"] == "done"


def test_full_sandbox_loop_and_restart_preserve_the_locked_run(
    tmp_path: Path, clock: Clock,
) -> None:
    workflow = workflow_view("app", load_investigation(INVESTIGATION))
    script = Script([template_spec(workflow).model_dump(mode="json"), HYPOTHESES])
    config = Settings(
        run_id="judging", mode="demo", db_dir=tmp_path / "runs",
        sandbox_root=tmp_path / "sandboxes", fixture=INVESTIGATION, dp0_seconds=0,
        clock=clock, target_repo=APP, narrative="template",
        llm=lambda: LLM(cache_path=tmp_path / "cache.sqlite", complete=script),
    )
    with TestClient(create_app(config)) as client:
        sid, owner = start(client)
        prefix = f"/api/sandbox/{sid}"
        traffic(client, sid, owner, n=20, seed=9)
        assert client.post(f"{prefix}/journeys/generate", headers=owner).status_code == 202
        for _ in range(200):
            journeys = client.get(f"{prefix}/journeys/spec").json()
            if journeys["status"] != "running":
                break
            time.sleep(0.02)
        assert journeys["draft"] and journeys["validation"] == []
        approved = client.post(f"{prefix}/journeys/approve", headers=owner, json={
            "digest": journeys["draft"]["digest"], "approved_by": "Sandbox owner"})
        assert approved.status_code == 200
        assert client.post(f"{prefix}/investigate", headers=owner).status_code == 202
        assert wait_for_investigation(client, sid)["draft"] is not None
        locked = client.post(f"{prefix}/lock", json={"source": "ai"}, headers=owner)
        assert locked.status_code == 200
        lock_digest = locked.json()["digest"]
        clock.now += timedelta(minutes=1)
        result = traffic(client, sid, owner, n=30, seed=3, answer_rate=1, skip_rate=0,
                         branches={"project": {"back": 0, "apply": 1, "idle": 0},
                                   "gate": {"not_now": 1, "connect": 0, "idle": 0}})
        clock.now += timedelta(seconds=30)
        reveal = client.get(f"{prefix}/reveal").json()
        dp1 = next(q for q in reveal["questions"] if q["decision_point"] == "DP1")
        assert reveal["available"] and reveal["journeys"]
        assert dp1["counted"]["respondents"] == result["probes"]["answered"] == 30
        report = client.get(f"{prefix}/report").json()
        assert report["v1"]["digest"] == lock_digest and report["current"]["errors"] == []
        assert report["current"]["sources"]["seed"] == 50
        assert report["current"]["sources"]["visitor"] == 0
        assert client.get("/api/report").json()["current"]["sessions"] == []
        assert client.get(f"{prefix}/state").json()["investigate"]["runs_used"] == 2
    with TestClient(create_app(config)) as client:
        state = client.get(f"{prefix}/state").json()
        assert state["phase"] == "locked" and state["locked"]["digest"] == lock_digest
        assert state["journeys"]["approved_digest"] == approved.json()["digest"]
        assert state["investigate"]["runs_used"] == 2
        assert client.get(f"{prefix}/reveal").json() == reveal
        assert client.get(f"{prefix}/report").json()["current"] == report["current"]
        assert traffic(client, sid, owner, n=1, seed=8)["sessions_total"] == 51
    assert len(script.sent) == 2
