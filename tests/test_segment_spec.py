"""Journey definitions cannot change template counts or turn missing data into intent."""

import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from engine.api import Settings, create_app
from engine.cohorts import build_cohorts
from engine.demo import INVESTIGATION
from engine.investigation import load_investigation
from engine.journey_api import vocabulary
from engine.llm import LLM
from engine.models import Event, Verification
from engine.segment_spec import (
    Column,
    Predicate,
    SegmentSpec,
    aggregate_context,
    assignment,
    comparison,
    digest,
    generate,
    matches,
    template_spec,
    validate,
)
from engine.workflow_view import workflow_view

NOW = datetime(2026, 10, 16, 3, tzinfo=UTC)
WORKFLOW = workflow_view("app", load_investigation(INVESTIGATION))
TEMPLATE = template_spec(WORKFLOW)


def test_template_matches_seed_cohorts_and_segment_totals(tmp_path: Path) -> None:
    settings = Settings(run_id="anchor", mode="seed", db_dir=tmp_path, fixture=INVESTIGATION,
                        autolock=True, seed=True, narrative="template", dp0_seconds=0,
                        clock=lambda: NOW)
    app = create_app(settings)
    with TestClient(app) as client:
        ghost = app.state.ghost
        assert client.portal is not None
        events = client.portal.call(lambda: ghost.store().events())
        stats = build_cohorts(events, NOW, build_verified=ghost.store().run.build_verified)
        workflow = workflow_view("app", ghost.inv())
        spec = template_spec(workflow)
        assert validate(spec, workflow, vocabulary(workflow)) == []
        for session in stats:
            names = [e.event for e in sorted(events, key=lambda e: e.seq)
                     if e.session_id == session.session_id]
            rule, _ = assignment(spec, names, session.coverage == "complete")
            assert rule == session.cohort
        report = client.get("/api/report").json()
        value = comparison(spec, workflow, events, stats)
        graph = client.get("/api/journeys").json()
        expected = {s["id"].split(":", 1)[-1]: s["sessions"] for s in graph["segments"]}
        assert {s["id"]: s["sessions"] for s in value["segments"]
                if s["id"] != "unknown_coverage"} == expected
        assert sum(s["sessions"] for s in value["segments"]) == len(report["current"]["sessions"])


@pytest.mark.parametrize("edit", ["intent", "event", "evidence", "quote", "catchall", "number"])
def test_validator_rejects_unsupported_definitions(edit: str) -> None:
    data = TEMPLATE.model_dump(mode="json")
    if edit == "intent":
        data["segments"][0]["label"] = "Curious browsers"
    elif edit == "event":
        data["rules"][0]["predicate"]["events"] = ["invented_event"]
    elif edit == "evidence":
        data["rules"][0]["evidence"][0]["node_id"] = "invented_node"
    elif edit == "quote":
        data["rules"][0]["evidence"][0]["quote"] = "Not the code"
    elif edit == "number":
        data["rules"][0]["label"] = "Twenty sessions"
        data["rules"][0]["label"] += " 20"
    else:
        data["rules"] = data["rules"][:-1]
    assert validate(SegmentSpec.model_validate(data), WORKFLOW, vocabulary(WORKFLOW))


def test_absence_with_unknown_coverage_is_not_a_fact() -> None:
    assert matches(Predicate(op="lacks", events=("wallet_attempted",)), [], False) is None
    assert matches(Predicate(op="lacks", events=("wallet_attempted",)),
                   ["wallet_attempted"], False) is False
    rule = TEMPLATE.rules[0].model_copy(update={
        "predicate": Predicate(op="lacks", events=("wallet_connected",))})
    spec = TEMPLATE.model_copy(update={"rules": (rule, *TEMPLATE.rules[1:])})
    assert assignment(spec, ["project_viewed"], False) == ("unknown_coverage", "unknown_coverage")
    assert assignment(spec, ["project_viewed"], True)[0] == rule.id
    assert matches(Predicate(op="has_after", events=("apply_clicked", "project_viewed")),
                   ["project_viewed", "apply_clicked"], False)
    assert not matches(Predicate(op="has_after", events=("apply_clicked", "project_viewed")),
                       ["apply_clicked", "project_viewed"], True)


def test_model_context_contains_aggregates_only() -> None:
    event = Event.model_validate({"event_id": "private-event", "session_id": "private-session",
                                 "event": "project_viewed", "page": "ProjectPage", "seq": 1,
                                 "occurred_at": NOW, "received_at": NOW, "schema_version": 1})
    stats = build_cohorts([event], NOW, build_verified=False)
    value = aggregate_context([event], stats)
    assert "private" not in json.dumps(value)
    assert value["sessions"] == 1


def test_generation_repairs_once_and_withholds_invalid_output(tmp_path: Path) -> None:
    invalid = TEMPLATE.model_dump(mode="json")
    invalid["rules"][0]["label"] = "Curious"
    scripts = [invalid, TEMPLATE.model_dump(mode="json")]
    sent: list[Any] = []

    def complete(messages: Any, model: str, thinking: bool) -> Any:
        sent.append(messages)
        return json.dumps(scripts.pop(0)), {}

    llm = LLM(cache_path=tmp_path / "cache.sqlite", complete=complete)
    context = {"workflow": WORKFLOW, "event_vocabulary": vocabulary(WORKFLOW)}
    result = generate(llm, context)
    assert result["draft"] and result["validation"] == [] and len(sent) == 2
    assert "Repair these" in sent[1][-1]["content"]
    llm.db.close()


def wait(client: TestClient, path: str) -> dict[str, Any]:
    for _ in range(150):
        view = client.get(path).json()
        if view["status"] != "running":
            return dict(view)
        time.sleep(0.01)
    raise AssertionError("journey generation timed out")


def settings(tmp_path: Path, calls: list[int]) -> Settings:
    def llm() -> LLM:
        def complete(messages: Any, model: str, thinking: bool) -> Any:
            calls.append(1)
            return TEMPLATE.model_dump_json(), {}
        return LLM(cache_path=tmp_path / "cache.sqlite", complete=complete)
    return Settings(run_id="journeys", mode="demo", db_dir=tmp_path / "runs",
                    fixture=INVESTIGATION, narrative="template", dp0_seconds=0,
                    autolock=True, seed=True,
                    clock=lambda: NOW, operator_token="test-operator", llm=llm,
                    code_commit="c1", verifications=(Verification(
                        event="wallet_gate_shown", commit="c1", test="test", passed_at=NOW),),
                    sandbox_root=tmp_path / "sandboxes")


def test_operator_generation_approval_keeps_report_unchanged(tmp_path: Path) -> None:
    calls: list[int] = []
    app = create_app(settings(tmp_path, calls))
    headers = {"Authorization": "Bearer test-operator"}
    with TestClient(app) as client:
        before = client.get("/api/report").json()
        assert before["locked"] is True
        assert client.post("/api/journeys/generate").status_code == 401
        assert client.post("/api/journeys/generate?project=ens", headers=headers).status_code == 403
        assert client.post("/api/journeys/generate", headers=headers).status_code == 202
        view = wait(client, "/api/journeys/spec")
        assert view["draft"] and not view["approved"]
        assert client.post("/api/journeys/approve", headers=headers,
                           json={"digest": "0" * 64, "approved_by": "Reviewer"}).status_code == 409
        assert client.post("/api/journeys/generate", headers=headers).json() == {
            "status": "ready", "cached": True}
        body = {"digest": view["draft"]["digest"], "approved_by": "Reviewer"}
        assert client.post("/api/journeys/approve", json=body).status_code == 401
        assert client.post("/api/journeys/approve", headers=headers, json=body).status_code == 200
        assert client.get("/api/journeys/spec").json()["comparison"] is not None
        assert client.get("/api/journeys/spec").json()["comparison"]["total_sessions"] == 20
        assert client.get("/api/journeys/spec?source=visitor").json()[
            "comparison"]["total_sessions"] == 0
        assert client.post("/api/journeys/generate", headers=headers).status_code == 409
        after = client.get("/api/report").json()
        assert before["current"] == after["current"]
        assert before["v1"] == after["v1"]
        assert calls == [1]
    with TestClient(create_app(settings(tmp_path, calls))) as client:
        assert client.get("/api/journeys/spec").json()["approved"]["digest"] == body["digest"]


def test_sandbox_owner_budget_reset_and_forwarding(tmp_path: Path) -> None:
    calls: list[int] = []
    with TestClient(create_app(settings(tmp_path, calls))) as client:
        created = client.post("/api/sandbox").json()
        prefix = f"/api/sandbox/{created['sandbox_id']}"
        headers = {"Authorization": f"Bearer {created['token']}"}
        assert client.post(f"{prefix}/journeys/generate").status_code == 401
        assert client.post(f"{prefix}/traffic", headers=headers, json={"n": 10}).status_code == 200
        assert client.post(f"{prefix}/journeys/generate", headers=headers).status_code == 202
        view = wait(client, f"{prefix}/journeys/spec")
        assert view["draft"], view
        assert client.post(f"{prefix}/journeys/approve", headers=headers,
                           json={"digest": view["draft"]["digest"],
                                 "approved_by": "Sandbox owner"}).status_code == 200
        used = client.get(f"{prefix}/state").json()["investigate"]["runs_used"]
        assert used == 1
        assert client.get("/api/journeys/spec").json()["approved"] is None
        assert client.post(f"{prefix}/reset", headers=headers).status_code == 200
        cleared = client.get(f"{prefix}/journeys/spec").json()
        assert cleared["draft"] is None and cleared["approved"] is None
        assert client.get(f"{prefix}/state").json()["investigate"]["runs_used"] == used


def test_ens_has_no_counts_even_for_proposed_structure() -> None:
    workflow = workflow_view("ens", load_investigation(INVESTIGATION))
    # A valid spec must use the ENS states and exact refs; no log is available.
    states = [n for n in workflow["nodes"] if n["kind"] == "state"]
    ref = next(n for n in workflow["nodes"] if n.get("ref_check") == "correct")
    data = TEMPLATE.model_dump(mode="json")
    data["project"] = "ens"
    data["rules"] = [data["rules"][0], data["rules"][-1]]
    data["segments"] = [s for s in data["segments"] if s["id"] in {"connected", "browsers"}]
    data["columns"] = [Column(state_id=s["id"]).model_dump() for s in states]
    for rule in data["rules"]:
        rule["evidence"] = [{"node_id": ref["id"], "file": ref["file"],
                             "lines": ref["lines"], "quote": ref["quote"]}]
        if rule["predicate"]["op"] != "always":
            rule["predicate"] = {"op": "has", "events": [vocabulary(workflow)[0]]}
    spec = SegmentSpec.model_validate(data)
    assert validate(spec, workflow, vocabulary(workflow)) == []
    value = comparison(spec, workflow, [], [], code_only=True)
    assert "total_sessions" not in value
    assert all("sessions" not in node for node in value["nodes"])
    assert all("sessions" not in edge for edge in value["edges"])
    assert digest(spec.model_dump(mode="json"))


def test_shadowed_rules_are_rejected_before_approval() -> None:
    rule = TEMPLATE.rules[0].model_copy(update={
        "id": "after_connection", "predicate": Predicate(
            op="has_after", events=("wallet_connected", "wallet_attempted"))})
    spec = TEMPLATE.model_copy(update={"rules": (TEMPLATE.rules[0], rule, *TEMPLATE.rules[1:])})
    assert any("unreachable rule" in e for e in validate(spec, WORKFLOW, vocabulary(WORKFLOW)))


def test_sandbox_generation_blocks_parallel_changes(tmp_path: Path) -> None:
    import threading

    entered, release = threading.Event(), threading.Event()
    config = settings(tmp_path, [])

    def llm() -> LLM:
        def complete(messages: Any, model: str, thinking: bool) -> Any:
            entered.set()
            assert release.wait(5)
            return TEMPLATE.model_dump_json(), {}
        return LLM(cache_path=tmp_path / "concurrent.sqlite", complete=complete)
    config.llm = llm
    with TestClient(create_app(config)) as client:
        created = client.post("/api/sandbox").json()
        prefix = f"/api/sandbox/{created['sandbox_id']}"
        headers = {"Authorization": f"Bearer {created['token']}"}
        client.post(f"{prefix}/traffic", headers=headers, json={"n": 10})
        try:
            assert client.post(f"{prefix}/journeys/generate", headers=headers).status_code == 202
            assert entered.wait(3)
            assert client.post(f"{prefix}/journeys/generate", headers=headers).status_code == 409
            assert client.post(f"{prefix}/reset", headers=headers).status_code == 409
            result = client.post(f"{prefix}/traffic", headers=headers, json={"n": 1})
            assert result.status_code == 409
        finally:
            release.set()
        assert wait(client, f"{prefix}/journeys/spec")["draft"]
