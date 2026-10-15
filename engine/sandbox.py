"""Sandboxes: a visitor's own simulated run, so one person can watch the whole loop.

Each sandbox is a separate run (mode "sandbox", its own directory and SQLite file),
never the judging run. A hub on the public run creates sandboxes and forwards
/api/sandbox/{id}/… to that sandbox's own app, which is the normal engine app.

Traffic walks the app's flow as a state machine, sampling one branch at each step
(equal weights by default), so no impossible path is produced. Every generated event,
exposure and response goes through the same ingest, plan and exposure code as a real
visitor; only the exit-time eligibility check runs here, through engine.probe.at_exit
(the Python twin of app/src/probe.ts). What the generator chose is kept outside the
engine's evidence, in truth.jsonl, and is read back only by the Reveal panel.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import math
import os
import random
import re
import secrets
import shutil
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, model_validator
from starlette.types import ASGIApp, Receive, Scope, Send

from engine.api import Ghost, Settings, create_app
from engine.catalog import STEMS
from engine.cohorts import build_cohorts
from engine.context_builder import build_context
from engine.guards import validate_workflow
from engine.investigation import Investigation, load_investigation
from engine.llm import LLMError, deepseek_completion
from engine.models import Event, Verification
from engine.probe import at_exit, resolve_exposure
from engine.report import evaluate, run_dp0, snapshots
from engine.stages import TARGETS, InvestigationDraft, approve, run_stage_b

log = logging.getLogger("ghostreport")

BANNER = ("Simulation — answers come from the mix you set. "
          "This shows the pipeline, not real user insight.")
SANDBOX_ID = re.compile(r"^sbx-[0-9a-f]{16}$")
COMMIT = "sandbox-simulation"
# The generator emits wallet_gate_shown exactly once per gate display, so R2 can apply;
# the event-drop setting is what produces unknown coverage.
INSTRUMENTATION = ("simulated: the sandbox generator records wallet_gate_shown "
                   "once per gate display")
RPC_ERROR_RATE = 0.10  # first connect attempt of a session only, as in app/src/wallet.ts
PER_BATCH, PER_SANDBOX = 100, 300
MIN_SESSIONS = 10  # before Investigate
RUNS_PER_SANDBOX = 3  # LLM runs that reached the API; cache hits are free
COLLECTION_MINUTES = 120
MAX_ATTEMPTS = 3
WINDOW = timedelta(minutes=4)  # generated sessions happened within this long before now
PROJECTS = ("p1", "p2", "p3", "p4")
BRANCHES: dict[str, dict[str, float]] = {
    "project": {"back": 1.0, "apply": 1.0, "idle": 1.0},
    "gate": {"not_now": 1.0, "connect": 1.0, "idle": 1.0},
    "wallet": {"approve": 1.0, "reject": 1.0},  # reject sends no event: not instrumented
    "after_failure": {"retry": 1.0, "not_now": 1.0, "idle": 1.0},
}
# What the hub forwards: public reads, and the owner's controls.
READS = re.compile(
    r"^(report|report/document|journeys|journeys/session/[^/]+|evidence|workflow"
    r"|seed-sessions/[^/]+|sessions/[^/]+|health|draft)$")
CONTROLS = {"state": "GET", "reveal": "GET", "traffic": "POST", "investigate": "POST",
            "lock": "POST"}
DecisionPoint = Literal["DP1", "DP2"]
Step = tuple[str, str, str | None, float]  # event, page, attempt key, seconds after previous


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def normalize(base: dict[str, float], given: dict[str, float] | None, what: str,
              *, missing: float | None = None) -> dict[str, float]:
    """Relative weights → shares. Unknown keys, negative or all-zero weights are errors.

    A key left out keeps its base weight, or `missing` when one is given.
    """
    given = given or {}
    unknown = sorted(set(given) - set(base))
    if unknown:
        raise ValueError(f"unknown {what}: {', '.join(unknown)}")
    merged = {key: float(given[key]) if key in given else
              (base[key] if missing is None else missing) for key in base}
    if any(not math.isfinite(w) or w < 0 for w in merged.values()):
        raise ValueError(f"{what} weights must be finite and not negative")
    total = sum(merged.values())
    if total <= 0:
        raise ValueError(f"{what} weights cannot all be zero")
    return {key: w / total for key, w in merged.items()}


def pick(rng: random.Random, weights: dict[str, float], fallback: str = "idle") -> str:
    total = sum(weights.values())
    if total <= 0:
        return fallback
    roll, cumulative = rng.random() * total, 0.0
    for key, weight in weights.items():
        cumulative += weight
        if roll < cumulative:
            return key
    return next(k for k, w in reversed(weights.items()) if w > 0)


def walk(rng: random.Random, branches: dict[str, dict[str, float]]) -> tuple[list[Step], str]:
    """One session through the app's flow; returns its steps and how it ended.

    ProjectPage → back / Apply / idle; the gate → Not now / Connect / idle; the wallet
    → approve (an RPC error on the session's first attempt at RPC_ERROR_RATE) or
    reject, which records nothing; after a failure → retry / Not now / idle.
    """
    def gap(low: float = 1.5, high: float = 6.0) -> float:
        return rng.uniform(low, high)

    steps: list[Step] = [("project_viewed", "ProjectPage", None, 0.0)]
    choice = pick(rng, branches["project"])
    if choice == "back":
        steps.append(("back_nav", "ProjectPage", None, gap()))
        return steps, "back"
    if choice == "idle":
        return steps, "idle"
    steps.append(("apply_clicked", "ProjectPage", None, gap()))
    steps.append(("wallet_gate_shown", "ApplyModal", None, 0.3))
    choice, attempts, pause = pick(rng, branches["gate"]), 0, gap()
    while True:
        if choice == "not_now":
            steps.append(("not_now_clicked", "ApplyModal", None, pause))
            return steps, "not_now"
        if choice == "idle":
            return steps, "idle"
        attempts += 1
        key = f"a{attempts}"
        steps.append(("wallet_attempted", "ApplyModal", key, pause))
        if pick(rng, branches["wallet"]) == "approve":
            if attempts == 1 and rng.random() < RPC_ERROR_RATE:
                steps.append(("wallet_errored", "MockWalletPopup", key, gap(1.0, 3.0)))
            else:
                steps.append(("wallet_connected", "MockWalletPopup", key, gap(1.0, 3.0)))
                return steps, "connected"
            pause = gap()
        else:
            pause = gap() + gap(1.0, 3.0)  # the reject itself leaves no event
        options = dict(branches["after_failure"])
        if attempts >= MAX_ATTEMPTS:
            options["retry"] = 0.0
        choice = pick(rng, options)
        if choice == "retry":
            choice = "connect"


def timeline(rng: random.Random, steps: list[Step], floor: datetime,
             now: datetime) -> list[datetime]:
    """Place a session's steps between `floor` and `now`, keeping their order."""
    gaps = [step[3] for step in steps]
    span = max(0.0, (now - floor).total_seconds() - 1.0)
    duration = sum(gaps)
    if duration > span > 0:
        gaps = [g * span / duration for g in gaps]
        duration = span
    start = rng.uniform(0.5, max(0.5, span - duration))
    times, offset = [], start
    for g in gaps:
        offset += g
        times.append(min(floor + timedelta(seconds=offset), now))
    return times


class TrafficIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    n: int = Field(ge=1, le=PER_BATCH)
    drop_pct: float = Field(default=0, ge=0, le=50)
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)
    branches: dict[str, dict[str, float]] | None = None
    mix: dict[DecisionPoint, dict[str, float]] | None = None
    answer_rate: float = Field(default=0.7, ge=0, le=1)
    skip_rate: float = Field(default=0.15, ge=0, le=1)

    @model_validator(mode="after")
    def rates(self) -> "TrafficIn":
        if self.answer_rate + self.skip_rate > 1 + 1e-9:
            raise ValueError("answer_rate + skip_rate cannot exceed 1")
        return self


class LockIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["ai", "prepared"]
    target_n: int = Field(default=60, ge=1, le=PER_SANDBOX)
    budget: int = Field(default=200, ge=1, le=1000)


class Capacity(RuntimeError):
    """Every sandbox slot is in use."""


@dataclass
class Sandbox:
    """One sandbox run: its files, owner, traffic history and investigation status."""

    sandbox_id: str
    root: Path
    hub: "SandboxHub"
    meta: dict[str, Any]
    app: FastAPI | None = None
    ghost: Ghost | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    task: asyncio.Task[None] | None = None

    def save(self) -> None:
        temp = self.root / "meta.json.tmp"
        temp.write_text(json.dumps(self.meta, indent=2, default=str), encoding="utf-8")
        temp.replace(self.root / "meta.json")

    def expired(self, now: datetime) -> bool:
        return now >= datetime.fromisoformat(self.meta["expires_at"])

    def running(self) -> bool:
        return self.task is not None and not self.task.done()

    def sessions_total(self) -> int:
        return sum(b["generated"] for b in self.meta["batches"])

    def truth(self) -> list[dict[str, Any]]:
        path = self.root / "truth.jsonl"
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()
                if line.strip()]

    def _ghost(self) -> Ghost:
        assert self.ghost is not None
        return self.ghost

    # Traffic ---------------------------------------------------------------------------

    def generate(self, body: TrafficIn) -> dict[str, Any]:
        """Walk `n` sessions and send what they produce through the normal paths."""
        ghost = self._ghost()
        unknown = sorted(set(body.branches or {}) - set(BRANCHES))
        if unknown:
            raise ValueError(f"unknown branch group: {', '.join(unknown)}")
        branches = {group: normalize(base, (body.branches or {}).get(group),
                                     f"{group} branch")
                    for group, base in BRANCHES.items()}
        investigation = ghost.inv()
        chain = snapshots(ghost.store(), investigation.investigation_id)
        locked = bool(chain)
        mix: dict[str, dict[str, float]] = {}
        if locked:
            for plan in investigation.plans:
                question = investigation.question(plan)
                ids = {o.id: 1.0 for o in question.options}
                given = (body.mix or {}).get(question.decision_point)
                mix[question.decision_point] = normalize(
                    ids, given, f"{question.decision_point} option",
                    missing=None if given is None else 0.0)
        seed = body.seed if body.seed is not None else secrets.randbelow(2**31)
        rng = random.Random(seed)
        now = ghost.settings.clock()
        floor = max(chain[0][0].data_cutoff, now - WINDOW) if locked else now - WINDOW
        batch = len(self.meta["batches"]) + 1
        exits = {"back": 0, "not_now": 0, "idle": 0, "connected": 0}
        probes = {"shown": 0, "answered": 0, "skipped": 0, "no_response": 0}
        sent = dropped = 0
        truth: list[dict[str, Any]] = []
        for index in range(1, body.n + 1):
            session = f"seed-b{batch}-{index:03d}"
            steps, ending = walk(rng, branches)
            times = timeline(rng, steps, floor, now)
            project = rng.choice(PROJECTS)
            client: list[Event] = []  # the browser knows every event, even lost ones
            for seq, ((name, page, key, _), at) in enumerate(zip(steps, times, strict=True),
                                                            start=1):
                raw = {"event_id": f"{session}-e{seq}", "session_id": session, "seq": seq,
                       "attempt_id": f"{session}-{key}" if key else None, "event": name,
                       "occurred_at": at.isoformat(), "page": page, "schema_version": 1,
                       "props": {"project_id": project}}
                client.append(Event.model_validate({**raw, "received_at": at}))
                if rng.random() * 100 < body.drop_pct:
                    dropped += 1
                    continue
                sent += ghost.accept_event(raw)
            exits[ending] += 1
            if not locked or ending not in ("not_now", "back"):
                continue
            point: DecisionPoint = "DP1" if ending == "not_now" else "DP2"
            served = ghost.serve_plan(point)  # what GET /api/probe-plan would serve now
            if served is None:
                continue
            shown_at = min(times[-1] + timedelta(seconds=0.4), now)
            local = build_cohorts(client, shown_at, build_verified=True)[0]
            decision = at_exit(local, served, now=shown_at, consent=True, already_asked=False,
                               in_wallet_popup=False)
            if decision.action_id != "show_probe":
                continue
            question = investigation.question(served)
            shown = [o.id for o in question.options if o.id != "other"] + ["other"]
            exposure_id = f"{session}-x"
            ghost.accept_exposure({
                "exposure_id": exposure_id, "plan_id": served.plan_id, "session_id": session,
                "shown_at": shown_at.isoformat(), "client_cohort_at_shown": local.cohort,
                "event_seq_at_shown": len(steps), "options_shown": shown,
            })
            probes["shown"] += 1
            responded_at = min(shown_at + timedelta(seconds=rng.uniform(1.5, 6.0)), now)
            roll = rng.random()
            option: str | None = None
            if roll < body.answer_rate:
                outcome = "answered"
                option = pick(rng, mix[point], fallback="other")
                ghost.accept_response({"exposure_id": exposure_id, "option_ids": [option],
                                       "responded_at": responded_at.isoformat()})
            elif roll < body.answer_rate + body.skip_rate:
                outcome = "skipped"
                ghost.accept_response({"exposure_id": exposure_id, "skipped": True,
                                       "responded_at": responded_at.isoformat()})
            else:
                outcome = "no_response"
            probes[outcome] += 1
            truth.append({"session_id": session, "batch": batch, "decision_point": point,
                          "outcome": outcome, "option_id": option})
        if truth:
            with (self.root / "truth.jsonl").open("a", encoding="utf-8") as file:
                file.writelines(json.dumps(row) + "\n" for row in truth)
        if locked:
            run_dp0(ghost.store(), ghost.records(), ghost.inv(), now=ghost.settings.clock())
        result = {
            "batch": batch, "phase": "post_lock" if locked else "pre_lock", "seed": seed,
            "generated": body.n, "sessions_total": self.sessions_total() + body.n,
            "events_sent": sent, "events_dropped": dropped, "exits": exits, "probes": probes,
            "params": {"n": body.n, "drop_pct": body.drop_pct,
                       "answer_rate": body.answer_rate, "skip_rate": body.skip_rate,
                       "branches": branches, "mix": mix},
        }
        self.meta["batches"].append(result)
        self.save()
        return result

    # Investigation ---------------------------------------------------------------------

    async def investigate(self, stats: dict[str, Any]) -> None:
        """Stage B on the snapshot taken when this started, over the reused Workflow Map."""
        ghost = self._ghost()
        settings = ghost.settings
        info = self.meta["investigate"]
        calls = [0]

        def work() -> InvestigationDraft:
            llm = settings.llm()
            base = llm.complete
            client: list[Any] = []

            def complete(messages: Any, model: str, thinking: bool) -> Any:
                if not client:  # no key, no call: a cache hit never gets here
                    client.append(base or deepseek_completion())
                calls[0] += 1
                return client[0](messages, model, thinking)

            llm.complete = complete
            root = settings.target_repo or settings.config.repo.path
            # Stage A reads only the code, which every sandbox shares: reuse the prepared
            # investigation's Workflow Map, re-checked against the code as it is now.
            workflow, stale = validate_workflow(root, load_investigation(settings.fixture).workflow)
            pack = build_context(root, keywords=settings.config.workflow.keywords,
                                 include=settings.config.repo.include,
                                 exclude=settings.config.repo.exclude,
                                 analytics_calls=settings.config.analytics.calls)
            try:
                draft = run_stage_b(llm, pack, workflow, stats, repo_root=str(root))
            except LLMError as error:
                if "validation" not in str(error):
                    raise
                # Malformed JSON twice in a row: one fresh attempt before giving up.
                draft = run_stage_b(llm, pack, workflow, stats, repo_root=str(root))
            return draft.model_copy(update={
                "rejected": {**draft.rejected, "stage_a_stale_ref": list(stale)}})

        try:
            async with self.hub.semaphore:
                draft = await asyncio.to_thread(work)
        except LLMError as error:
            info.update(status="failed", error=str(error)[:300])
        except Exception:  # noqa: BLE001 - report it; the prepared investigation still works
            log.exception("sandbox %s investigation failed", self.sandbox_id)
            info.update(status="failed",
                        error="The investigation failed. Try again or use the prepared one.")
        else:
            ghost.draft_path.write_text(draft.model_dump_json(indent=2), encoding="utf-8")
            info.update(status="done", error=None)
        finally:
            info["finished_at"] = settings.clock().isoformat()
            info["cached"] = calls[0] == 0 if info["status"] == "done" else None
            if calls[0]:
                info["runs_used"] += 1
            else:
                self.hub.refund()
            self.save()

    # Views -----------------------------------------------------------------------------

    def _questions(self, investigation: Investigation) -> list[dict[str, Any]]:
        rows = []
        for plan in investigation.plans:
            question = investigation.question(plan)
            rows.append({
                "decision_point": question.decision_point, "stem": question.stem,
                "target_cohort": plan.target_cohorts[0],
                "options": [_option(o) for o in _ordered(question.options)],
            })
        return sorted(rows, key=lambda q: q["decision_point"])

    def state(self) -> Any:
        ghost = self._ghost()
        investigation = ghost.inv()
        chain = snapshots(ghost.store(), investigation.investigation_id)
        draft_view = None
        if not chain and ghost.draft_path.exists():
            draft = InvestigationDraft.model_validate_json(
                ghost.draft_path.read_text(encoding="utf-8"))
            draft_view = {
                "hypotheses": [_hypothesis(h) for h in draft.hypotheses.hypotheses],
                "questions": [
                    {"decision_point": point, "stem": STEMS[point],
                     "target_cohort": TARGETS[point],
                     "options": [_option(o) for o in _ordered(options)]}
                    for point, options in sorted(draft.probe_options.items())],
                "rejected": draft.rejected,
            }
        locked_view = None
        if chain:
            first, digest = chain[0]
            locked_view = {
                "source": (self.meta.get("lock") or {}).get("source", "prepared"),
                "digest": digest, "data_cutoff": first.data_cutoff,
                "ends_at": min(p.ends_at for p in first.probe_plans),
                "questions": self._questions(investigation),
                "hypotheses": [_hypothesis(h) for h in investigation.hypotheses.hypotheses],
            }
        phase = ("locked" if chain else "investigating" if self.running()
                 else "draft_ready" if draft_view else "pre_lock")
        info = self.meta["investigate"]
        return jsonable_encoder({
            "sandbox_id": self.sandbox_id, "mode": "sandbox", "phase": phase,
            "created_at": self.meta["created_at"], "expires_at": self.meta["expires_at"],
            "limits": LIMITS, "sessions_total": self.sessions_total(),
            "batches": self.meta["batches"], "rpc_error_rate": RPC_ERROR_RATE,
            "banner": BANNER,
            "investigate": {**info, "runs_left": max(0, RUNS_PER_SANDBOX - info["runs_used"]),
                            "global_runs_left": self.hub.runs_left(),
                            "min_sessions": MIN_SESSIONS},
            "draft": draft_view, "locked": locked_view,
        })

    def reveal(self) -> Any:
        """The mix that was set beside what the report counted, per locked question."""
        ghost = self._ghost()
        investigation = ghost.inv()
        chain = snapshots(ghost.store(), investigation.investigation_id)
        after = [b for b in self.meta["batches"] if b["phase"] == "post_lock"]
        if not chain or not after:
            return {"available": False, "questions": []}
        now = ghost.settings.clock()
        store, records = ghost.store(), ghost.records()
        events = store.events()
        verified = store.run.build_verified
        current = evaluate(store, records, investigation, now=now)
        responses = {r.exposure_id: r for r in records.responses()}
        mixes = {b["batch"]: b["params"]["mix"] for b in after}
        statements = {h.id: h.statement for h in investigation.hypotheses.hypotheses}
        truth = self.truth()
        questions = []
        for plan in investigation.plans:
            question = investigation.question(plan)
            point, cohort = question.decision_point, plan.target_cohorts[0]
            options = _ordered(question.options)
            mine = [t for t in truth if t["decision_point"] == point]
            answered = [t for t in mine if t["outcome"] == "answered"]
            share = {o.id: 0.0 for o in options}
            for row in answered:
                for option_id, weight in mixes[row["batch"]].get(point, {}).items():
                    share[option_id] += weight / len(answered)
            if not answered:  # nothing answered yet: show the latest mix that was set
                share.update(mixes[after[-1]["batch"]].get(point, {}))
            made = {o.id: sum(t["option_id"] == o.id for t in answered) for o in options}
            counted = {o.id: 0 for o in options}
            respondents = unknown = pending = 0
            for exposure in records.exposures():
                if exposure.plan_id != plan.plan_id:
                    continue
                response = responses.get(exposure.exposure_id)
                answer = response is not None and not response.skipped
                try:
                    resolved = resolve_exposure(exposure, plan, question, events,
                                                observed_at=now, build_verified=verified)
                except ValueError:
                    continue
                if (resolved.cohort_status == "resolved"
                        and resolved.server_cohort_at_shown == cohort):
                    if answer and response is not None:
                        respondents += 1
                        for option_id in response.option_ids:
                            counted[option_id] = counted.get(option_id, 0) + 1
                elif answer:
                    unknown += resolved.cohort_status == "unknown_coverage"
                    pending += resolved.cohort_status == "pending"
            findings = [f for f in current["findings"]
                        if f["question_version"] == question.question_version
                        and f["cohort"] == cohort]
            questions.append({
                "decision_point": point, "stem": question.stem, "target_cohort": cohort,
                "generated": {"shown": len(mine), "answered": len(answered),
                              "skipped": sum(t["outcome"] == "skipped" for t in mine),
                              "no_response": sum(t["outcome"] == "no_response" for t in mine)},
                "counted": {"respondents": respondents,
                            "not_counted_unknown_coverage": unknown,
                            "not_counted_pending": pending},
                "options": [{**_option(o), "set_share": round(share[o.id], 4),
                             "generated_answers": made[o.id],
                             "counted_answers": counted.get(o.id, 0)} for o in options],
                "hypotheses": [{
                    "hypothesis_id": f["hypothesis_id"],
                    "statement": statements.get(f["hypothesis_id"], ""),
                    "expected_share": round(sum(share[o.id] for o in options
                                                if f["hypothesis_id"] in o.hypothesis_ids), 4),
                    "selected": f["selected"], "respondents": f["respondents"],
                    "self_report": f["self_report"], "observation": f["observation"],
                } for f in findings],
            })
        return jsonable_encoder({"available": True,
                                 "questions": sorted(questions,
                                                     key=lambda q: q["decision_point"])})


LIMITS = {"sessions_per_batch": PER_BATCH, "sessions_total": PER_SANDBOX,
          "investigate_runs": RUNS_PER_SANDBOX}


def _ordered(options: Any) -> list[Any]:
    """Approved options as ProbeCard shows them: "other" last."""
    return [o for o in options if o.id != "other"] + [o for o in options if o.id == "other"]


def _option(option: Any) -> dict[str, Any]:
    return {"id": option.id, "label": option.label,
            "hypothesis_ids": list(option.hypothesis_ids)}


def _hypothesis(hypothesis: Any) -> dict[str, Any]:
    return {"id": hypothesis.id, "statement": hypothesis.statement,
            "class_id": hypothesis.class_id}


class SandboxHub:
    """Creates, finds, expires and budgets sandboxes for one public run."""

    def __init__(self, base: Settings, *, ttl: timedelta | None = None,
                 max_sandboxes: int | None = None, llm_runs: int | None = None) -> None:
        assert base.sandbox_root is not None
        self.base = base
        self.root = base.sandbox_root
        self.root.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl or timedelta(minutes=_env_int("GHOST_SANDBOX_TTL_MINUTES", 180))
        self.max = max_sandboxes or _env_int("GHOST_SANDBOX_MAX", 40)
        self.llm_runs = llm_runs if llm_runs is not None else _env_int(
            "GHOST_SANDBOX_LLM_RUNS", 30)
        self.sandboxes: dict[str, Sandbox] = {}
        self.semaphore = asyncio.Semaphore(2)  # LLM investigations at once, all sandboxes
        self.budget_path = self.root / "llm_budget.json"
        self.swept = datetime.min.replace(tzinfo=base.clock().tzinfo)

    # Budget, persisted so a restart does not refill it.
    def _used(self) -> int:
        try:
            return int(json.loads(self.budget_path.read_text(encoding="utf-8"))["used"])
        except (OSError, ValueError, KeyError, TypeError):
            return 0

    def _set_used(self, used: int) -> None:
        self.budget_path.write_text(json.dumps({"used": used}), encoding="utf-8")

    def runs_left(self) -> int:
        return max(0, self.llm_runs - self._used())

    def reserve(self) -> bool:
        used = self._used()
        if used >= self.llm_runs:
            return False
        self._set_used(used + 1)
        return True

    def refund(self) -> None:
        self._set_used(max(0, self._used() - 1))

    # Lifecycle
    def _settings(self, sandbox: Sandbox) -> Settings:
        base = self.base
        created = datetime.fromisoformat(sandbox.meta["created_at"])
        return Settings(
            run_id=sandbox.sandbox_id, mode="sandbox", app_build="sandbox", db_dir=sandbox.root,
            fixture=base.fixture, config=base.config, target_repo=base.target_repo,
            dp0_seconds=0, autolock=False, seed=False,
            # Never disclosed: the judging run's operator routes stay unreachable here.
            operator_token=secrets.token_urlsafe(32), static_dir=None,
            collection_minutes=None, llm=base.llm, narrative="template",
            cors_origins=base.cors_origins, clock=base.clock, code_commit=COMMIT,
            verifications=(Verification(event="wallet_gate_shown", test=INSTRUMENTATION,
                                        commit=COMMIT, passed_at=created),),
            sandbox_root=None, sandbox=sandbox,
        )

    def _open(self, sandbox: Sandbox) -> Sandbox:
        app = create_app(self._settings(sandbox))
        ghost: Ghost = app.state.ghost
        ghost.startup()
        sandbox.app, sandbox.ghost = app, ghost
        self.sandboxes[sandbox.sandbox_id] = sandbox
        return sandbox

    def create(self) -> tuple[Sandbox, str]:
        self.sweep(force=True)
        if len(self.sandboxes) + len(self._closed()) >= self.max:
            raise Capacity
        sandbox_id, token = f"sbx-{secrets.token_hex(8)}", secrets.token_urlsafe(32)
        now = self.base.clock()
        root = self.root / sandbox_id
        root.mkdir()
        sandbox = Sandbox(sandbox_id=sandbox_id, root=root, hub=self, meta={
            "sandbox_id": sandbox_id, "token_sha256": _sha256(token),
            "created_at": now.isoformat(), "expires_at": (now + self.ttl).isoformat(),
            "batches": [], "lock": None,
            "investigate": {"status": "idle", "runs_used": 0, "error": None,
                            "started_at": None, "finished_at": None,
                            "snapshot_sessions": None, "cached": None},
        })
        sandbox.save()
        log.warning("sandbox %s created (expires %s)", sandbox_id, sandbox.meta["expires_at"])
        return self._open(sandbox), token

    def get(self, sandbox_id: str) -> Sandbox | None:
        if not SANDBOX_ID.match(sandbox_id):
            return None
        self.sweep()
        sandbox = self.sandboxes.get(sandbox_id)
        if sandbox is not None:
            return sandbox
        path = self.root / sandbox_id / "meta.json"
        if not path.exists():
            return None
        meta = json.loads(path.read_text(encoding="utf-8"))
        sandbox = Sandbox(sandbox_id=sandbox_id, root=path.parent, hub=self, meta=meta)
        if sandbox.expired(self.base.clock()):
            shutil.rmtree(sandbox.root, ignore_errors=True)
            return None
        if meta["investigate"]["status"] == "running":  # the server restarted mid-run
            meta["investigate"].update(status="failed",
                                       error="The server restarted during the investigation.")
            sandbox.save()
        return self._open(sandbox)

    def _closed(self) -> list[Path]:
        """Sandbox directories on disk that are not open in this process."""
        return [p for p in self.root.glob("sbx-*") if p.name not in self.sandboxes]

    def sweep(self, *, force: bool = False) -> None:
        """Close and delete expired sandboxes; the disk scan runs at most once a minute."""
        now = self.base.clock()
        for sandbox_id, sandbox in list(self.sandboxes.items()):
            if sandbox.expired(now):
                self.remove(sandbox_id)
        if not force and now - self.swept < timedelta(minutes=1):
            return
        self.swept = now
        for path in self._closed():
            try:
                meta = json.loads((path / "meta.json").read_text(encoding="utf-8"))
                expired = now >= datetime.fromisoformat(meta["expires_at"])
            except (OSError, ValueError, KeyError):
                expired = True
            if expired:
                shutil.rmtree(path, ignore_errors=True)

    def remove(self, sandbox_id: str) -> None:
        sandbox = self.sandboxes.pop(sandbox_id)
        if sandbox.task is not None:
            sandbox.task.cancel()
        if sandbox.ghost is not None:
            sandbox.ghost.shutdown()
        shutil.rmtree(sandbox.root, ignore_errors=True)

    def close_all(self) -> None:
        for sandbox in self.sandboxes.values():
            if sandbox.ghost is not None:
                sandbox.ghost.shutdown()
        self.sandboxes.clear()


class Forward(Response):
    """Hands the request, body unread, to the sandbox's own app."""

    def __init__(self, target: ASGIApp, scope: Scope) -> None:
        super().__init__()
        self.target, self.child = target, scope

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self.target(self.child, receive, send)


def add_hub_routes(app: FastAPI, hub: SandboxHub) -> None:
    @app.post("/api/sandbox", status_code=201)
    async def create_sandbox() -> dict[str, Any]:
        """A new simulated run for this visitor; the token controls it."""
        try:
            sandbox, token = hub.create()
        except Capacity as error:
            raise HTTPException(503, "Every sandbox is in use. Try again in a few minutes.") \
                from error
        return {"sandbox_id": sandbox.sandbox_id, "token": token,
                "expires_at": sandbox.meta["expires_at"], "limits": LIMITS}

    @app.api_route("/api/sandbox/{sandbox_id}/{rest:path}", methods=["GET", "POST"],
                   include_in_schema=False)
    async def forward(sandbox_id: str, rest: str, request: Request) -> Response:
        sandbox = hub.get(sandbox_id)
        if sandbox is None or sandbox.app is None:
            raise HTTPException(404, "This sandbox does not exist or has expired.")
        if rest in CONTROLS:
            if request.method != CONTROLS[rest]:
                raise HTTPException(405, f"use {CONTROLS[rest]}")
            path = f"/api/sandbox/{rest}"
        elif request.method == "GET" and READS.match(rest):
            path = f"/api/{rest}"
        else:
            raise HTTPException(404, "This endpoint is not available in a sandbox.")
        child = {**request.scope, "path": path, "raw_path": path.encode(), "root_path": ""}
        return Forward(sandbox.app, child)


def add_sandbox_routes(app: FastAPI, ghost: Ghost) -> None:
    """Controls of one sandbox run, reached through the hub at /api/sandbox/{id}/…."""
    sandbox: Sandbox = ghost.settings.sandbox
    hub = sandbox.hub

    def owner(authorization: Annotated[str | None, Header()] = None) -> None:
        token = (authorization or "").partition("Bearer ")[2].strip()
        if not token or not hmac.compare_digest(_sha256(token), sandbox.meta["token_sha256"]):
            raise HTTPException(401, "Only the browser that started this sandbox can change "
                                     "it. Start your own sandbox to try it.")

    @app.get("/api/sandbox/state")
    async def state() -> Any:
        return sandbox.state()

    @app.get("/api/sandbox/reveal")
    async def reveal() -> Any:
        return sandbox.reveal()

    @app.post("/api/sandbox/traffic", dependencies=[Depends(owner)])
    async def traffic(body: TrafficIn) -> Any:
        async with sandbox.lock:
            if sandbox.running():
                raise HTTPException(409, "Wait for the investigation to finish before adding "
                                         "traffic.")
            total = sandbox.sessions_total()
            if total + body.n > PER_SANDBOX:
                raise HTTPException(429, f"This sandbox has {total} simulated sessions; the "
                                         f"limit is {PER_SANDBOX}. Start a new sandbox for more.")
            try:
                result = sandbox.generate(body)
            except ValueError as error:
                raise HTTPException(422, str(error)) from error
        return jsonable_encoder(result)

    @app.post("/api/sandbox/investigate", status_code=202, dependencies=[Depends(owner)])
    async def investigate() -> dict[str, str]:
        async with sandbox.lock:
            if ghost.locked():
                raise HTTPException(409, "v1 is locked; hypotheses cannot change. Start a new "
                                         "sandbox to investigate again.")
            if sandbox.running():
                raise HTTPException(409, "An investigation is already running.")
            if sandbox.sessions_total() < MIN_SESSIONS:
                raise HTTPException(422, f"Generate at least {MIN_SESSIONS} sessions first.")
            info = sandbox.meta["investigate"]
            if info["runs_used"] >= RUNS_PER_SANDBOX:
                raise HTTPException(429, f"This sandbox has used its {RUNS_PER_SANDBOX} AI "
                                         "runs. Use the prepared investigation, or start a new "
                                         "sandbox.")
            if not hub.reserve():
                raise HTTPException(429, "The shared AI budget for sandboxes is used up. Use "
                                         "the prepared investigation.")
            now = ghost.settings.clock()
            current = evaluate(ghost.store(), ghost.records(), ghost.inv(), now=now)
            info.update(status="running", error=None, started_at=now.isoformat(),
                        finished_at=None, cached=None,
                        snapshot_sessions=len(current["sessions"]))
            sandbox.save()
            sandbox.task = asyncio.create_task(sandbox.investigate(
                {"funnel": current["funnel"], "cohorts": current["cohorts"]}))
        return {"status": "running"}

    @app.post("/api/sandbox/lock", dependencies=[Depends(owner)])
    async def lock(body: LockIn) -> Any:
        async with sandbox.lock:
            if ghost.locked():
                raise HTTPException(409, "v1 is already locked.")
            if sandbox.running():
                raise HTTPException(409, "Wait for the investigation to finish.")
            now = ghost.settings.clock()
            ends = now + timedelta(minutes=COLLECTION_MINUTES)
            if body.source == "ai":
                if not ghost.draft_path.exists():
                    raise HTTPException(409, "Run Investigate first, or use the prepared "
                                             "investigation.")
                draft = InvestigationDraft.model_validate_json(
                    ghost.draft_path.read_text(encoding="utf-8"))
                try:
                    investigation = approve(draft, approved_by="sandbox-owner", now=now,
                                            ends_at=ends, target_n=body.target_n,
                                            budget=body.budget)
                except ValueError as error:
                    raise HTTPException(422, str(error)) from error
                ghost.approved_path.write_text(
                    json.dumps(investigation.dump(), indent=2, ensure_ascii=False),
                    encoding="utf-8")
            else:
                prepared = load_investigation(ghost.settings.fixture)
                investigation = replace(prepared, plans=tuple(
                    p.model_copy(update={"ends_at": ends, "target_n": body.target_n,
                                         "budget": body.budget})
                    for p in prepared.plans))
            ghost.set_investigation(investigation)
            snapshot, digest = ghost.lock()
            sandbox.meta["lock"] = {"source": body.source, "ends_at": ends.isoformat()}
            sandbox.save()
        return jsonable_encoder({"digest": digest, "data_cutoff": snapshot.data_cutoff,
                                 "ends_at": ends, "source": body.source})
