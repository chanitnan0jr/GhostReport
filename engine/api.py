"""FastAPI boundary: adapts app payloads to engine models. Run: uvicorn engine.api:app.

Endpoints are async on purpose: sqlite3 connections are bound to one thread,
so every request and the DP0 loop share the event-loop thread.
"""

import asyncio
import json
import logging
import os
import re
import subprocess
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from pydantic import AwareDatetime, BaseModel, Field, ValidationError

from engine.context_builder import build_context
from engine.investigation import DEFAULT_FIXTURE, Investigation, load_investigation
from engine.llm import LLM, LLMError
from engine.models import DecisionPoint, Event, Exposure, ProbeResponse, Run
from engine.probe import plan_probe
from engine.records import ProbeRecords
from engine.report import (
    append_successor,
    build_report,
    evaluate,
    lock_v1,
    run_dp0,
    snapshots,
)
from engine.stages import InvestigationDraft, approve, run_stage_a, run_stage_b
from engine.storage import Store

log = logging.getLogger("ghostreport")
ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}")
MAX_BATCH = 100


def _git_commit() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True,
        ).stdout.strip() or "uncommitted"
    except (OSError, subprocess.CalledProcessError):
        return "uncommitted"


@dataclass
class Settings:
    """Environment-driven; one SQLite file per run so provenance cannot mix."""

    run_id: str = field(default_factory=lambda: os.getenv("GHOST_RUN_ID", "dev"))
    mode: str = field(default_factory=lambda: os.getenv("GHOST_MODE", "live"))
    app_build: str = field(default_factory=lambda: os.getenv("GHOST_APP_BUILD", "dev"))
    build_verified: bool = field(
        default_factory=lambda: os.getenv("GHOST_BUILD_VERIFIED", "0") == "1")
    db_dir: Path = field(default_factory=lambda: Path(os.getenv("GHOST_DB_DIR", "runs")))
    fixture: Path = field(
        default_factory=lambda: Path(os.getenv("GHOST_FIXTURE", str(DEFAULT_FIXTURE))))
    target_repo: Path = field(
        default_factory=lambda: Path(os.getenv("GHOST_TARGET_REPO", "app")))
    ends_at: datetime = field(default_factory=lambda: datetime.fromisoformat(
        os.getenv("GHOST_ENDS_AT", "2026-10-16T18:00:00+07:00")))
    dp0_seconds: float = 30.0
    llm: Callable[[], LLM] = LLM
    cors_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        os.getenv("GHOST_CORS", "http://localhost:5173,http://localhost:5174").split(",")))
    clock: Callable[[], datetime] = field(default=lambda: datetime.now(UTC))

    def run(self) -> Run:
        return Run.model_validate({
            "run_id": self.run_id, "mode": self.mode, "code_commit": _git_commit(),
            "app_build": self.app_build, "build_verified": self.build_verified,
        })


class ExposureIn(BaseModel):
    """What ProbeCard beacons; the server derives everything authoritative."""

    exposure_id: str
    plan_id: str
    session_id: str
    shown_at: AwareDatetime
    client_cohort_at_shown: str | None = None
    event_seq_at_shown: int
    options_shown: list[str]


class ResponseIn(BaseModel):
    """Answer or skip; exposure fields let the server infer a lost beacon."""

    exposure_id: str
    option_ids: list[str] = []
    skipped: bool = False
    responded_at: AwareDatetime
    plan_id: str | None = None
    session_id: str | None = None
    shown_at: AwareDatetime | None = None
    event_seq_at_shown: int | None = None
    options_shown: list[str] | None = None


class SnapshotIn(BaseModel):
    v1_digest: str


class ApproveIn(BaseModel):
    approved_by: str = Field(min_length=1, max_length=100)
    target_n: int = Field(default=10, gt=0)
    budget: int = Field(default=30, gt=0)
    ends_at: AwareDatetime | None = None


async def _json(request: Request) -> Any:
    """sendBeacon bodies may arrive as text/plain; parse regardless of content type."""
    try:
        return json.loads(await request.body())
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(400, "body must be JSON") from error


def _clean_event(raw: Any, received_at: datetime) -> Event:
    """Privacy whitelist, then the canonical model. `page` duplicates the top-level field."""
    if not isinstance(raw, dict):
        raise ValueError("event must be an object")
    props = raw.get("props") or {}
    if not isinstance(props, dict):
        raise ValueError("props must be an object")
    if any(ADDRESS.search(str(v)) for v in props.values()):
        raise ValueError("props contain an address-like value")
    props = {k: v for k, v in props.items() if k != "page"}
    return Event.model_validate({**raw, "props": props, "received_at": received_at})


def _client_plan(investigation: Investigation, plan_id: str) -> dict[str, Any]:
    plan = investigation.plan(plan_id)
    assert plan is not None
    question = investigation.question(plan)
    return {
        "plan_id": plan.plan_id, "question_version": plan.question_version,
        "decision_point": question.decision_point, "target_cohort": plan.target_cohorts[0],
        "stem": question.stem,
        "options": [{"id": o.id, "label": o.label} for o in question.options],
        "ends_at": plan.ends_at.isoformat(), "closed_hint": False,
    }


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    approved_path = settings.db_dir / f"{settings.run_id}.investigation.json"
    draft_path = settings.db_dir / f"{settings.run_id}.draft.json"
    state: dict[str, Any] = {"investigation": load_investigation(
        approved_path if approved_path.exists() else settings.fixture)}

    def inv() -> Investigation:
        return state["investigation"]  # type: ignore[no-any-return]

    def store() -> Store:
        return state["store"]  # type: ignore[no-any-return]

    def records() -> ProbeRecords:
        return state["records"]  # type: ignore[no-any-return]

    async def dp0_loop() -> None:
        while True:
            await asyncio.sleep(settings.dp0_seconds)
            try:
                run_dp0(store(), records(), inv(), now=settings.clock())
            except Exception:  # noqa: BLE001 - keep the loop alive; the trace shows gaps
                log.exception("DP0 evaluation failed")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        settings.db_dir.mkdir(parents=True, exist_ok=True)
        state["store"] = Store(settings.db_dir / f"{settings.run_id}.sqlite", settings.run())
        state["records"] = ProbeRecords(state["store"].connection)
        task = asyncio.create_task(dp0_loop()) if settings.dp0_seconds > 0 else None
        try:
            yield
        finally:
            if task:
                task.cancel()
            state["store"].connection.close()

    app = FastAPI(title="GhostReport engine", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "run": store().run.model_dump(mode="json"),
                "locked": bool(snapshots(store(), inv().investigation_id))}

    @app.post("/api/events")
    async def ingest(request: Request) -> dict[str, Any]:
        body = await _json(request)
        batch = body.get("events") if isinstance(body, dict) else None
        if not isinstance(batch, list) or len(batch) > MAX_BATCH:
            raise HTTPException(422, f"expected {{'events': [...]}} with at most {MAX_BATCH}")
        now = settings.clock()
        accepted, duplicates, rejected = 0, 0, []
        for raw in batch:
            event_id = raw.get("event_id") if isinstance(raw, dict) else None
            try:
                if store().ingest(_clean_event(raw, now)):
                    accepted += 1
                else:
                    duplicates += 1
            except (ValidationError, ValueError) as error:
                reason = (error.errors(include_url=False)[0]["msg"]
                          if isinstance(error, ValidationError) else str(error))
                rejected.append({"event_id": event_id, "reason": reason})
        if rejected:
            log.warning("rejected events: %s", rejected)
        return {"accepted": accepted, "duplicates": duplicates, "rejected": rejected}

    @app.get("/api/probe-plan")
    async def probe_plan(
        session_id: Annotated[str, Query(min_length=1)],
        decision_point: Annotated[DecisionPoint, Query()] = "DP1",
    ) -> dict[str, Any] | None:
        """Plans are served only after v1 is locked; null means no probe for this exit."""
        if not snapshots(store(), inv().investigation_id):
            return None
        plan = inv().plan_for(decision_point)
        if plan is None:
            return None
        exposures = [e for e in records().exposures() if e.plan_id == plan.plan_id]
        ids = {e.exposure_id for e in exposures}
        answered = sum(not r.skipped for r in records().responses() if r.exposure_id in ids)
        if plan_probe(plan, inv().question(plan), inv().hypotheses,
                      now=settings.clock(), answered=answered, shown=len(exposures)) is None:
            return None
        return _client_plan(inv(), plan.plan_id)

    def _exposure(item: ExposureIn | ResponseIn, via: str) -> Exposure:
        plan = inv().plan(item.plan_id or "")
        if plan is None:
            raise HTTPException(422, "unknown plan")
        return Exposure.model_validate({
            "exposure_id": item.exposure_id, "plan_id": plan.plan_id,
            "run_id": store().run.run_id, "investigation_id": plan.investigation_id,
            "question_version": plan.question_version,
            "decision_point": inv().question(plan).decision_point,
            "session_id": item.session_id, "shown_at": item.shown_at,
            "event_seq_at_shown": item.event_seq_at_shown,
            "options_shown": tuple(item.options_shown or ()), "received_via": via,
        })

    @app.post("/api/probe/exposure")
    async def exposure(request: Request) -> dict[str, str]:
        raw = await _json(request)
        try:
            item = ExposureIn.model_validate(raw)
            recorded = records().add_exposure(
                _exposure(item, "beacon"), client_payload=json.dumps(raw),
                received_at=settings.clock(),
            )
        except (ValidationError, ValueError) as error:
            raise HTTPException(422, str(error)) from error
        return {"status": "recorded" if recorded else "duplicate"}

    @app.post("/api/probe/response")
    async def response(request: Request) -> dict[str, str]:
        raw = await _json(request)
        try:
            item = ResponseIn.model_validate(raw)
            now = settings.clock()
            inferred = False
            if not records().has_exposure(item.exposure_id) and item.plan_id:
                records().add_exposure(_exposure(item, "inferred_from_response"),
                                       client_payload=json.dumps(raw), received_at=now)
                inferred = True
            recorded = records().add_response(ProbeResponse(
                exposure_id=item.exposure_id, option_ids=tuple(item.option_ids),
                skipped=item.skipped, responded_at=item.responded_at,
            ), received_at=now)
        except (ValidationError, ValueError) as error:
            raise HTTPException(422, str(error)) from error
        status = "duplicate" if not recorded else "recorded_inferred" if inferred else "recorded"
        return {"status": status}

    @app.post("/api/lock")
    async def lock() -> dict[str, Any]:
        """Show this digest outside the system (mentor/judge) before the first probe."""
        snapshot, digest = lock_v1(store(), records(), inv(), now=settings.clock())
        log.warning("v1 LOCKED  digest=%s  cutoff=%s", digest, snapshot.data_cutoff.isoformat())
        return {"version": 1, "digest": digest, "data_cutoff": snapshot.data_cutoff}

    @app.post("/api/snapshot")
    async def snapshot(body: SnapshotIn) -> dict[str, Any]:
        try:
            state_, digest = append_successor(
                store(), records(), inv(), now=settings.clock(),
                trusted_v1_digest=body.v1_digest,
            )
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        return {"version": state_.version, "digest": digest, "data_cutoff": state_.data_cutoff}

    def locked() -> bool:
        return bool(snapshots(store(), inv().investigation_id))

    @app.post("/api/analyze")
    async def analyze() -> Any:
        """Stage A + B on the configured target repo; the result is a draft, not approved."""
        if locked():
            raise HTTPException(409, "v1 is locked; hypotheses cannot change")
        current = evaluate(store(), records(), inv(), now=settings.clock())
        stats = {"funnel": current["funnel"], "cohorts": current["cohorts"]}

        def work() -> InvestigationDraft:
            root = settings.target_repo
            pack, llm = build_context(root), settings.llm()
            workflow, rejected = run_stage_a(llm, pack, root)
            draft = run_stage_b(llm, pack, workflow, stats, repo_root=str(root))
            merged = {**draft.rejected, **{f"stage_a_{k}": v for k, v in rejected.items()}}
            return draft.model_copy(update={"rejected": merged})

        try:
            draft = await asyncio.to_thread(work)
        except LLMError as error:
            raise HTTPException(502, str(error)) from error
        draft_path.write_text(draft.model_dump_json(indent=2), encoding="utf-8")
        return jsonable_encoder(draft)

    @app.get("/api/draft")
    async def get_draft() -> Any:
        if not draft_path.exists():
            return None
        return json.loads(draft_path.read_text(encoding="utf-8"))

    @app.post("/api/approve")
    async def approve_draft(body: ApproveIn) -> dict[str, Any]:
        """Operator approves class mappings and probe questions together, before the lock."""
        if locked():
            raise HTTPException(409, "v1 is locked; hypotheses cannot change")
        if not draft_path.exists():
            raise HTTPException(404, "run POST /api/analyze first")
        draft = InvestigationDraft.model_validate_json(draft_path.read_text(encoding="utf-8"))
        try:
            approved = approve(
                draft, approved_by=body.approved_by, now=settings.clock(),
                ends_at=body.ends_at or settings.ends_at, target_n=body.target_n,
                budget=body.budget,
            )
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        approved_path.write_text(json.dumps(approved.dump(), indent=2, ensure_ascii=False),
                                 encoding="utf-8")
        state["investigation"] = approved
        return {"investigation_id": approved.investigation_id,
                "workflow_version": approved.workflow.version,
                "class_mappings": len(approved.class_mappings),
                "questions": [q.question_version for q in approved.questions]}

    @app.post("/api/dp0")
    async def dp0() -> dict[str, Any]:
        decisions = run_dp0(store(), records(), inv(), now=settings.clock())
        return {"decisions": jsonable_encoder(decisions)}

    @app.get("/api/report")
    async def report() -> Any:
        return jsonable_encoder(build_report(
            store(), records(), inv(), now=settings.clock(),
        ))

    return app


app = create_app()
