"""Walking skeleton: events → lock → plan → exposure → response → report (k of n)."""

import json
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
    assert findings["H1"]["text"] == "2 of 3 respondents (visitors 2 of 3)"
    assert current["population"] == "seed 0 + visitors 4"
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
        # Simulated answers are never counted as visitors.
        assert current["population"] == "seed 20 + visitors 0"
        assert all(set(f["by_source"]) <= {"seed"} for f in current["findings"])
        assert all("visitors" not in f["text"] for f in current["findings"])
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/report").json()["current"]["seeded_sessions"] == 20


def test_redeploy_on_a_new_commit_keeps_the_run(tmp_path: Path, clock: Clock) -> None:
    first = Settings(run_id="judging", mode="demo", db_dir=tmp_path, dp0_seconds=0, clock=clock,
                     autolock=True, **VERIFIED)
    with TestClient(create_app(first)) as client:
        client.post("/api/events", json={"events": gate_then_not_now("s1")})
        digest = client.get("/api/report").json()["v1"]["digest"]
    redeploy = Settings(run_id="judging", mode="demo", db_dir=tmp_path, dp0_seconds=0,
                        clock=clock, autolock=True, code_commit="c2", verifications=())
    with TestClient(create_app(redeploy)) as client:
        report = client.get("/api/report").json()
        assert report["v1"]["digest"] == digest
        assert [b["code_commit"] for b in report["builds"]] == ["c1", "c2"]
        assert report["run"]["build_verified"] is False
        assert report["current"]["funnel"]["visitors"] == 1
    other = Settings(run_id="judging", mode="live", db_dir=tmp_path, dp0_seconds=0, **VERIFIED)
    with pytest.raises(ValueError, match="another run"), TestClient(create_app(other)):
        pass


def test_partb_serves_the_reviewed_code_only_run(client: TestClient) -> None:
    body = client.get("/api/partb").json()
    assert body["mode"] == "code_only" and "hypotheses" not in body
    assert body["ref_check"] == {**body["ref_check"], "checked": 22, "correct": 19,
                                 "wrong": 2, "partial": 1}
    assert [g["rule_id"] for g in body["cannot_check"]] == ["R2"]
    gate = body["finding"]["refs"][0]["permalink"]
    assert gate.startswith("https://github.com/ensdomains/ens-app-v3/blob/3c10925f")
    assert gate.endswith("Pricing/Pricing.tsx#L185") and "%5Bname%5D" in gate
    assert len(body["flow_map"]) == 22 and body["scope"]["searched_files"] == 16


def test_session_source_never_counts_simulated_sessions_as_visitors() -> None:
    from engine.report import population
    from engine.seed import session_source

    assert [session_source(s) for s in ("seed-01", "e2e-dp1-x", "a1b2")] == [
        "seed", "test", "visitor"]
    assert population({"seed": 20, "test": 0, "visitor": 3}) == "seed 20 + visitors 3"
    assert population({"seed": 20, "test": 2, "visitor": 3}) == "seed 20 + test 2 + visitors 3"


def test_seed_session_view_serves_only_simulated_sessions(tmp_path: Path) -> None:
    from engine.demo import INVESTIGATION

    settings = Settings(run_id="judging", mode="seed", db_dir=tmp_path, dp0_seconds=0,
                        fixture=INVESTIGATION, autolock=True, seed=True, **VERIFIED)
    with TestClient(create_app(settings)) as client:
        body = client.get("/api/seed-sessions/seed-07").json()
        assert body["source"] == "seed" and body["cohort"] == "gate_event_no_attempt"
        assert [e["seq"] for e in body["events"]] == [1, 2, 3, 4]
        assert body["probe"]["decision_point"] == "DP1"
        assert body["probe"]["status"] == "answered" and body["probe"]["selected"]
        assert client.get("/api/seed-sessions/a-visitor").status_code == 404
        assert client.get("/api/seed-sessions/seed-99").status_code == 404


def test_report_narrative_is_written_once_per_data_change_and_checked(tmp_path: Path) -> None:
    from engine.demo import INVESTIGATION
    from engine.llm import LLM
    from tests.test_stages import Script

    calls = Script([{"paragraph": "Population: seed 20 + visitors 0 sessions, all of them "
                                  "simulated users (seed). Nothing else is claimed here."}])
    settings = Settings(run_id="judging", mode="seed", db_dir=tmp_path, dp0_seconds=0,
                        fixture=INVESTIGATION, autolock=True, seed=True, narrative="llm",
                        narrative_interval=0, **VERIFIED,
                        llm=lambda: LLM(cache_path=tmp_path / "llm.sqlite", complete=calls))
    with TestClient(create_app(settings)) as client:
        first = client.get("/api/report").json()["narrative"]
        assert first["source"] == "template" and first["pending"]
        assert "seed 20 + visitors 0" in first["text"]
        for _ in range(50):
            done = client.get("/api/report").json()["narrative"]
            if done["source"] == "llm":
                break
        assert done["source"] == "llm" and done["facts_sha256"] == first["facts_sha256"]
        assert len(calls.sent) == 1  # one write per facts digest, not per request


def test_workflow_map_serves_nodes_without_layout(client: TestClient) -> None:
    ens = client.get("/api/workflow?target=ens").json()
    assert ens["mode"] == "code_only" and ens["permalinks"] is None
    assert len(ens["nodes"]) == 22 and "edges" not in ens
    gate = next(n for n in ens["nodes"] if n["id"] == "pricing_step_gate")
    assert gate["permalink"].endswith("Pricing.tsx#L184-L185") and gate["quote"]
    assert gate["ref_check"] == "correct"
    app = client.get("/api/workflow").json()
    assert app["target"] == "app" and {n["kind"] for n in app["nodes"]} <= {
        "state", "outcome", "ui_fact"}
    assert client.get("/api/workflow?target=other").status_code == 422


def test_journeys_map_every_session_to_one_segment_left_to_right(tmp_path: Path) -> None:
    from engine.demo import INVESTIGATION

    settings = Settings(run_id="judging", mode="seed", db_dir=tmp_path, dp0_seconds=0,
                        fixture=INVESTIGATION, autolock=True, seed=True, **VERIFIED)
    with TestClient(create_app(settings)) as client:
        graph = client.get("/api/journeys").json()
        report = client.get("/api/report").json()["current"]
        nodes = {n["id"]: n for n in graph["nodes"]}
        assert graph["direction"] == "LR" and graph["sessions"] == 20
        # Segments partition the sessions and agree with the report's cohorts.
        assert sum(s["sessions"] for s in graph["segments"]) == 20
        cohorts = {row["cohort"]: row["sessions"] for row in report["cohorts"]}
        segments = {s["segment"]: s for s in graph["segments"]}
        assert [s["segment"] for s in graph["segments"]] == [
            "browsers", "stalled_at_wallet", "connected"]
        for segment in segments.values():
            assert segment["sessions"] == sum(cohorts.get(c, 0) for c in segment["cohorts"])
            assert sum(p["sessions"] for p in segment["top_paths"]) <= segment["sessions"]
        assert segments["browsers"]["sessions"] == 8
        assert segments["stalled_at_wallet"]["cohorts"] == {
            "gate_event_no_attempt": 7, "attempted_no_success": 1}
        assert segments["connected"]["top_paths"][0]["sessions"] == 3
        # Edges only go left to right, and flow is conserved at every inner node.
        for edge in graph["edges"]:
            assert nodes[edge["source"]]["column"] < nodes[edge["target"]]["column"]
        for node in graph["nodes"]:
            into = sum(e["count"] for e in graph["edges"] if e["target"] == node["id"])
            assert node["column"] == 0 or into == node["count"]
        assert nodes["c4:errored"]["count"] == 1 and nodes["c5:retry_connected"]["count"] == 1
        assert nodes["c8:answered"]["count"] == 10  # 6 at DP1 + 4 at DP2
        # Cohort paths list recorded events only; a missing result is a separate note.
        rows = {row["cohort"]: row for row in graph["cohorts"]}
        assert {c: row["sessions"] for c, row in rows.items() if row["sessions"]} == cohorts
        events = {"project_viewed", "apply_clicked", "wallet_gate_shown", "wallet_attempted",
                  "wallet_connected", "wallet_errored", "wallet_rejected",
                  "not_now_clicked", "back_nav"}
        for row in rows.values():
            assert sum(p["sessions"] for p in row["top_paths"]) <= row["sessions"]
            for step in (step for p in row["top_paths"] for step in p["steps"]):
                assert step.get("event") in events or step.get("note") in {
                    "no_outcome_observed", "pending"}
        stalled = [p["steps"] for p in rows["attempted_no_success"]["top_paths"]]
        notes = [i for steps in stalled for i, step in enumerate(steps) if "note" in step]
        assert notes and all(steps[i - 1] == {"event": "wallet_attempted"}
                             for steps in stalled for i, step in enumerate(steps)
                             if "note" in step)
        assert sum(sum(v.values()) for row in rows.values() for v in row["probes"].values()) \
            == sum(n["count"] for n in graph["nodes"] if n["column"] == 8)
        assert "seed-" not in str(graph)  # counts only, never session IDs
        assert client.get("/api/journeys?source=visitor").json()["sessions"] == 0
        own = client.get("/api/journeys/session/seed-14").json()
        assert own["segment"] == "connected" and own["nodes"][0] == "c0:viewed"
        assert all(n in nodes for n in own["nodes"])
        assert client.get("/api/journeys/session/nobody").status_code == 404
        chart = client.get("/api/journeys?format=mermaid").text
        assert chart.startswith("flowchart LR") and "c7_stalled_at_wallet" in chart


def test_evidence_map_links_each_hypothesis_to_its_own_evidence(tmp_path: Path) -> None:
    from engine.demo import INVESTIGATION

    settings = Settings(run_id="judging", mode="seed", db_dir=tmp_path, dp0_seconds=0,
                        fixture=INVESTIGATION, autolock=True, seed=True, **VERIFIED)
    with TestClient(create_app(settings)) as client:
        graph = client.get("/api/evidence").json()
        findings = client.get("/api/report").json()["current"]["findings"]
    nodes = {n["id"]: n for n in graph["nodes"]}
    for edge in graph["edges"]:
        assert nodes[edge["source"]]["column"] < nodes[edge["target"]]["column"]
    assert "cause" not in str(graph).lower().replace("neither establishes a cause", "")
    for finding in findings:
        node = nodes.get(f"f:{finding['decision_point']}:{finding['hypothesis_id']}")
        if node is None:  # hypothesis had no option at that point
            assert finding["respondents"] == 0 or finding["selected"] == 0
            continue
        assert (node["selected"], node["respondents"]) == (
            finding["selected"], finding["respondents"])
    for node in (n for n in nodes.values() if n["kind"] == "finding"):
        options = [e for e in graph["edges"]
                   if e["target"] == node["id"] and e["relation"] == "counted in"]
        assert options, f"{node['id']} has no answer option behind it"
    for hid, linked in graph["highlight"].items():
        assert hid in linked
        assert all(not n.startswith("h:") or n == hid for n in linked)
        assert all(n.endswith(f":{hid[2:]}") for n in linked if n.startswith("f:"))
    r2 = [h for h, linked in graph["highlight"].items() if "rule:R2" in linked]
    assert r2 and all(nodes[h]["approved_class"] == "HC-gate-permission" for h in r2)


def test_narrative_retries_after_an_llm_outage(tmp_path: Path) -> None:
    from engine.demo import INVESTIGATION
    from engine.llm import LLM

    replies: list[Any] = [RuntimeError("Connection error."),
                          {"paragraph": "Population: seed 20 + visitors 0 sessions, all "
                                        "simulated users (seed). Nothing else is claimed."}]

    def complete(messages: Any, model: str, thinking: bool) -> tuple[str, dict[str, int]]:
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return json.dumps(reply), {"prompt_tokens": 1, "completion_tokens": 1}

    settings = Settings(run_id="judging", mode="seed", db_dir=tmp_path, dp0_seconds=0,
                        fixture=INVESTIGATION, autolock=True, seed=True, narrative="llm",
                        narrative_interval=0, **VERIFIED,
                        llm=lambda: LLM(cache_path=tmp_path / "llm.sqlite", complete=complete))
    with TestClient(create_app(settings)) as client:
        for _ in range(100):
            narrative = client.get("/api/report").json()["narrative"]
            if narrative["source"] == "llm":
                break
        assert narrative["source"] == "llm" and replies == []
