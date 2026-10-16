"""Journey definitions cannot change template counts or turn missing data into intent."""

import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from engine import journey_api
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


@pytest.mark.parametrize("op,low,high", [
    ("has", 1, 1), ("lacks", 1, 1), ("has_after", 2, 2), ("last_event_in", 1, 20),
])
def test_predicate_schema_exposes_event_cardinality(op: str, low: int, high: int) -> None:
    schema = SegmentSpec.model_json_schema()["$defs"]["Predicate"]
    branch = next(b["then"] for b in schema["allOf"]
                  if b["if"]["properties"]["op"]["const"] == op)
    assert "events" in branch["required"]
    assert branch["properties"]["events"] == {"minItems": low, "maxItems": high}
    assert branch["properties"]["children"] == {"maxItems": 0}
    assert branch["properties"]["outcome"] == {"type": "null"}


def test_multi_event_lacks_reports_an_actionable_error() -> None:
    with pytest.raises(ValidationError, match="lacks requires exactly 1 event; received 2"):
        Predicate(op="lacks", events=("wallet_connected", "wallet_rejected"))


def test_compound_absence_keeps_explicit_logic_and_unknown_coverage() -> None:
    children = tuple(Predicate(op="lacks", events=(event,))
                     for event in ("wallet_connected", "wallet_rejected"))
    both = Predicate(op="all", children=children)
    either = Predicate(op="any", children=children)
    assert matches(both, ["wallet_connected"], True) is False
    assert matches(either, ["wallet_connected"], True) is True
    assert matches(both, [], False) is None
    assert matches(either, [], False) is None


@pytest.mark.parametrize("repair", [True, False])
def test_generation_repairs_nested_multi_event_lacks(tmp_path: Path, repair: bool) -> None:
    valid = TEMPLATE.model_dump(mode="json")
    valid["rules"][0]["predicate"] = {"op": "all", "children": [
        {"op": "lacks", "events": ["wallet_connected"]},
        {"op": "lacks", "events": ["wallet_rejected"]},
    ]}
    invalid = json.loads(json.dumps(valid))
    invalid["rules"][0]["predicate"]["children"][1]["events"] = [
        "wallet_connected", "wallet_rejected"]
    replies = [invalid, valid if repair else invalid]
    sent: list[Any] = []

    def complete(messages: Any, model: str, thinking: bool) -> Any:
        sent.append(messages)
        return json.dumps(replies.pop(0)), {}

    llm = LLM(cache_path=tmp_path / "cache.sqlite", complete=complete)
    try:
        result = generate(llm, {"workflow": WORKFLOW,
                                "event_vocabulary": vocabulary(WORKFLOW)})
        assert len(sent) == 2
        assert "lacks requires exactly 1 event; received 2" in sent[1][-1]["content"]
        assert "Use all/any" in sent[1][-1]["content"]
        assert "has and lacks require exactly 1 event" in sent[0][1]["content"]
        if repair:
            assert result["draft"] and result["validation"] == []
            assert result["digest"] == digest(result["draft"])
            assert llm.stats()[0]["prompt_version"] == 2
            assert llm.stats()[0]["attempts"] == 2
        else:
            assert result["draft"] is None and result["digest"] is None
            assert "journeys.v2 output failed validation twice" in result["validation"][0]
            assert llm.stats() == []
    finally:
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


def test_ens_committed_draft_is_reviewable_without_approval_or_llm(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(journey_api, "ENS_FIXTURE", tmp_path / "not-approved.json")
    calls: list[int] = []
    with TestClient(create_app(settings(tmp_path, calls))) as client:
        before = client.get("/api/report").json()
        value = client.get("/api/journeys/spec?project=ens").json()
        assert value["draft"]["kind"] == "draft"
        assert value["approved"] is None and value["validation"] == []
        assert value["draft"]["digest"] == digest(value["draft"]["spec"])
        assert value["comparison"]["code_only"] is True
        assert value["comparison"]["nodes"] and value["comparison"]["edges"]
        assert "total_sessions" not in value["comparison"]
        for item in [*value["comparison"]["nodes"], *value["comparison"]["edges"],
                     *value["comparison"]["segments"]]:
            assert "sessions" not in item and "by_source" not in item
        headers = {"Authorization": "Bearer test-operator"}
        assert client.post("/api/journeys/generate?project=ens", headers=headers).status_code == 403
        assert client.post("/api/journeys/approve?project=ens", json={
            "digest": value["draft"]["digest"], "approved_by": "Reviewer",
        }).status_code == 401
        after = client.get("/api/report").json()
        assert before["current"] == after["current"] and before["v1"] == after["v1"]
    assert calls == []


def test_ens_operator_approval_persists_without_llm_or_report_changes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(journey_api, "ENS_FIXTURE", tmp_path / "not-approved.json")
    calls: list[int] = []
    headers = {"Authorization": "Bearer test-operator"}
    path = "/api/journeys/approve?project=ens"
    with TestClient(create_app(settings(tmp_path, calls))) as client:
        before = client.get("/api/report").json()
        view = client.get("/api/journeys/spec?project=ens").json()
        body = {"digest": view["draft"]["digest"], "approved_by": "ENS reviewer"}
        assert client.post(path, json=body).status_code == 401
        assert client.post(path, headers={"Authorization": "Bearer wrong"},
                           json=body).status_code == 401
        assert client.post(path, headers=headers, json={**body,
                           "digest": "0" * 64}).status_code == 409
        assert client.post(path, headers=headers, json={**body,
                           "approved_by": " "}).status_code == 409
        response = client.post(path, headers=headers, json=body)
        assert response.status_code == 200
        approved = response.json()
        assert approved["kind"] == "approved" and approved["approved_by"] == "ENS reviewer"
        assert approved["approved_at"] and approved["digest"] == body["digest"]
        assert client.post(path, headers=headers, json=body).status_code == 409
        after = client.get("/api/report").json()
        assert before["current"] == after["current"] and before["v1"] == after["v1"]
    config = settings(tmp_path, calls)
    config.run_id = "another-run"
    with TestClient(create_app(config)) as client:
        view = client.get("/api/journeys/spec?project=ens").json()
        assert view["approved"] == approved
        assert view["comparison"]["code_only"] and "total_sessions" not in view["comparison"]
        assert client.post(path, headers=headers, json=body).status_code == 409
    assert calls == []


@pytest.mark.parametrize("invalid", ["digest", "workflow_sha256", "spec", "kind", "json"])
def test_invalid_ens_draft_is_withheld(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, invalid: str,
) -> None:
    record = json.loads(journey_api.ENS_DRAFT.read_text())
    record[invalid] = None
    path = tmp_path / "invalid-draft.json"
    path.write_text("{" if invalid == "json" else json.dumps(record))
    monkeypatch.setattr(journey_api, "ENS_DRAFT", path)
    monkeypatch.setattr(journey_api, "ENS_FIXTURE", tmp_path / "not-approved.json")
    with TestClient(create_app(settings(tmp_path, []))) as client:
        value = client.get("/api/journeys/spec?project=ens").json()
        assert value["draft"] is None
        assert value["approved"] is None
        assert value["comparison"] is None


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
