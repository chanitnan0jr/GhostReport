"""Synthetic ENS exercises never enter real evidence or grant-app snapshots."""

import json
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from engine import ens_simulation, journey_api
from engine.api import Settings, create_app
from engine.demo import INVESTIGATION

NOW = datetime(2026, 10, 16, 7, tzinfo=UTC)


def settings(tmp_path: Path) -> Settings:
    return Settings(run_id="ens-exercise", mode="demo", db_dir=tmp_path,
                    fixture=INVESTIGATION, autolock=True, seed=True,
                    narrative="template", dp0_seconds=0, clock=lambda: NOW)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    approved = json.loads(journey_api.ENS_DRAFT.read_text())
    approved.update(kind="approved", approved_by="Test reviewer", approved_at=NOW.isoformat())
    path = tmp_path / "approved.json"
    path.write_text(json.dumps(approved))
    monkeypatch.setattr(journey_api, "ENS_FIXTURE", path)
    with TestClient(create_app(settings(tmp_path))) as value:
        yield value


def start(client: TestClient) -> tuple[str, dict[str, str], dict[str, Any]]:
    response = client.post("/api/ens/simulations")
    assert response.status_code == 201
    value = response.json()
    return (f"/api/ens/simulations/{value['simulation_id']}",
            {"Authorization": f"Bearer {value['token']}"}, value["report"])


def test_requires_approved_ens_spec(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(journey_api, "ENS_FIXTURE", tmp_path / "missing.json")
    with TestClient(create_app(settings(tmp_path))) as client:
        assert client.post("/api/ens/simulations").status_code == 409


@pytest.mark.parametrize("mode", ["mixed", "answered", "skipped", "unanswered", "not_shown"])
def test_load_and_feedback_are_counted_from_records_without_changing_mock(
    client: TestClient, mode: str,
) -> None:
    before = client.get("/api/report").json()
    prefix, headers, baseline = start(client)
    response = client.post(prefix + "/load", headers=headers, json={
        "batch_id": "batch-test-001", "n": 100, "seed": 42,
        "feedback": mode, "preset": "permission"})
    assert response.status_code == 200
    report = response.json()
    assert report["population"]["synthetic"] == 100 and report["population"]["visitor"] == 0
    assert report["v1_digest"] == baseline["v1_digest"]
    assert report["v1"]["status"] == "Unresolved" and report["v1"]["findings"] == []
    assert sum(s["sessions"] for s in report["segments"]) == 100
    records = client.get(prefix + "/records").json()["sessions"]
    exposure_rows = [r for r in records if r["exposure"]]
    answers = [r for r in records if r["response"] and not r["response"]["skipped"]]
    skips = [r for r in records if r["response"] and r["response"]["skipped"]]
    counts = report["coverage"]
    assert counts["eligible"] > 0
    assert counts["shown"] == len(exposure_rows)
    assert counts["answered"] == len(answers)
    assert counts["skipped"] == len(skips)
    assert counts["shown"] == counts["answered"] + counts["skipped"] + counts["shown_no_response"]
    assert counts["not_asked"] + counts["shown"] == 100
    if mode == "answered":
        assert counts["answered"] == counts["shown"] == counts["eligible"]
    elif mode == "skipped":
        assert counts["skipped"] == counts["shown"] == counts["eligible"]
    elif mode == "unanswered":
        assert counts["shown_no_response"] == counts["shown"] == counts["eligible"]
    elif mode == "not_shown":
        assert counts["shown"] == counts["answered"] == counts["skipped"] == 0
    permission = [f for f in report["findings"] if f["option_id"] == "permission"]
    assert sum(f["respondents"] for f in permission) == len(answers)
    assert all(f["selected"] == f["respondents"] for f in permission)
    for finding in report["findings"]:
        assert finding["text"].startswith(
            f"{finding['selected']} of {finding['respondents']} respondents")
        assert finding["evidence_conflict"] is False
        if finding["respondents"] < 3:
            assert finding["status"] == "Unresolved"
        if finding["option_id"] != "permission":
            assert finding["selected"] == 0
    for row in records:
        assert row["source"] == "synthetic" and row["synthetic"] is True
        assert [e["seq"] for e in row["events"]] == list(range(1, len(row["events"]) + 1))
        assert all(e["schema_version"] == 1 and e["received_at"] == NOW.isoformat()
                   for e in row["events"])
        if row["exposure"]:
            assert row["eligible"] and row["exit_type"] == "explicit_exit"
            assert "transaction:register:complete" not in [e["event"] for e in row["events"]]
            exposure = row["exposure"]
            assert exposure["options_shown"][-1] == "other"
            assert exposure["event_seq_at_shown"] == row["events"][-1]["seq"]
            assert exposure["shown_at"] > row["events"][-1]["occurred_at"]
            if row["response"]:
                assert set(row["response"]["option_ids"]) <= set(exposure["options_shown"])
                assert row["response"]["responded_at"] > exposure["shown_at"]
    after = client.get("/api/report").json()
    assert before["current"] == after["current"] and before["v1"] == after["v1"]


def test_owner_isolation_idempotency_and_limits(client: TestClient) -> None:
    prefix, headers, _ = start(client)
    other, other_headers, _ = start(client)
    body = {"batch_id": "batch-0001", "n": 20}
    assert client.post(prefix + "/load", json=body).status_code == 401
    assert client.post(prefix + "/load", headers=other_headers, json=body).status_code == 401
    assert client.post(prefix + "/load", headers=headers,
                       json={**body, "n": 201}).status_code == 422
    first = client.post(prefix + "/load", headers=headers, json=body).json()
    retry = client.post(prefix + "/load", headers=headers, json=body).json()
    assert first == retry
    assert client.post(prefix + "/load", headers=headers,
                       json={**body, "n": 10}).status_code == 409
    assert client.get(other).json()["population"]["synthetic"] == 0
    assert "token" not in client.get(prefix).json()
    for index in range(4):
        assert client.post(prefix + "/load", headers=headers, json={
            "batch_id": f"batch-fill-{index}", "n": 200}).status_code == 200
    assert client.post(prefix + "/load", headers=headers, json={
        "batch_id": "batch-over-limit", "n": 200}).status_code == 409


def test_skips_do_not_change_findings_and_baseline_survives_restart(
    client: TestClient, tmp_path: Path,
) -> None:
    prefix, headers, _ = start(client)
    first = client.post(prefix + "/load", headers=headers, json={
        "batch_id": "batch-answers", "n": 50, "feedback": "answered"}).json()
    second = client.post(prefix + "/load", headers=headers, json={
        "batch_id": "batch-skips", "n": 50, "feedback": "skipped"}).json()
    assert first["findings"] == second["findings"]
    assert first["v1_digest"] == second["v1_digest"]
    with TestClient(create_app(settings(tmp_path))) as restarted:
        assert restarted.get(prefix).json() == second


def test_existing_simulation_keeps_its_question_and_paths(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    prefix, headers, baseline = start(client)
    monkeypatch.setattr(ens_simulation, "QUESTION", {"version": "changed", "options": []})
    monkeypatch.setattr(ens_simulation, "OPTIONS", [])
    monkeypatch.setattr(ens_simulation, "PATHS", [])
    response = client.post(prefix + "/load", headers=headers, json={
        "batch_id": "frozen-question", "n": 20, "feedback": "answered"})
    assert response.status_code == 200
    report = response.json()
    assert report["question"] == baseline["question"]
    assert report["v1_digest"] == baseline["v1_digest"]
    assert report["coverage"]["answered"] > 0
