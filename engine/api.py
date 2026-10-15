"""FastAPI boundary: adapts app payloads to engine models. Run: uvicorn engine.api:app.

Endpoints are async on purpose: sqlite3 connections are bound to one thread,
so every request and the DP0 loop share the event-loop thread.
"""

import asyncio
import hmac
import json
import logging
import os
import re
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import AwareDatetime, BaseModel, Field, ValidationError

from engine import report_doc
from engine.cohorts import build_cohorts
from engine.config import RepoConfig, TargetConfig, load_config
from engine.context_builder import build_context, git_commit
from engine.evidence import evidence_graph
from engine.investigation import DEFAULT_FIXTURE, Investigation, load_investigation
from engine.journeys import journeys, mermaid, session_path
from engine.llm import LLM, LLMError
from engine.models import (
    DecisionPoint,
    Event,
    Exposure,
    InvestigationState,
    ProbePlan,
    ProbeResponse,
    Run,
    Verification,
)
from engine.narrative import facts, facts_digest, generate, template
from engine.partb import load_partb
from engine.probe import plan_probe
from engine.records import ProbeRecords
from engine.report import (
    append_successor,
    build_report,
    evaluate,
    lock_v1,
    run_dp0,
    seed_session,
    snapshots,
)
from engine.seed import seed_run
from engine.stages import InvestigationDraft, approve, run_stage_a, run_stage_b
from engine.storage import Store
from engine.workflow_view import workflow_view

log = logging.getLogger("ghostreport")
ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}")
MAX_BATCH = 100


def load_verifications(path: Path) -> tuple[Verification, ...]:
    """Written by `engine.demo verify`; a missing file means nothing is verified."""
    if not path.exists():
        return ()
    return tuple(Verification.model_validate(v)
                 for v in json.loads(path.read_text(encoding="utf-8")))


@dataclass
class Settings:
    """Environment-driven; one SQLite file per run so provenance cannot mix."""

    run_id: str = field(default_factory=lambda: os.getenv("GHOST_RUN_ID", "dev"))
    mode: str = field(default_factory=lambda: os.getenv("GHOST_MODE", "live"))
    app_build: str = field(default_factory=lambda: os.getenv("GHOST_APP_BUILD", "dev"))
    db_dir: Path = field(default_factory=lambda: Path(os.getenv("GHOST_DB_DIR", "runs")))
    fixture: Path = field(
        default_factory=lambda: Path(os.getenv("GHOST_FIXTURE", str(DEFAULT_FIXTURE))))
    config: TargetConfig = field(default_factory=lambda: (
        load_config(path) if (path := Path(os.getenv("GHOST_CONFIG", "ghostreport.yaml"))).exists()
        else TargetConfig(repo=RepoConfig(path=Path("app")))))
    target_repo: Path | None = None  # overrides config.repo.path
    ends_at: datetime = field(default_factory=lambda: datetime.fromisoformat(
        os.getenv("GHOST_ENDS_AT", "2026-10-16T18:00:00+07:00")))
    dp0_seconds: float = 30.0
    autolock: bool = False
    seed: bool = False  # add ~20 synthetic seed-* sessions once, after the lock
    operator_token: str | None = field(default_factory=lambda: os.getenv("GHOST_OPERATOR_TOKEN"))
    static_dir: Path | None = field(default_factory=lambda: (
        Path(d) if (d := os.getenv("GHOST_STATIC_DIR")) else None))
    # Live run: every plan closes this many minutes after the lock (None = plan's own ends_at).
    collection_minutes: float | None = field(default_factory=lambda: (
        float(m) if (m := os.getenv("GHOST_COLLECTION_MINUTES")) else None))
    llm: Callable[[], LLM] = LLM
    # Report narrative: "llm" writes it from the facts JSON (claim-checked), at most once per
    # data change and per interval, never per request; "template" never calls the LLM.
    narrative: str = field(default_factory=lambda: os.getenv("GHOST_NARRATIVE", "llm"))
    narrative_interval: float = 60.0
    cors_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        os.getenv("GHOST_CORS", "http://localhost:5173,http://localhost:5174").split(",")))
    clock: Callable[[], datetime] = field(default=lambda: datetime.now(UTC))

    code_commit: str = field(default_factory=lambda: git_commit(
        Path(os.getenv("GHOST_TARGET_REPO", "app"))))
    verifications: tuple[Verification, ...] = field(default_factory=lambda: load_verifications(
        Path(os.getenv("GHOST_VERIFICATION", "runs/verification.json"))))
    # Public runs can host sandboxes (engine/sandbox.py): one simulated run per visitor,
    # each in its own directory under this root. None disables the hub.
    sandbox_root: Path | None = None
    sandbox: Any = None  # set on a sandbox run: its runtime (owner, budget, generator)

    def run(self) -> Run:
        return Run(
            run_id=self.run_id, mode=self.mode,
            code_commit=self.code_commit, app_build=self.app_build,
            verifications=self.verifications,
        )


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


def _clean_event(raw: Any, received_at: datetime, config: TargetConfig) -> Event:
    """Name mapping, privacy whitelist, then the canonical model.

    `page` in props duplicates the top-level field and is dropped.
    """
    if not isinstance(raw, dict):
        raise ValueError("event must be an object")
    name = config.canonical_event(str(raw.get("event")))
    if name is None:
        raise ValueError(f"unmapped event {raw.get('event')!r}: add it to ghostreport.yaml events")
    raw = {**raw, "event": name}
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


@dataclass(frozen=True)
class Ghost:
    """One run's internals, for code that drives the run without HTTP (sandboxes)."""

    settings: Settings
    inv: Callable[[], Investigation]
    store: Callable[[], Store]
    records: Callable[[], ProbeRecords]
    startup: Callable[[], None]
    shutdown: Callable[[], None]
    locked: Callable[[], bool]
    lock: Callable[[], tuple[InvestigationState, str]]
    serve_plan: Callable[[DecisionPoint], ProbePlan | None]
    accept_event: Callable[[Any], bool]
    accept_exposure: Callable[[Any], str]
    accept_response: Callable[[Any], str]
    set_investigation: Callable[[Investigation], None]
    draft_path: Path
    approved_path: Path


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

    def operator(authorization: Annotated[str | None, Header()] = None) -> None:
        """Operator-only routes. Public modes (demo, live, sandbox) require a token."""
        token = settings.operator_token
        if token is None:
            if settings.mode in ("demo", "live", "sandbox"):
                raise HTTPException(403, "operator routes are disabled on public runs")
            return
        if not hmac.compare_digest(authorization or "", f"Bearer {token}"):
            raise HTTPException(401, "operator token required")

    def serve_locked(v1: InvestigationState) -> None:
        """After the lock, serve what v1 locked; a later edit of the approved file is ignored."""
        locked = Investigation.from_locked(v1)
        if (locked.questions, locked.plans) != (inv().questions, inv().plans):
            log.warning("approved investigation differs from locked v1; serving v1")
        state["investigation"] = locked

    def do_lock() -> tuple[InvestigationState, str]:
        snapshot, digest = lock_v1(store(), records(), inv(), now=settings.clock(),
                                   collection_minutes=settings.collection_minutes)
        serve_locked(snapshot)
        log.warning("v1 LOCKED  digest=%s  cutoff=%s", digest, snapshot.data_cutoff.isoformat())
        return snapshot, digest

    narratives: dict[str, dict[str, Any]] = {}  # facts digest → checked result
    writer: dict[str, Any] = {"task": None, "last": float("-inf")}

    def report_facts(body: dict[str, Any]) -> dict[str, Any]:
        return facts(body["current"], inv().hypotheses.hypotheses, locked=body["locked"])

    def write_narrative(value: dict[str, Any]) -> None:
        """Start one background LLM write for these facts, if allowed and not throttled."""
        digest = facts_digest(value)
        task = writer["task"]
        if (settings.narrative != "llm" or digest in narratives
                or (task is not None and not task.done())
                or time.monotonic() - writer["last"] < settings.narrative_interval):
            return
        writer["last"] = time.monotonic()

        async def run() -> None:
            # The LLM's sqlite cache is thread-bound: create it in the worker thread.
            result = await asyncio.to_thread(lambda: generate(settings.llm(), value))
            if any(reason.startswith("llm:") for reason in result["rejected"]):
                # Transport or API failure: keep serving the template, retry next interval.
                log.warning("narrative LLM unavailable for facts %s: %s", digest[:12],
                            result["rejected"][0])
                return
            narratives[digest] = result
            log.warning("narrative %s for facts %s (%d rejected)", result["source"],
                        digest[:12], len(result["rejected"]))

        writer["task"] = asyncio.create_task(run())

    def narrative_view(body: dict[str, Any]) -> dict[str, Any]:
        value = report_facts(body)
        digest = facts_digest(value)
        result = narratives.get(digest)
        if result is None:
            write_narrative(value)
            result = {"text": template(value), "source": "template", "rejected": [],
                      "pending": settings.narrative == "llm"}
        public = {k: v for k, v in result.items() if k != "llm_text"}  # unchecked text
        return {**public, "facts_sha256": digest, "facts": value}

    # Investigation document: one checked Markdown document per evidence snapshot (context
    # digest), appended to a JSONL log so a served document can be checked again later.
    documents_path = settings.db_dir / f"{settings.run_id}.documents.jsonl"
    documents: dict[str, dict[str, Any]] = {}
    if documents_path.exists():
        for line in documents_path.read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            documents[record["context_sha256"]] = record
    doc_writer: dict[str, Any] = {"task": None, "last": float("-inf")}

    def document_context(body: dict[str, Any]) -> dict[str, Any]:
        return report_doc.context(jsonable_encoder(body))

    def write_document(value: dict[str, Any]) -> None:
        """Start one background LLM write for this snapshot, if allowed and not throttled."""
        digest = report_doc.digest(value)
        task = doc_writer["task"]
        if (settings.narrative != "llm" or digest in documents
                or (task is not None and not task.done())
                or time.monotonic() - doc_writer["last"] < settings.narrative_interval):
            return
        doc_writer["last"] = time.monotonic()

        async def run() -> None:
            result = await asyncio.to_thread(lambda: report_doc.generate(settings.llm(), value))
            if any(reason.startswith("llm:") for reason in result["rejected"]):
                log.warning("document LLM unavailable for snapshot %s: %s", digest[:12],
                            result["rejected"][0])
                return
            record = {**result, "context_sha256": digest, "snapshot_id": digest[:16],
                      "generated_at": settings.clock().isoformat(),
                      "prompt": "{}.v{}".format(*report_doc.DOCUMENT)}
            documents[digest] = record
            documents_path.parent.mkdir(parents=True, exist_ok=True)
            with documents_path.open("a", encoding="utf-8") as log_file:
                log_file.write(json.dumps(record, ensure_ascii=False) + "\n")
            log.warning("document %s for snapshot %s (%d rejected)", result["source"],
                        digest[:12], len(result["rejected"]))

        doc_writer["task"] = asyncio.create_task(run())

    def document_view(body: dict[str, Any]) -> dict[str, Any]:
        value = document_context(body)
        digest = report_doc.digest(value)
        record = documents.get(digest)
        if record is None:
            write_document(value)
            record = {"markdown": report_doc.template(value), "source": "template",
                      "rejected": [], "pending": settings.narrative == "llm",
                      "context_sha256": digest, "snapshot_id": digest[:16],
                      "generated_at": None, "prompt": None}
        return {**record, "title": value["title"], "investigation_id": value["investigation_id"],
                "outline": list(report_doc.OUTLINE), "facts": value["facts"]}

    async def dp0_loop() -> None:
        while True:
            await asyncio.sleep(settings.dp0_seconds)
            try:
                run_dp0(store(), records(), inv(), now=settings.clock())
                body = build_report(store(), records(), inv(), now=settings.clock())
                write_narrative(report_facts(body))
                write_document(document_context(body))
            except Exception:  # noqa: BLE001 - keep the loop alive; the trace shows gaps
                log.exception("DP0 evaluation failed")

    def startup() -> None:
        """Open this run's store; a sandbox hub calls it directly (mounted apps get no lifespan)."""
        settings.db_dir.mkdir(parents=True, exist_ok=True)
        state["store"] = Store(settings.db_dir / f"{settings.run_id}.sqlite", settings.run())
        state["records"] = ProbeRecords(state["store"].connection)
        if settings.autolock:
            do_lock()
        chain = snapshots(state["store"], inv().investigation_id)
        if chain:
            serve_locked(chain[0][0])
            if settings.seed:
                seeded = seed_run(state["store"], state["records"], inv(), settings.clock)
                if seeded:
                    log.warning("seeded %d synthetic sessions (seed-*)", seeded)

    def shutdown() -> None:
        state["store"].connection.close()

    hub: Any = None  # the sandbox hub, when this public run hosts sandboxes

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        startup()
        task = asyncio.create_task(dp0_loop()) if settings.dp0_seconds > 0 else None
        try:
            yield
        finally:
            if task:
                task.cancel()
            if hub is not None:
                hub.close_all()
            shutdown()

    app = FastAPI(title="GhostReport engine", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "run": store().run.summary(),
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
                if store().ingest(_clean_event(raw, now, settings.config)):
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
        plan = serve_plan(decision_point)
        return None if plan is None else _client_plan(inv(), plan.plan_id)

    def serve_plan(decision_point: DecisionPoint) -> ProbePlan | None:
        """The approved plan an exit may show now: locked, open, under target and budget."""
        if not snapshots(store(), inv().investigation_id):
            return None
        plan = inv().plan_for(decision_point)
        if plan is None:
            return None
        exposures = [e for e in records().exposures() if e.plan_id == plan.plan_id]
        ids = {e.exposure_id for e in exposures}
        answered = sum(not r.skipped for r in records().responses() if r.exposure_id in ids)
        return plan_probe(plan, inv().question(plan), inv().hypotheses,
                          now=settings.clock(), answered=answered, shown=len(exposures))

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

    def accept_exposure(raw: Any) -> str:
        """What ProbeCard's beacon goes through; raises ValidationError or ValueError."""
        item = ExposureIn.model_validate(raw)
        recorded = records().add_exposure(
            _exposure(item, "beacon"), client_payload=json.dumps(raw, default=str),
            received_at=settings.clock(),
        )
        return "recorded" if recorded else "duplicate"

    def accept_response(raw: Any) -> str:
        """An answer or skip; infers the exposure when its beacon was lost."""
        item = ResponseIn.model_validate(raw)
        now = settings.clock()
        inferred = False
        if not records().has_exposure(item.exposure_id) and item.plan_id:
            records().add_exposure(_exposure(item, "inferred_from_response"),
                                   client_payload=json.dumps(raw, default=str), received_at=now)
            inferred = True
        recorded = records().add_response(ProbeResponse(
            exposure_id=item.exposure_id, option_ids=tuple(item.option_ids),
            skipped=item.skipped, responded_at=item.responded_at,
        ), received_at=now)
        return "duplicate" if not recorded else "recorded_inferred" if inferred else "recorded"

    def accept_event(raw: Any) -> bool:
        """The ingest path of POST /api/events for one event; False for a duplicate."""
        return store().ingest(_clean_event(raw, settings.clock(), settings.config))

    @app.post("/api/probe/exposure")
    async def exposure(request: Request) -> dict[str, str]:
        raw = await _json(request)
        try:
            status = accept_exposure(raw)
        except (ValidationError, ValueError) as error:
            raise HTTPException(422, str(error)) from error
        return {"status": status}

    @app.post("/api/probe/response")
    async def response(request: Request) -> dict[str, str]:
        raw = await _json(request)
        try:
            status = accept_response(raw)
        except (ValidationError, ValueError) as error:
            raise HTTPException(422, str(error)) from error
        return {"status": status}

    @app.post("/api/lock", dependencies=[Depends(operator)])
    async def lock() -> dict[str, Any]:
        """Show this digest outside the system (mentor/judge) before the first probe."""
        snapshot, digest = do_lock()
        return {"version": 1, "digest": digest, "data_cutoff": snapshot.data_cutoff}

    @app.post("/api/snapshot", dependencies=[Depends(operator)])
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

    @app.post("/api/analyze", dependencies=[Depends(operator)])
    async def analyze() -> Any:
        """Stage A + B on the configured target repo; the result is a draft, not approved."""
        if locked():
            raise HTTPException(409, "v1 is locked; hypotheses cannot change")
        current = evaluate(store(), records(), inv(), now=settings.clock())
        stats = {"funnel": current["funnel"], "cohorts": current["cohorts"]}

        def work() -> InvestigationDraft:
            root = settings.target_repo or settings.config.repo.path
            pack = build_context(root, keywords=settings.config.workflow.keywords,
                                 include=settings.config.repo.include,
                                 exclude=settings.config.repo.exclude,
                                 analytics_calls=settings.config.analytics.calls)
            llm = settings.llm()
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

    @app.post("/api/approve", dependencies=[Depends(operator)])
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
        body = build_report(store(), records(), inv(), now=settings.clock())
        return jsonable_encoder({**body, "narrative": narrative_view(body)})

    @app.get("/api/report/document")
    async def report_document() -> Any:
        """The investigation as one Markdown document, its facts and their snapshot digest."""
        body = build_report(store(), records(), inv(), now=settings.clock())
        return jsonable_encoder(document_view(body))

    @app.get("/api/seed-sessions/{session_id}")
    async def seed_session_view(session_id: str) -> Any:
        """A simulated (seed-*) session's server-received events, cohort and probe result."""
        body = seed_session(store(), records(), inv(), session_id, now=settings.clock())
        if body is None:
            raise HTTPException(404, "only existing seed sessions are served")
        return jsonable_encoder(body)

    @app.get("/api/journeys", response_model=None)
    async def journey_graph(
        source: Literal["seed", "test", "visitor"] | None = None,
        format: Literal["json", "mermaid"] = "json",  # noqa: A002 - query parameter name
    ) -> Any:
        """Sessions → segments as a left-to-right flowchart; counts only, no session IDs."""
        events = store().events()
        sessions = build_cohorts(events, settings.clock(),
                                 build_verified=store().run.build_verified)
        graph = journeys(events, sessions, records().exposures(), records().responses(),
                         only=source)
        if format == "mermaid":
            return PlainTextResponse(mermaid(graph))
        return graph

    @app.get("/api/journeys/session/{session_id}")
    async def journey_session(session_id: str) -> Any:
        """The caller's own path; needs the session's own ID, returns no other session."""
        events = store().events()
        sessions = build_cohorts(events, settings.clock(),
                                 build_verified=store().run.build_verified)
        body = session_path(session_id, events, sessions, records().exposures(),
                            records().responses())
        if body is None:
            raise HTTPException(404, "no such session in this run")
        return body

    @app.get("/api/evidence")
    async def evidence() -> Any:
        """Hypothesis evidence map: code → hypotheses → options / R2 → findings → segment."""
        current = evaluate(store(), records(), inv(), now=settings.clock())
        return jsonable_encoder(evidence_graph(inv(), current["findings"]))

    @app.get("/api/workflow")
    async def workflow(target: Literal["app", "ens"] = "app") -> Any:
        """Validated WorkflowMap nodes for the Workflow Map tab (no layout, no edges)."""
        return workflow_view(target, inv())

    @app.get("/api/partb")
    async def partb() -> Any:
        """The committed code-only run on ens-app-v3; static, no LLM call."""
        return load_partb()

    app.state.ghost = Ghost(
        settings=settings, inv=inv, store=store, records=records, startup=startup,
        shutdown=shutdown, locked=locked, lock=do_lock, serve_plan=serve_plan,
        accept_event=accept_event, accept_exposure=accept_exposure,
        accept_response=accept_response, draft_path=draft_path, approved_path=approved_path,
        set_investigation=lambda value: state.__setitem__("investigation", value),
    )
    if settings.mode == "sandbox":
        from engine.sandbox import add_sandbox_routes

        add_sandbox_routes(app, app.state.ghost)
    elif settings.sandbox_root is not None and settings.mode in ("demo", "live"):
        from engine.sandbox import SandboxHub, add_hub_routes

        hub = SandboxHub(settings)
        add_hub_routes(app, hub)

    if settings.static_dir is not None:
        # One origin for judges: landing at /, the target app at /app/, the report at /report/.
        for prefix in ("/app", "/report"):
            # Judges type "/report"; the mounted apps live under the trailing slash.
            app.add_api_route(prefix, lambda prefix=prefix: RedirectResponse(f"{prefix}/"),
                              include_in_schema=False)
        for prefix, folder in (("/app", "app"), ("/report", "console"), ("/", "landing")):
            directory = settings.static_dir / folder
            if directory.is_dir():
                app.mount(prefix, StaticFiles(directory=directory, html=True), name=folder)
    return app


app = create_app()
