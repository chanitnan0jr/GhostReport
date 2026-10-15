"""Local SQLite persistence with append-only events and anchored snapshots."""

import hashlib
import json
import sqlite3
from collections.abc import Mapping
from pathlib import Path
from types import TracebackType

from pydantic import BaseModel

from engine.catalog import validate_mappings
from engine.guards import ground_hypotheses
from engine.models import Event, InvestigationState, Run


def canonical_json(value: BaseModel | Mapping[str, object]) -> str:
    """Serialize deterministic UTF-8 JSON for hashes and durable payloads."""
    data = value.model_dump(mode="json") if isinstance(value, BaseModel) else value
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest_snapshot(state: InvestigationState, prev_sha256: str | None) -> str:
    """Bind content and predecessor together, including the data cutoff."""
    return hashlib.sha256(canonical_json({
        "state": state.model_dump(mode="json"), "prev_sha256": prev_sha256,
    }).encode()).hexdigest()


class Store:
    """One run per file. No roles table or role-service access exists here."""

    def __init__(self, path: Path | str, run: Run) -> None:
        self.run = run
        self.connection = sqlite3.connect(str(path))
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.executescript("""
            CREATE TABLE IF NOT EXISTS run (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS attempt_owners (
                attempt_id TEXT PRIMARY KEY, session_id TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, seq INTEGER NOT NULL,
                received_at TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(session_id, seq)
            );
            CREATE TABLE IF NOT EXISTS investigations (
                investigation_id TEXT NOT NULL, version INTEGER NOT NULL,
                payload TEXT NOT NULL, sha256 TEXT NOT NULL, prev_sha256 TEXT,
                PRIMARY KEY(investigation_id, version)
            );
        """)
        for table in ("run", "attempt_owners", "events", "investigations"):
            for operation in ("UPDATE", "DELETE"):
                self.connection.execute(f"""
                    CREATE TRIGGER IF NOT EXISTS immutable_{table}_{operation}
                    BEFORE {operation} ON {table}
                    BEGIN SELECT RAISE(ABORT, 'append-only table'); END
                """)
        payload = canonical_json(run)
        row = self.connection.execute("SELECT payload FROM run WHERE id = 1").fetchone()
        if row is not None and row[0] != payload:
            self.connection.close()
            raise ValueError("database already belongs to another run or build configuration")
        with self.connection:
            self.connection.execute("INSERT OR IGNORE INTO run VALUES (1, ?)", (payload,))

    def __enter__(self) -> "Store":
        return self

    def __exit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.connection.close()

    def ingest(self, event: Event) -> bool:
        """Atomically dedupe an event; receipt time may differ on retransmission."""
        payload = canonical_json(event)
        with self.connection:
            row = self.connection.execute(
                "SELECT payload FROM events WHERE event_id = ?", (event.event_id,),
            ).fetchone()
            if row is not None:
                old = Event.model_validate_json(row[0])
                if old.model_dump(exclude={"received_at"}) != event.model_dump(exclude={"received_at"}):
                    raise ValueError("event ID reused with different content")
                return False
            if event.attempt_id:
                self.connection.execute(
                    "INSERT OR IGNORE INTO attempt_owners VALUES (?, ?)",
                    (event.attempt_id, event.session_id),
                )
                owner = self.connection.execute(
                    "SELECT session_id FROM attempt_owners WHERE attempt_id = ?", (event.attempt_id,),
                ).fetchone()
                if owner is None or owner[0] != event.session_id:
                    raise ValueError("attempt belongs to another session")
            self.connection.execute(
                "INSERT INTO events VALUES (?, ?, ?, ?, ?)",
                (event.event_id, event.session_id, event.seq, event.received_at.isoformat(), payload),
            )
        return True

    def events(self) -> tuple[Event, ...]:
        """Read immutable events; cohort logic applies the authoritative cutoff."""
        rows = self.connection.execute("SELECT payload FROM events ORDER BY session_id, seq")
        return tuple(Event.model_validate_json(row[0]) for row in rows)

    def append_snapshot(self, state: InvestigationState, *, trusted_v1_digest: str | None = None) -> str:
        """Lock v1 or append a successor after checking an externally held v1 digest."""
        if state.run_id != self.run.run_id:
            raise ValueError("snapshot belongs to another run")
        validate_mappings(state.hypothesis_set, state.class_mappings)
        if ground_hypotheses(state.hypothesis_set, state.workflow) != state.hypothesis_set:
            raise ValueError("snapshot contains unresolved evidence references")
        if any(m.approved_at > state.data_cutoff for m in state.class_mappings):
            raise ValueError("class mapping approved after the snapshot cutoff")
        with self.connection:
            rows = self.connection.execute(
                "SELECT payload, sha256, prev_sha256 FROM investigations "
                "WHERE investigation_id = ? ORDER BY version", (state.investigation_id,),
            ).fetchall()
            previous: str | None = None
            previous_state: InvestigationState | None = None
            for index, row in enumerate(rows, start=1):
                stored = InvestigationState.model_validate_json(row[0])
                if (stored.version != index or row[2] != previous
                        or digest_snapshot(stored, previous) != row[1]):
                    raise ValueError("snapshot chain integrity failure")
                previous, previous_state = row[1], stored
            if state.version != len(rows) + 1:
                raise ValueError("snapshot versions must be consecutive and append-only")
            if rows:
                if trusted_v1_digest != rows[0][1]:
                    raise ValueError("external v1 digest is missing or does not match")
                first = InvestigationState.model_validate_json(rows[0][0])
                if (state.workflow != first.workflow or state.hypothesis_set != first.hypothesis_set
                        or state.class_mappings != first.class_mappings):
                    raise ValueError("locked hypotheses, workflow and class mappings cannot change")
                if previous_state is not None and state.data_cutoff < previous_state.data_cutoff:
                    raise ValueError("data cutoff cannot go backwards")
            elif state.findings:
                raise ValueError("v1 must be locked before probe findings")
            digest = digest_snapshot(state, previous)
            self.connection.execute(
                "INSERT INTO investigations VALUES (?, ?, ?, ?, ?)",
                (state.investigation_id, state.version, canonical_json(state), digest, previous),
            )
        return digest
