"""Isolated ENS report exercises using authored synthetic events and feedback.

Nothing here executes ENS, verifies instrumentation, or writes the demo store.
Approved journeys classify generated event sequences; feedback is sampled
independently from their classification. The baseline is frozen before load.
"""

import hashlib
import json
import random
import secrets
import sqlite3
from collections import Counter
from collections.abc import Callable
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from engine.journey_api import JourneySpecs, vocabulary
from engine.segment_spec import SegmentSpec, assignment, digest

PREFIX = "/api/ens/simulations"
LIMIT = 1000
OPTIONS = [
    {"id": "details", "hypothesis_id": "H_sim_details",
     "label": "I wanted to explore registration details"},
    {"id": "permission", "hypothesis_id": "H_sim_permission",
     "label": "I wanted to understand the wallet request"},
    {"id": "cost", "hypothesis_id": "H_sim_cost",
     "label": "I wanted to review the transaction cost"},
    {"id": "other", "hypothesis_id": "H_other", "label": "Something else"},
]
QUESTION = {"version": "ens-synthetic-v1",
            "stem": "What best describes why you stopped this simulated registration flow?",
            "source": "Authored simulation fixture, not an ENS research question",
            "options": OPTIONS}
PATHS = [
    ("Details only", ["register:info"]),
    ("Profile submitted", ["register:info", "register:profile"]),
    ("Commit failed", ["register:info", "register:profile", "transaction:commit:send",
                       "transaction:commit:fail"]),
    ("Commit sent", ["register:info", "register:profile", "transaction:commit:send"]),
    ("Registration failed", ["register:info", "register:profile", "transaction:commit:send",
                             "transaction:commit:complete", "transaction:register:send",
                             "transaction:register:fail"]),
    ("Registration completed", ["register:info", "register:profile", "transaction:commit:send",
                                "transaction:commit:complete", "transaction:register:send",
                                "transaction:register:complete", "register:complete"]),
    ("Registration override", ["register:info", "transaction:commit:send",
                               "transaction:register:override", "transaction:register:send"]),
    ("Registration reset", ["register:transaction_reset"]),
]


class Load(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_id: str = Field(pattern=r"^[A-Za-z0-9_-]{8,100}$")
    n: int = Field(default=20, ge=1, le=200, strict=True)
    seed: int = Field(default=42, ge=0, le=2**31 - 1)
    feedback: Literal["mixed", "answered", "skipped", "unanswered", "not_shown"] = "mixed"
    preset: Literal["mixed", "details", "permission", "cost", "other"] = "mixed"


def make_sessions(body: Load, now: datetime, allowed: list[str],
                  question: dict[str, Any], paths: list[Any]) -> list[dict[str, Any]]:
    options_spec = question["options"]
    unknown = {e for _, path in paths for e in path} - set(allowed)
    if unknown:
        raise ValueError("Simulation paths use events outside the checked ENS vocabulary")
    rng = random.Random(body.seed)
    rows = []
    for index in range(body.n):
        label, names = rng.choice(paths)
        sid = "synthetic-ens-" + uuid4().hex
        start = now - timedelta(seconds=30 + index)
        events = [{"event_id": str(uuid4()), "session_id": sid, "seq": seq,
                   "event": name, "occurred_at": (start + timedelta(seconds=seq)).isoformat(),
                   "received_at": now.isoformat(), "schema_version": 1,
                   "page": "ENS simulation", "props": {},
                   "source": "synthetic", "synthetic": True}
                  for seq, name in enumerate(names, 1)]
        completed = "transaction:register:complete" in names
        exit_type = "inactive" if rng.random() < 0.2 else "explicit_exit"
        eligible = not completed and exit_type == "explicit_exit"
        shown = eligible and body.feedback != "not_shown" and (
            body.feedback != "mixed" or rng.random() < 0.9)
        exposure = response = None
        if shown:
            options = [o["id"] for o in options_spec if o["id"] != "other"]
            rng.shuffle(options)
            options.append("other")
            shown_at = start + timedelta(seconds=len(names) + 1)
            exposure = {"exposure_id": str(uuid4()), "question_version": question["version"],
                        "shown_at": shown_at.isoformat(), "event_seq_at_shown": len(names),
                        "options_shown": options, "source": "synthetic", "synthetic": True}
            outcome: str = body.feedback
            if outcome == "mixed":
                outcome = rng.choices(["answered", "skipped", "unanswered"], [7, 1, 2])[0]
            if outcome != "unanswered":
                # Sampling is not conditioned on the journey rule or its segment.
                chosen = rng.choice([o["id"] for o in options_spec]) \
                    if body.preset == "mixed" else body.preset
                response = {"exposure_id": exposure["exposure_id"],
                            "option_ids": [chosen] if outcome == "answered" else [],
                            "skipped": outcome == "skipped",
                            "responded_at": (shown_at + timedelta(seconds=1)).isoformat(),
                            "source": "synthetic", "synthetic": True}
        rows.append({"session_id": sid, "source": "synthetic", "synthetic": True,
                     "scenario": label, "events": events, "exit_type": exit_type,
                     "eligible": eligible, "exposure": exposure, "response": response})
    return rows


def build_report(meta: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    spec = SegmentSpec.model_validate(meta["spec"])
    groups: Counter[str] = Counter()
    paths: Counter[tuple[str, ...]] = Counter()
    feedback_groups: dict[str, list[dict[str, Any]]] = {}
    counts: Counter[str] = Counter()
    for row in rows:
        names = [e["event"] for e in row["events"]]
        _, segment = assignment(spec, names, False)
        groups[segment] += 1
        paths[tuple(names)] += 1
        counts["eligible"] += bool(row["eligible"])
        counts["inactive"] += row["exit_type"] == "inactive"
        if row["exposure"]:
            counts["shown"] += 1
            response = row["response"]
            if response is None:
                counts["shown_no_response"] += 1
            elif response["skipped"]:
                counts["skipped"] += 1
            else:
                counts["answered"] += 1
                feedback_groups.setdefault(segment, []).append(response)
    segment_defs = [(s.id, s.label) for s in spec.segments]
    if groups["unknown_coverage"]:
        segment_defs.append(("unknown_coverage", "Unknown coverage"))
    findings = []
    for segment_id, segment_label in segment_defs:
        answers = feedback_groups.get(segment_id, [])
        for option in meta["question"]["options"]:
            k = sum(option["id"] in r["option_ids"] for r in answers)
            n = len(answers)
            label = "Unresolved" if n < 3 else (
                "Selected by at least half (synthetic)" if k * 2 >= n
                else "Selected (synthetic)" if k else "Not selected (synthetic)")
            findings.append({"segment": segment_id, "segment_label": segment_label,
                             "hypothesis_id": option["hypothesis_id"],
                             "option_id": option["id"], "label": option["label"],
                             "selected": k, "respondents": n, "status": label,
                             "text": f"{k} of {n} respondents selected this simulated option.",
                             "source": "synthetic", "evidence_conflict": False,
                             "observation": "Not assessed: no verified ENS instrumentation"})
    total = len(rows)
    return {"simulation_id": meta["simulation_id"], "mode": "synthetic",
            "source": "synthetic", "project": "ens", "created_at": meta["created_at"],
            "data_version": digest(rows), "v1_digest": meta["v1_digest"],
            "journey_digest": meta["journey_digest"], "question": meta["question"],
            "population": {"synthetic": total, "visitor": 0,
                           "text": f"{total} of {total} sessions are synthetic; no visitor data."},
            "summary": f"Synthetic ENS report exercise. {total} of {total} sessions "
                       f"were generated. {counts['answered']} of {counts['shown']} sessions "
                       "answered the simulated question. No ENS application was executed.",
            "segments": [{"id": sid, "label": label, "sessions": groups[sid],
                          "total_sessions": total,
                          "text": f"{groups[sid]} of {total} sessions"}
                         for sid, label in segment_defs],
            "coverage": {**{k: counts[k] for k in (
                "eligible", "shown", "answered", "skipped", "shown_no_response", "inactive")},
                "not_shown": counts["eligible"] - counts["shown"],
                "not_asked": total - counts["shown"], "total_sessions": total,
                "instrumentation": "unverified"},
            "v1": {"status": "Unresolved", "findings": [], "digest": meta["v1_digest"]},
            "findings": findings,
            "paths": [{"events": list(path), "sessions": n, "total_sessions": total,
                       "text": f"{n} of {total} sessions"} for path, n in paths.most_common()],
            "examples": rows[-10:], "limit": LIMIT, "remaining": LIMIT - total,
            "limitations": [
                "Events and feedback are generated fixtures, not ENS visitor observations.",
                "No ENS application or Playwright browser is executed by this mode.",
                "Feedback options are authored simulation presets, not approved ENS hypotheses.",
                "Feedback is sampled independently of journey classification.",
                "No causal or instrumentation-absence conclusions can be drawn from this dataset.",
                "Inactive and completed sessions are not asked; skips and nonresponse are excluded "
                "from respondent denominators.",
                "There is no generalization to real ENS users or wallets.",
            ], "errors": []}


class Simulations:
    def __init__(self, path: Path, clock: Callable[[], datetime], journeys: JourneySpecs) -> None:
        self.path, self.clock, self.journeys = path, clock, journeys

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path)
        db.execute("PRAGMA foreign_keys=ON")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS simulations (
                id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, meta TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                simulation_id TEXT REFERENCES simulations(id),
                id TEXT PRIMARY KEY, data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS batches (
                simulation_id TEXT REFERENCES simulations(id), id TEXT, digest TEXT NOT NULL,
                PRIMARY KEY (simulation_id, id)
            );
        """)
        return db

    def create(self) -> dict[str, Any]:
        view = self.journeys.view("ens")
        approved = view["approved"]
        if not approved:
            raise HTTPException(
                409, "Approve the ENS journey definitions before creating a simulation")
        workflow, _, _ = self.journeys.snapshot("ens")
        sid, token = "ens-sim-" + secrets.token_hex(12), secrets.token_urlsafe(32)
        baseline = {"spec": approved["spec"], "journey_digest": approved["digest"],
                    "workflow": workflow, "question": QUESTION,
                    "event_vocabulary": vocabulary(workflow), "paths": PATHS}
        meta = {**baseline, "simulation_id": sid, "created_at": self.clock().isoformat(),
                "v1_digest": digest(baseline)}
        db = self.connect()
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                if db.execute("SELECT COUNT(*) FROM simulations").fetchone()[0] >= 100:
                    raise HTTPException(429, "The local ENS simulation limit has been reached")
                db.execute("INSERT INTO simulations VALUES (?, ?, ?)", (
                    sid, hashlib.sha256(token.encode()).hexdigest(), json.dumps(meta)))
        finally:
            db.close()
        return {"simulation_id": sid, "token": token, "report": build_report(meta, [])}

    def read(self, sid: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        db = self.connect()
        try:
            found = db.execute("SELECT meta FROM simulations WHERE id = ?", (sid,)).fetchone()
            if not found:
                raise HTTPException(404, "ENS simulation not found")
            rows = [json.loads(r[0]) for r in db.execute(
                "SELECT data FROM sessions WHERE simulation_id = ? ORDER BY rowid", (sid,))]
            return json.loads(found[0]), rows
        finally:
            db.close()

    def load(self, sid: str, body: Load, authorization: str | None) -> dict[str, Any]:
        supplied = (authorization or "").removeprefix("Bearer ")
        db = self.connect()
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                found = db.execute("SELECT token_hash, meta FROM simulations WHERE id = ?",
                                   (sid,)).fetchone()
                if not found:
                    raise HTTPException(404, "ENS simulation not found")
                token_hash = hashlib.sha256(supplied.encode()).hexdigest()
                if not secrets.compare_digest(found[0], token_hash):
                    raise HTTPException(401, "Only this simulation's owner can add load")
                prior = db.execute("SELECT digest FROM batches WHERE simulation_id = ? AND id = ?",
                                   (sid, body.batch_id)).fetchone()
                params = digest(body.model_dump(mode="json"))
                if prior and prior[0] != params:
                    raise HTTPException(409, "Batch ID already used with different parameters")
                if not prior:
                    count = db.execute("SELECT COUNT(*) FROM sessions WHERE simulation_id = ?",
                                       (sid,)).fetchone()[0]
                    if count + body.n > LIMIT:
                        raise HTTPException(409, "This simulation has reached its session limit")
                    try:
                        meta = json.loads(found[1])
                        rows = make_sessions(body, self.clock(), meta["event_vocabulary"],
                                             meta["question"], meta["paths"])
                    except ValueError as error:
                        raise HTTPException(409, str(error)) from error
                    db.executemany("INSERT INTO sessions VALUES (?, ?, ?)", (
                        (sid, r["session_id"], json.dumps(r)) for r in rows))
                    db.execute("INSERT INTO batches VALUES (?, ?, ?)", (sid, body.batch_id, params))
        finally:
            db.close()
        meta, rows = self.read(sid)
        return build_report(meta, rows)


def add_simulation_routes(app: FastAPI, journeys: JourneySpecs) -> None:
    service = Simulations(journeys.ghost.settings.db_dir / "ens-simulations.sqlite",
                          journeys.ghost.settings.clock, journeys)

    @app.post(PREFIX, status_code=201)
    def create() -> Any:
        return service.create()

    @app.get(PREFIX + "/{sid}")
    def report(sid: str) -> Any:
        meta, rows = service.read(sid)
        return build_report(meta, rows)

    @app.get(PREFIX + "/{sid}/records")
    def records(sid: str) -> Any:
        meta, rows = service.read(sid)
        return {"simulation_id": sid, "source": "synthetic", "baseline": meta, "sessions": rows}

    @app.post(PREFIX + "/{sid}/load")
    def load(sid: str, body: Load, authorization: str | None = Header(default=None)) -> Any:
        return service.load(sid, body, authorization)
