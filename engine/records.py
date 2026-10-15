"""Append-only probe and decision records stored beside the run's events."""

import sqlite3
from datetime import datetime

from engine.models import Decision, Exposure, ProbeResponse
from engine.storage import canonical_json

TABLES = ("probe_exposures", "probe_responses", "decisions")


class ProbeRecords:
    """Exposures, responses and DP0 decisions; rows are never updated or deleted."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS probe_exposures (
                exposure_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, session_id TEXT NOT NULL,
                received_at TEXT NOT NULL, client_payload TEXT NOT NULL, payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS probe_responses (
                exposure_id TEXT PRIMARY KEY, received_at TEXT NOT NULL, payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, action_id TEXT NOT NULL,
                data_version TEXT NOT NULL, decided_at TEXT NOT NULL, payload TEXT NOT NULL
            );
        """)
        for table in TABLES:
            for operation in ("UPDATE", "DELETE"):
                connection.execute(f"""
                    CREATE TRIGGER IF NOT EXISTS immutable_{table}_{operation}
                    BEFORE {operation} ON {table}
                    BEGIN SELECT RAISE(ABORT, 'append-only table'); END
                """)
        connection.commit()

    def add_exposure(
        self, exposure: Exposure, *, client_payload: str, received_at: datetime,
    ) -> bool:
        """Record the first delivery; a late beacon after an inferred exposure is a duplicate."""
        with self.connection:
            row = self.connection.execute(
                "SELECT payload FROM probe_exposures WHERE exposure_id = ?",
                (exposure.exposure_id,),
            ).fetchone()
            if row is not None:
                old = Exposure.model_validate_json(row[0])
                if (old.model_dump(exclude={"received_via"})
                        != exposure.model_dump(exclude={"received_via"})):
                    raise ValueError("exposure ID reused with different content")
                return False
            self.connection.execute(
                "INSERT INTO probe_exposures VALUES (?, ?, ?, ?, ?, ?)",
                (exposure.exposure_id, exposure.plan_id, exposure.session_id,
                 received_at.isoformat(), client_payload, canonical_json(exposure)),
            )
        return True

    def has_exposure(self, exposure_id: str) -> bool:
        return self.connection.execute(
            "SELECT 1 FROM probe_exposures WHERE exposure_id = ?", (exposure_id,),
        ).fetchone() is not None

    def add_response(self, response: ProbeResponse, *, received_at: datetime) -> bool:
        """One immutable response per exposure; identical retries are duplicates."""
        payload = canonical_json(response)
        with self.connection:
            row = self.connection.execute(
                "SELECT payload FROM probe_responses WHERE exposure_id = ?",
                (response.exposure_id,),
            ).fetchone()
            if row is not None:
                if row[0] != payload:
                    raise ValueError("one immutable response per exposure")
                return False
            self.connection.execute(
                "INSERT INTO probe_responses VALUES (?, ?, ?)",
                (response.exposure_id, received_at.isoformat(), payload),
            )
        return True

    def received_at(self, exposure_id: str) -> tuple[datetime | None, datetime | None]:
        """Server receive times of an exposure and its response (one clock for timelines)."""
        found = []
        for table in ("probe_exposures", "probe_responses"):
            row = self.connection.execute(
                f"SELECT received_at FROM {table} WHERE exposure_id = ?", (exposure_id,),
            ).fetchone()
            found.append(datetime.fromisoformat(row[0]) if row else None)
        return found[0], found[1]

    def exposures(self) -> tuple[Exposure, ...]:
        rows = self.connection.execute("SELECT payload FROM probe_exposures ORDER BY rowid")
        return tuple(Exposure.model_validate_json(row[0]) for row in rows)

    def responses(self) -> tuple[ProbeResponse, ...]:
        rows = self.connection.execute("SELECT payload FROM probe_responses ORDER BY rowid")
        return tuple(ProbeResponse.model_validate_json(row[0]) for row in rows)

    def add_decisions(self, decisions: tuple[Decision, ...], *, decided_at: datetime) -> None:
        """Every decision, including no_action, is traced with its data version."""
        with self.connection:
            self.connection.executemany(
                "INSERT INTO decisions (action_id, data_version, decided_at, payload) "
                "VALUES (?, ?, ?, ?)",
                [(d.action_id, d.data_version, decided_at.isoformat(), canonical_json(d))
                 for d in decisions],
            )

    def evaluated(self) -> frozenset[tuple[str, str]]:
        rows = self.connection.execute("SELECT DISTINCT action_id, data_version FROM decisions")
        return frozenset((row[0], row[1]) for row in rows)

    def decisions(self) -> tuple[tuple[datetime, Decision], ...]:
        rows = self.connection.execute("SELECT decided_at, payload FROM decisions ORDER BY id")
        return tuple(
            (datetime.fromisoformat(row[0]), Decision.model_validate_json(row[1])) for row in rows
        )
