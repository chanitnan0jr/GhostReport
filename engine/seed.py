"""Offline fallback seed (GHOST_DB_SEED=1): the same 20 sessions as scripts/seed.

The primary seed drives the real app with Playwright so events come from track().

Seeded sessions are labeled `seed-…`, written after v1 is locked with real
timestamps, and go through the same models, ingest and exposure checks as live
visitors. The report states how many sessions are seeded.
"""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Literal

from engine.investigation import Investigation
from engine.models import Event, Exposure, ProbeResponse
from engine.records import ProbeRecords
from engine.storage import Store

SEED_PREFIX = "seed-"
TEST_PREFIX = "e2e-"  # Playwright suites run against the deployed site
Source = Literal["seed", "test", "visitor"]
SOURCES: tuple[Source, ...] = ("seed", "test", "visitor")


def session_source(session_id: str) -> Source:
    """Simulated sessions are never visitors. A visitor can only hide in seed, not leave it."""
    if session_id.startswith(SEED_PREFIX):
        return "seed"
    if session_id.startswith(TEST_PREFIX):
        return "test"
    return "visitor"
Step = tuple[str, str, str | None]  # event, page, attempt key
VIEW: Step = ("project_viewed", "ProjectPage", None)
APPLY: Step = ("apply_clicked", "ProjectPage", None)
GATE: Step = ("wallet_gate_shown", "ApplyModal", None)
NOT_NOW: Step = ("not_now_clicked", "ApplyModal", None)
BACK: Step = ("back_nav", "ProjectPage", None)


def _attempt(key: str, outcome: str | None) -> list[Step]:
    steps: list[Step] = [("wallet_attempted", "ApplyModal", key)]
    if outcome:
        steps.append((outcome, "MockWalletPopup", key))
    return steps


# (count, path, decision point probed at the exit, answers by session in order;
#  an answer is a list of option positions among the non-fixed options, or "skip",
#  "requester", or None for shown-but-no-response).
Answer = list[int] | str | None
PATHS: list[tuple[int, list[Step], str | None, list[Answer]]] = [
    (6, [VIEW, BACK], "DP2", [[0], [0], [1], "skip", [0], None]),
    (7, [VIEW, APPLY, GATE, NOT_NOW], "DP1",
     [[0], [0], [1], "requester", [1], [0, 1], "skip"]),
    (3, [VIEW, APPLY, GATE, *_attempt("a1", "wallet_connected")], None, []),
    (1, [VIEW, APPLY, GATE, *_attempt("a1", "wallet_errored"),
         *_attempt("a2", "wallet_connected")], None, []),
    (1, [VIEW, APPLY, GATE, *_attempt("a1", None), NOT_NOW], None, []),  # rejected
    (2, [VIEW], None, []),  # becomes inactive after 10 minutes
]


def is_seeded(store: Store) -> bool:
    row = store.connection.execute(
        "SELECT 1 FROM events WHERE session_id LIKE ? LIMIT 1", (f"{SEED_PREFIX}%",),
    ).fetchone()
    return row is not None


def seed_run(store: Store, records: ProbeRecords, investigation: Investigation,
             clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> int:
    """Idempotent: does nothing if this run already has seeded sessions."""
    if is_seeded(store):
        return 0
    number = 0
    for count, steps, point, answers in PATHS:
        for i in range(count):
            number += 1
            session = f"{SEED_PREFIX}{number:02d}"
            for seq, (name, page, key) in enumerate(steps, start=1):
                at = clock()
                store.ingest(Event(
                    event_id=f"{session}-e{seq}", session_id=session, seq=seq,
                    attempt_id=f"{session}-{key}" if key else None, event=name,
                    occurred_at=at, received_at=at, page=page,
                    props={"project_id": f"p{1 + number % 4}"},
                ))
            plan = investigation.plan_for(point) if point else None  # type: ignore[arg-type]
            if plan is None or i >= len(answers):
                continue
            question = investigation.question(plan)
            choices = [o.id for o in question.options if o.id not in ("other", "requester")]
            shown = [*choices, *(o.id for o in question.options if o.id == "requester"), "other"]
            exposure_id = f"{session}-x"
            records.add_exposure(Exposure(
                exposure_id=exposure_id, plan_id=plan.plan_id, run_id=store.run.run_id,
                investigation_id=plan.investigation_id, question_version=plan.question_version,
                decision_point=question.decision_point, session_id=session, shown_at=clock(),
                event_seq_at_shown=len(steps), options_shown=tuple(shown),
            ), client_payload="{\"seeded\": true}", received_at=clock())
            answer = answers[i]
            if answer is None:
                continue
            if answer == "skip":
                response = ProbeResponse(exposure_id=exposure_id, skipped=True,
                                         responded_at=clock())
            else:
                ids = (["requester"] if answer == "requester" and "requester" in shown
                       else [choices[k] for k in answer if k < len(choices)]
                       if isinstance(answer, list) else ["other"])
                response = ProbeResponse(exposure_id=exposure_id, option_ids=tuple(ids),
                                         responded_at=clock())
            records.add_response(response, received_at=clock())
    return number
