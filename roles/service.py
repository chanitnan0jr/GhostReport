"""Role assignment, kept outside the engine so investigations stay blind to roles.

Run as its own process (never imported by engine/):
    ROLES_SEED=<secret> uv run uvicorn roles.service:app --port 18100

Env: ROLES_SEED (secret), REVEAL_TOKEN (guards /roles/reveal; only on this service),
ROLES_ALLOWED_ORIGINS (comma-separated; the api origin), ROLES_DB.

Assignment is 50/50 by permuted blocks of 4 (AABB shuffled per block), derived
from a secret seed. Only sha256(seed) is published, before collection starts,
so the sequence can be audited afterwards without being predictable during it.
"""

import hashlib
import os
import random
import secrets
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BLOCK = ("A", "A", "B", "B")
Role = Literal["A", "B"]


def block_roles(seed: str, block: int) -> list[str]:
    """The permutation for one block; deterministic given the secret seed."""
    rng = random.Random(hashlib.sha256(f"{seed}:{block}".encode()).digest())
    roles = list(BLOCK)
    rng.shuffle(roles)
    return roles


class AssignIn(BaseModel):
    session_id: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")


class AssignOut(BaseModel):
    role: Role


def create_app(db_path: Path | None = None, seed: str | None = None,
               reveal_token: str | None = None,
               allowed_origins: tuple[str, ...] | None = None) -> FastAPI:
    db_path = db_path or Path(os.getenv("ROLES_DB", "runs/roles.sqlite"))
    seed = seed or os.getenv("ROLES_SEED") or secrets.token_hex(16)
    reveal_token = reveal_token or os.getenv("REVEAL_TOKEN")
    if allowed_origins is None:
        allowed_origins = tuple(o for o in os.getenv("ROLES_ALLOWED_ORIGINS", "").split(",") if o)
    seed_hash = hashlib.sha256(seed.encode()).hexdigest()
    state: dict[str, sqlite3.Connection] = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(str(db_path))
        db.executescript("""
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS assignments (
                n INTEGER PRIMARY KEY, session_id TEXT UNIQUE NOT NULL,
                role TEXT NOT NULL, assigned_at TEXT NOT NULL
            );
        """)
        stored = db.execute("SELECT value FROM meta WHERE key = 'seed_hash'").fetchone()
        if stored is None:
            db.execute("INSERT INTO meta VALUES ('seed_hash', ?)", (seed_hash,))
            db.commit()
        elif stored[0] != seed_hash:
            raise RuntimeError("roles DB was started with a different seed")
        print(f"roles: seed_hash={seed_hash}", flush=True)
        state["db"] = db
        yield
        db.close()

    app = FastAPI(title="GhostReport roles", lifespan=lifespan, docs_url=None, redoc_url=None,
                  openapi_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=list(allowed_origins),
                       allow_methods=["POST"], allow_headers=["Content-Type"])

    @app.post("/roles/assign")
    async def assign(body: AssignIn) -> AssignOut:
        """Idempotent per session: a reload keeps the same card."""
        db = state["db"]
        row = db.execute("SELECT role FROM assignments WHERE session_id = ?",
                         (body.session_id,)).fetchone()
        if row is not None:
            return AssignOut(role=row[0])
        n = db.execute("SELECT COUNT(*) FROM assignments").fetchone()[0]
        role = block_roles(seed, n // len(BLOCK))[n % len(BLOCK)]
        with db:
            db.execute("INSERT INTO assignments VALUES (?, ?, ?, ?)",
                       (n, body.session_id, role, datetime.now(UTC).isoformat()))
        return AssignOut(role=role)

    @app.get("/roles/health")
    async def health() -> dict[str, object]:
        """Public: the seed hash and a count, never which session got which role."""
        count = state["db"].execute("SELECT COUNT(*) FROM assignments").fetchone()[0]
        return {"ok": True, "seed_hash": seed_hash, "assigned": count}

    @app.get("/roles/reveal")
    async def reveal(
        authorization: Annotated[str | None, Header()] = None,
    ) -> list[dict[str, object]]:
        """For E3 after collection closes; requires REVEAL_TOKEN."""
        if not reveal_token or authorization != f"Bearer {reveal_token}":
            raise HTTPException(401, "reveal token required")
        rows = state["db"].execute(
            "SELECT n, session_id, role, assigned_at FROM assignments ORDER BY n")
        return [{"n": n, "session_id": s, "role": r, "assigned_at": a} for n, s, r, a in rows]

    return app


app = create_app()
