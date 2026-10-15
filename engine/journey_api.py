"""Journey draft journal and API. Generated rules never replace locked cohorts."""

import asyncio
import json
import re
from collections.abc import Callable
from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from engine.cohorts import build_cohorts
from engine.llm import deepseek_completion
from engine.models import Event, EventName, SessionStats
from engine.partb import PARTB_DIR
from engine.seed import session_source
from engine.segment_spec import (
    Project,
    SegmentSpec,
    aggregate_context,
    comparison,
    digest,
    generate,
    template_spec,
    validate,
)
from engine.workflow_view import workflow_view

if TYPE_CHECKING:
    from engine.api import Ghost

ENS_FIXTURE = PARTB_DIR / "journeys.ens.json"
ENS_DRAFT = PARTB_DIR / "journeys.ens.draft.json"


class ApproveJourney(BaseModel):
    model_config = ConfigDict(extra="forbid")
    digest: str = Field(pattern=r"^[0-9a-f]{64}$")
    approved_by: str = Field(min_length=1, max_length=100)


def vocabulary(workflow: dict[str, Any]) -> list[str]:
    if workflow["target"] == "app":
        from typing import get_args

        return list(get_args(EventName))
    # These are literal analytics calls already captured and checked in the map.
    return sorted({m for node in workflow["nodes"] if node.get("ref_check") != "wrong"
                   for m in re.findall(r"\b(?:sendEvent|trackEvent|capture)\(\s*['\"]([^'\"]+)",
                                       node["quote"])})


class JourneySpecs:
    def __init__(self, ghost: "Ghost") -> None:
        self.ghost = ghost
        self.path = ghost.settings.db_dir / f"{ghost.settings.run_id}.journeys.jsonl"
        self.ens_approval_path = ghost.settings.db_dir / "journeys.ens.approved.json"
        self.records: list[dict[str, Any]] = []
        if self.path.exists():
            self.records = [json.loads(line) for line in self.path.read_text().splitlines()]
        self.task: asyncio.Task[None] | None = None
        self.validation: list[str] = []

    def snapshot(self, project: Project) -> tuple[dict[str, Any], list[Event],
                                                 tuple[SessionStats, ...]]:
        ghost = self.ghost
        workflow = workflow_view(project, ghost.inv())
        now = ghost.settings.clock()
        events = [e for e in ghost.store().events() if e.received_at <= now] \
            if project == "app" else []
        sessions = build_cohorts(events, now, build_verified=ghost.store().run.build_verified)
        return workflow, events, sessions

    def context(self, project: Project) -> dict[str, Any]:
        workflow, events, sessions = self.snapshot(project)
        return {"project": project, "workflow": workflow,
                "workflow_sha256": digest(workflow), "event_vocabulary": vocabulary(workflow),
                "eligible_evidence_ids": [n["id"] for n in workflow["nodes"]
                                          if n.get("ref_check") != "wrong"],
                "vocabulary_scope": "canonical events" if project == "app"
                else "literal analytics calls in checked Workflow Map quotes",
                "observations": aggregate_context(events, sessions) if project == "app" else None}

    def append(self, record: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")
        self.records.append(record)

    def latest(self, project: Project, kind: str) -> dict[str, Any] | None:
        if project == "ens":
            if kind == "approved":
                path = ENS_FIXTURE if ENS_FIXTURE.exists() else self.ens_approval_path
            else:
                path = ENS_DRAFT
            if path.exists():
                try:
                    record = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    return None
                if isinstance(record, dict) and record.get("kind") == kind:
                    return dict(record)
                return None
        return next((r for r in reversed(self.records)
                     if r["project"] == project and r["kind"] == kind), None)

    def checked(self, record: dict[str, Any] | None,
                workflow: dict[str, Any]) -> dict[str, Any] | None:
        if record is None:
            return None
        try:
            spec = SegmentSpec.model_validate(record.get("spec"))
        except ValueError:
            return None
        if (record.get("workflow_sha256") != digest(workflow)
                or record.get("digest") != digest(spec.model_dump(mode="json"))
                or validate(spec, workflow, vocabulary(workflow))):
            return None
        if record.get("kind") == "approved" and not (
                record.get("approved_by") and record.get("approved_at")):
            return None
        return record

    def view(self, project: Project, source: str | None = None,
             exclude: str | None = None) -> dict[str, Any]:
        workflow, events, sessions = self.snapshot(project)
        sessions = tuple(s for s in sessions if (source is None
                         or session_source(s.session_id) == source)
                         and session_source(s.session_id) != exclude)
        approved = self.checked(self.latest(project, "approved"), workflow)
        draft = self.checked(self.latest(project, "draft"), workflow)
        stale = self.latest(project, "approved") is not None and approved is None
        template = template_spec(workflow).model_dump(mode="json") if project == "app" else None
        result: dict[str, Any] = {
            "project": project, "status": "running" if self.running() else "ready",
            "workflow_sha256": digest(workflow), "draft": draft, "approved": approved,
            "validation": self.validation, "stale": stale,
            "template": template, "template_digest": digest(template) if template else None,
            "comparison": None,
        }
        # A code-only draft can be reviewed without assigning any sessions to it.
        display = approved or (draft if project == "ens" else None)
        if display:
            spec = SegmentSpec.model_validate(display["spec"])
            result["comparison"] = comparison(spec, workflow, events, sessions,
                                               code_only=project == "ens")
        return result

    def truth_comparison(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        from collections import Counter, defaultdict

        from engine.segment_spec import assignment, event_groups

        workflow, events, sessions = self.snapshot("app")
        approved = self.checked(self.latest("app", "approved"), workflow)
        if approved is None:
            return []
        spec = SegmentSpec.model_validate(approved["spec"])
        groups = event_groups(events)
        assignments = {s.session_id: assignment(
            spec, [e.event for e in groups[s.session_id]], s.coverage == "complete")[1]
            for s in sessions}
        counts: dict[tuple[str, ...], Counter[str]] = defaultdict(Counter)
        for row in rows:
            counts[tuple(row["events"])][assignments.get(
                row["session_id"], "no_recorded_session")] += 1
        return [{"events": list(path), "sessions": sum(split.values()),
                 "total_sessions": len(rows), "generated_segments": dict(split)}
                for path, split in sorted(counts.items())]

    def running(self) -> bool:
        return self.task is not None and not self.task.done()

    def record_result(self, context: dict[str, Any], result: dict[str, Any],
                      now: datetime) -> None:
        self.validation = result["validation"]
        if result["draft"] is not None:
            self.append({"kind": "draft", "project": context["project"],
                         "context_sha256": digest(context),
                         "workflow_sha256": context["workflow_sha256"],
                         "spec": result["draft"], "digest": result["digest"],
                         "created_at": now.isoformat(), "validation": []})

    async def run(self, context: dict[str, Any], sandbox: Any = None) -> None:
        calls = [0]

        def work() -> dict[str, Any]:
            llm = self.ghost.settings.llm()
            client: list[Any] = []
            base = llm.complete

            def complete(messages: Any, model: str, thinking: bool) -> Any:
                if not client:
                    client.append(base or deepseek_completion())
                calls[0] += 1
                return client[0](messages, model, thinking)

            llm.complete = complete
            try:
                return generate(llm, context)
            finally:
                llm.db.close()

        try:
            if sandbox:
                async with sandbox.hub.semaphore:
                    result = await asyncio.to_thread(work)
            else:
                result = await asyncio.to_thread(work)
            self.record_result(context, result, self.ghost.settings.clock())
        except Exception:  # noqa: BLE001 - no unchecked model/transport errors to the UI
            self.validation = ["Journey generation did not finish. Try again later."]
        finally:
            if sandbox:
                if calls[0]:
                    sandbox.meta["investigate"]["runs_used"] += 1
                else:
                    sandbox.hub.refund()
                if sandbox.root.exists():
                    sandbox.save()

    def approve(self, project: Project, body: ApproveJourney) -> dict[str, Any]:
        workflow, _, _ = self.snapshot(project)
        draft = self.checked(self.latest(project, "draft"), workflow)
        if not draft or draft["digest"] != body.digest:
            raise ValueError("draft digest is stale or no validated draft exists")
        record = {**draft, "kind": "approved", "approved_by": body.approved_by.strip(),
                  "approved_at": self.ghost.settings.clock().isoformat()}
        if not record["approved_by"]:
            raise ValueError("approved_by must name the reviewer")
        if project == "ens":
            self.ens_approval_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with self.ens_approval_path.open("x", encoding="utf-8") as file:
                    file.write(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
            except FileExistsError as error:
                raise ValueError(
                    "ENS definitions are already saved; review the existing approval",
                ) from error
            return record
        self.append(record)
        return record



def add_journey_routes(app: FastAPI, ghost: "Ghost", operator: Callable[..., None]) -> None:
    service = JourneySpecs(ghost)
    app.state.journey_specs = service

    @app.get("/api/journeys/spec")
    async def spec_view(
        project: Project = "app", source: Literal["seed", "test", "visitor"] | None = None,
        exclude: Literal["seed", "test", "visitor"] | None = None,
    ) -> Any:
        return service.view(project, source, exclude)

    @app.post("/api/journeys/generate", status_code=202, dependencies=[Depends(operator)])
    async def generate_journeys(project: Project = "app") -> Any:
        if project == "ens":
            raise HTTPException(403, "ENS generation is offline only; review the prepared draft")
        if service.running():
            raise HTTPException(409, "Journey generation is already running")
        if service.view(project)["approved"]:
            raise HTTPException(409, "Journey definitions are already approved")
        context = service.context(project)
        cached = next((r for r in reversed(service.records) if r["kind"] == "draft"
                       and r["context_sha256"] == digest(context)
                       and service.checked(r, context["workflow"])), None)
        if cached:
            service.append(cached)
            return {"status": "ready", "cached": True}
        service.task = asyncio.create_task(service.run(context))
        return {"status": "running"}

    @app.post("/api/journeys/approve", dependencies=[Depends(operator)])
    async def approve_journeys(body: ApproveJourney, project: Project = "app") -> Any:
        if service.running() or service.view(project)["approved"]:
            raise HTTPException(409, "Generation is running or definitions are already approved")
        try:
            return service.approve(project, body)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
