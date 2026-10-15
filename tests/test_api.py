"""Walking skeleton: events → lock → plan → exposure → response → report (k of n)."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from engine.api import Settings, create_app
from engine.models import Verification

T0 = datetime(2026, 10, 16, 3, 0, tzinfo=UTC)
GATE_VERIFIED = (Verification(event="wallet_gate_shown", test="gate test", commit="c1",
                              passed_at=T0 - timedelta(hours=1)),)
VERIFIED = {"code_commit": "c1", "verifications": GATE_VERIFIED}


class Clock:
    def __init__(self) -> None:
        self.now = T0

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def client(tmp_path: Path, clock: Clock) -> Iterator[TestClient]:
    settings = Settings(run_id="test", mode="seed", db_dir=tmp_path, **VERIFIED,
                        dp0_seconds=0, clock=clock)
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def event(
    session: str, seq: int, name: str, page: str, attempt: str | None = None,
) -> dict[str, Any]:
    occurred = T0 - timedelta(minutes=5) + timedelta(seconds=seq)
    return {
        "event_id": f"{session}-{seq}", "session_id": session, "seq": seq, "attempt_id": attempt,
        "event": name, "occurred_at": occurred.isoformat(),
        "page": page, "schema_version": 1, "props": {"project_id": "p1", "page": page},
    }


def gate_then_not_now(session: str) -> list[dict[str, Any]]:
    return [
        event(session, 1, "project_viewed", "ProjectPage"),
        event(session, 2, "apply_clicked", "ProjectPage"),
        event(session, 3, "wallet_gate_shown", "ApplyModal"),
        event(session, 4, "not_now_clicked", "ApplyModal"),
    ]


def answer(client: TestClient, session: str, plan: dict[str, Any], options: list[str]) -> None:
    exposure_id = f"x-{session}"
    shown = [o["id"] for o in plan["options"]]
    beacon = {
        "exposure_id": exposure_id, "plan_id": plan["plan_id"], "session_id": session,
        "shown_at": T0.isoformat(), "client_cohort_at_shown": plan["target_cohort"],
        "event_seq_at_shown": 4, "options_shown": shown,
    }
    assert client.post("/api/probe/exposure", json=beacon).json() == {"status": "recorded"}
    body = {"exposure_id": exposure_id, "responded_at": (T0 + timedelta(seconds=5)).isoformat()}
    body |= {"option_ids": options} if options else {"skipped": True}
    assert client.post("/api/probe/response", json=body).json() == {"status": "recorded"}


def test_ingest_dedupes_and_rejects_addresses(client: TestClient) -> None:
    batch = gate_then_not_now("s1")
    assert client.post("/api/events", json={"events": batch}).json()["accepted"] == 4
    leaked = event("s2", 1, "project_viewed", "ProjectPage")
    leaked["props"]["project_id"] = "0x" + "ab" * 20
    result = client.post("/api/events", json={"events": [*batch, leaked]}).json()
    assert result["accepted"] == 0 and result["duplicates"] == 4
    assert [r["event_id"] for r in result["rejected"]] == ["s2-1"]


def test_beacon_body_without_json_content_type(client: TestClient) -> None:
    import json

    body = json.dumps({"events": gate_then_not_now("s1")})
    response = client.post("/api/events", content=body, headers={"Content-Type": "text/plain"})
    assert response.json()["accepted"] == 4


def test_plan_is_served_only_after_lock(client: TestClient) -> None:
    assert client.get("/api/probe-plan", params={"session_id": "s1"}).json() is None
    digest = client.post("/api/lock").json()["digest"]
    assert len(digest) == 64
    assert client.post("/api/lock").json()["digest"] == digest
    plan = client.get("/api/probe-plan", params={"session_id": "s1"}).json()
    assert plan["decision_point"] == "DP1" and plan["target_cohort"] == "gate_event_no_attempt"
    assert any(o["label"] == "Not sure who is asking" for o in plan["options"])
    dp2 = client.get("/api/probe-plan", params={"session_id": "s1", "decision_point": "DP2"}).json()
    assert dp2["decision_point"] == "DP2" and dp2["target_cohort"] == "no_gate_event"


def test_full_loop_reports_k_of_n(client: TestClient, clock: Clock) -> None:
    sessions = ["s1", "s2", "s3", "s4"]
    for session in sessions:
        client.post("/api/events", json={"events": gate_then_not_now(session)})
    digest = client.post("/api/lock").json()["digest"]
    plan = client.get("/api/probe-plan", params={"session_id": "s1"}).json()
    answer(client, "s1", plan, ["unaware"])
    answer(client, "s2", plan, ["unaware", "permission"])
    answer(client, "s3", plan, ["browse"])
    answer(client, "s4", plan, [])  # skip
    clock.now = T0 + timedelta(minutes=1)
    report = client.get("/api/report").json()
    assert report["locked"] and report["v1"]["digest"] == digest
    current = report["current"]
    assert current["errors"] == []
    assert current["funnel"] == {"visitors": 4, "apply_clicked": 4, "attempted": 0, "connected": 0}
    findings = {f["hypothesis_id"]: f for f in current["findings"]
                if f["decision_point"] == "DP1"}
    assert findings["H1"]["text"] == "2 of 3 respondents"
    assert findings["H1"]["self_report"] == "Selected by ≥ 50%"
    assert findings["H2"]["self_report"] == "Selected"
    dp1 = next(p for p in current["probes"] if p["decision_point"] == "DP1")
    assert dp1["counts"]["shown"] == 4 and dp1["counts"]["skipped"] == 1
    v2 = client.post("/api/snapshot", json={"v1_digest": digest})
    assert v2.status_code == 200 and v2.json()["version"] == 2
    assert client.post("/api/snapshot", json={"v1_digest": "0" * 64}).status_code == 409


def test_lost_beacon_is_inferred_from_response(client: TestClient) -> None:
    client.post("/api/events", json={"events": gate_then_not_now("s1")})
    client.post("/api/lock")
    plan = client.get("/api/probe-plan", params={"session_id": "s1"}).json()
    body = {
        "exposure_id": "x-lost", "option_ids": ["unaware"], "responded_at": T0.isoformat(),
        "plan_id": plan["plan_id"], "session_id": "s1", "shown_at": T0.isoformat(),
        "event_seq_at_shown": 4, "options_shown": [o["id"] for o in plan["options"]],
    }
    assert client.post("/api/probe/response", json=body).json()["status"] == "recorded_inferred"
    counts = next(p for p in client.get("/api/report").json()["current"]["probes"]
                  if p["decision_point"] == "DP1")["counts"]
    assert counts["inferred_from_response"] == 1 and counts["answered"] == 1


def test_dp0_evaluates_once_per_data_version(client: TestClient) -> None:
    client.post("/api/events", json={"events": [
        event("s9", 1, "project_viewed", "ProjectPage"),
        event("s9", 2, "back_nav", "ProjectPage"),
    ]})
    first = client.post("/api/dp0").json()["decisions"]
    assert first[0]["result"] == "not_observed" and first[0]["rule_ids"] == ["R2"]
    assert first[0]["contradicted_hypotheses"] == ["H2"]
    assert client.post("/api/dp0").json()["decisions"] == []


def test_analyze_then_approve_replaces_fixture(tmp_path: Path, clock: Clock) -> None:
    from engine.llm import LLM
    from tests.test_stages import APPLY, HYPOTHESES, WALLET, WORKFLOW, Script

    repo = tmp_path / "repo"
    (repo / "src").mkdir(parents=True)
    (repo / "src" / "ApplyModal.tsx").write_text(APPLY)
    (repo / "src" / "wallet.ts").write_text(WALLET)

    def fake() -> LLM:
        return LLM(cache_path=tmp_path / "cache.sqlite", model="fake", thinking=False,
                   replay=False, complete=Script([WORKFLOW, HYPOTHESES]))

    settings = Settings(run_id="t", mode="seed", db_dir=tmp_path, **VERIFIED,
                        dp0_seconds=0, clock=clock, target_repo=repo, llm=fake)
    with TestClient(create_app(settings)) as client:
        assert client.post("/api/approve", json={"approved_by": "m"}).status_code == 404
        draft = client.post("/api/analyze").json()
        assert draft["rejected"]["stage_a_invalid_ref"] == ["made_up"]
        approved = client.post("/api/approve", json={"approved_by": "mentor"}).json()
        assert approved["class_mappings"] == 3
        client.post("/api/lock")
        plan = client.get("/api/probe-plan", params={"session_id": "s1"}).json()
        assert plan["question_version"] == approved["questions"][0]
        assert client.post("/api/analyze").status_code == 409
        assert client.post("/api/approve", json={"approved_by": "m"}).status_code == 409
    with TestClient(create_app(settings)) as client:  # survives a restart
        report = client.get("/api/report").json()
        assert report["workflow"]["version"] == draft["workflow"]["version"]


def test_verification_must_match_the_run_commit(tmp_path: Path, clock: Clock) -> None:
    stale = Settings(run_id="stale", mode="seed", db_dir=tmp_path, dp0_seconds=0, clock=clock,
                     code_commit="c2", verifications=GATE_VERIFIED)
    with TestClient(create_app(stale)) as client:
        client.post("/api/events", json={"events": gate_then_not_now("s1")})
        session = client.get("/api/report").json()["current"]["sessions"][0]
        assert session["coverage"] == "unknown"
        assert "unverified_build" in session["coverage_reasons"]
        run = client.get("/api/health").json()["run"]
        assert run["build_verified"] is False
        assert run["verification"]["wallet_gate_shown"] == {
            "verified": False, "commit": None, "test": None, "passed_at": None}


def test_ingest_maps_event_names_from_config(tmp_path: Path, clock: Clock) -> None:
    from engine.config import TargetConfig

    config = TargetConfig(events={"Wallet Gate Shown": "wallet_gate_shown"})
    settings = Settings(run_id="m", mode="seed", db_dir=tmp_path, dp0_seconds=0, clock=clock,
                        config=config, **VERIFIED)
    with TestClient(create_app(settings)) as client:
        batch = gate_then_not_now("s1")
        batch[2]["event"] = "Wallet Gate Shown"
        batch[3]["event"] = "Some Other Click"
        result = client.post("/api/events", json={"events": batch}).json()
        assert result["accepted"] == 3
        assert "unmapped event 'Some Other Click'" in result["rejected"][0]["reason"]
        session = client.get("/api/report").json()["current"]["sessions"][0]
        assert session["cohort"] == "gate_event_no_attempt"


def test_repo_config_loads() -> None:
    from engine.config import load_config

    config = load_config(Path(__file__).resolve().parent.parent / "ghostreport.yaml")
    assert config.repo.path.name == "app" and config.repo.path.is_dir()
    assert config.canonical_event("Wallet Gate Shown") == "wallet_gate_shown"
    assert config.canonical_event("wallet_gate_shown") == "wallet_gate_shown"
    assert config.canonical_event("nope") is None


def test_locked_probes_are_served_from_v1_not_the_file(tmp_path: Path, clock: Clock) -> None:
    import json
    import shutil

    from engine.investigation import DEFAULT_FIXTURE

    fixture = tmp_path / "investigation.json"
    shutil.copy(DEFAULT_FIXTURE, fixture)
    settings = Settings(run_id="t", mode="seed", db_dir=tmp_path, dp0_seconds=0, clock=clock,
                        fixture=fixture, **VERIFIED)
    with TestClient(create_app(settings)) as client:
        client.post("/api/lock")
        stem = client.get("/api/probe-plan", params={"session_id": "s1"}).json()["stem"]
    raw = json.loads(fixture.read_text())
    raw["questions"][0]["options"][0]["label"] = "Edited after the lock"
    fixture.write_text(json.dumps(raw))
    with TestClient(create_app(settings)) as client:
        plan = client.get("/api/probe-plan", params={"session_id": "s1"}).json()
        assert plan["stem"] == stem
        assert "Edited after the lock" not in [o["label"] for o in plan["options"]]


def test_live_run_closes_collection_after_lock(tmp_path: Path, clock: Clock) -> None:
    settings = Settings(run_id="live", mode="live", db_dir=tmp_path, dp0_seconds=0, clock=clock,
                        collection_minutes=12, operator_token="op", **VERIFIED)
    with TestClient(create_app(settings)) as client:
        assert client.post("/api/lock").status_code == 401
        client.post("/api/lock", headers={"Authorization": "Bearer op"})
        plan = client.get("/api/probe-plan", params={"session_id": "s1"}).json()
        assert plan["ends_at"] == (T0 + timedelta(minutes=12)).isoformat()
        clock.now = T0 + timedelta(minutes=13)
        assert client.get("/api/probe-plan", params={"session_id": "s1"}).json() is None


def test_public_runs_disable_operator_routes_without_a_token(tmp_path: Path) -> None:
    settings = Settings(run_id="pub", mode="demo", db_dir=tmp_path, dp0_seconds=0,
                        operator_token=None, **VERIFIED)
    with TestClient(create_app(settings)) as client:
        for route in ("/api/lock", "/api/analyze", "/api/snapshot", "/api/approve"):
            assert client.post(route, json={}).status_code == 403, route
        assert client.get("/api/report").status_code == 200


def test_static_frontends_share_one_origin(tmp_path: Path) -> None:
    for folder, text in (("landing", "landing"), ("app", "wallet app"), ("console", "report")):
        (tmp_path / "static" / folder).mkdir(parents=True)
        (tmp_path / "static" / folder / "index.html").write_text(f"<p>{text}</p>")
    settings = Settings(run_id="s", mode="seed", db_dir=tmp_path, dp0_seconds=0,
                        static_dir=tmp_path / "static", **VERIFIED)
    with TestClient(create_app(settings)) as client:
        assert "landing" in client.get("/").text
        assert "wallet app" in client.get("/app/").text
        assert "report" in client.get("/report/").text
        assert client.get("/report", follow_redirects=False).headers["location"] == "/report/"
        assert "wallet app" in client.get("/app").text
        assert client.get("/api/health").json()["ok"] is True


def test_after_retry_counts_unsuccessful_earlier_attempts(tmp_path: Path, clock: Clock) -> None:
    settings = Settings(run_id="r", mode="seed", db_dir=tmp_path, dp0_seconds=0, clock=clock,
                        **VERIFIED)
    events = [
        event("s1", 1, "project_viewed", "ProjectPage"),
        event("s1", 2, "apply_clicked", "ProjectPage"),
        event("s1", 3, "wallet_gate_shown", "ApplyModal"),
        event("s1", 4, "wallet_attempted", "ApplyModal", "a1"),  # rejected: no outcome event
        event("s1", 5, "wallet_attempted", "ApplyModal", "a2"),
        event("s1", 6, "wallet_connected", "MockWalletPopup", "a2"),
    ]
    with TestClient(create_app(settings)) as client:
        client.post("/api/events", json={"events": events})
        session = client.get("/api/report").json()["current"]["sessions"][0]
        assert session["cohort"] == "connected"
        assert session["attempt_states"] == ["no_outcome_observed", "connected"]
        assert session["after_retry"] is True


def test_seeded_demo_run_reports_and_is_idempotent(tmp_path: Path) -> None:
    from engine.demo import INVESTIGATION

    settings = Settings(run_id="judging", mode="seed", db_dir=tmp_path, dp0_seconds=0,
                        fixture=INVESTIGATION, autolock=True, seed=True, **VERIFIED)
    with TestClient(create_app(settings)) as client:
        report = client.get("/api/report").json()
        current = report["current"]
        assert report["locked"] and current["seeded_sessions"] == 20
        assert current["errors"] == []
        assert current["funnel"]["visitors"] == 20 and current["funnel"]["connected"] == 4
        dp1 = next(p for p in current["probes"] if p["decision_point"] == "DP1")["counts"]
        assert (dp1["shown"], dp1["answered"], dp1["skipped"]) == (7, 6, 1)
        assert any(f["respondents"] >= 3 for f in current["findings"])
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/report").json()["current"]["seeded_sessions"] == 20
