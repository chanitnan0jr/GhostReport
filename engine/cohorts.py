"""Session cohorts describe recorded events, independently of event coverage."""

from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime

from engine.models import EXIT_EVENTS, Cohort, Event, SessionStats


def unique_events(events: Sequence[Event]) -> tuple[Event, ...]:
    """Dedupe retransmissions; reject conflicting IDs, sequence numbers and owners."""
    by_id: dict[str, Event] = {}
    seqs: dict[tuple[str, int], str] = {}
    owners: dict[str, str] = {}
    for event in events:
        if event.event_id in by_id:
            if by_id[event.event_id] != event:
                raise ValueError("event ID reused with different content")
            continue
        key = (event.session_id, event.seq)
        if key in seqs:
            raise ValueError("session sequence reused by another event")
        if event.attempt_id:
            owner = owners.setdefault(event.attempt_id, event.session_id)
            if owner != event.session_id:
                raise ValueError("attempt belongs to another session")
        seqs[key] = event.event_id
        by_id[event.event_id] = event
    return tuple(by_id.values())


def build_cohorts(
    events: Sequence[Event], cutoff: datetime, *, build_verified: bool,
    pending_seconds: int = 60, inactive_seconds: int = 600,
) -> tuple[SessionStats, ...]:
    """Build a snapshot using server receipt cutoff, then session sequence order.

    Absence is usable only after a contiguous ProjectPage-to-exit window from
    a verified build. A new visit after the exit reopens the session window.
    """
    if cutoff.utcoffset() is None or pending_seconds <= 0 or inactive_seconds <= 0:
        raise ValueError("require aware cutoff and positive timeouts")
    groups: dict[str, list[Event]] = defaultdict(list)
    for event in unique_events(events):
        if event.received_at <= cutoff:
            groups[event.session_id].append(event)
    result: list[SessionStats] = []
    for session_id, items in sorted(groups.items()):
        ordered = sorted(items, key=lambda e: e.seq)
        attempts: dict[str, list[Event]] = defaultdict(list)
        for event in ordered:
            if event.attempt_id:
                attempts[event.attempt_id].append(event)
        states: list[str] = []
        reasons: list[str] = []
        for index, attempt in enumerate(attempts.values()):
            superseded = index < len(attempts) - 1  # a later attempt started
            names = {e.event for e in attempt}
            outcomes = names & {"wallet_connected", "wallet_rejected", "wallet_errored"}
            starts = [e for e in attempt if e.event == "wallet_attempted"]
            if len(outcomes) > 1 or len(starts) != 1:
                reasons.append("inconsistent_attempt")
            if "wallet_connected" in names:
                states.append("connected")
            elif "wallet_rejected" in names:
                states.append("rejected")
            elif "wallet_errored" in names:
                states.append("errored")
            elif (not superseded
                  and (cutoff - attempt[0].occurred_at).total_seconds() < pending_seconds):
                states.append("pending")
            else:
                states.append("no_outcome_observed")
        cohort: Cohort
        if "connected" in states:
            cohort = "connected"
        elif attempts:
            cohort = "attempted_no_success"
        elif any(e.event == "wallet_gate_shown" for e in ordered):
            cohort = "gate_event_no_attempt"
        else:
            cohort = "no_gate_event"
        last = ordered[-1]
        if last.event in EXIT_EVENTS:
            exit_type = "not_now" if last.event == "not_now_clicked" else "back"
        elif (cutoff - last.received_at).total_seconds() >= inactive_seconds:
            exit_type = "inactive"
        else:
            exit_type = "open"
        entries = [e.seq for e in ordered if e.event == "project_viewed"]
        if not build_verified:
            reasons.append("unverified_build")
        if not entries:
            reasons.append("missing_project_entry")
        if last.event not in EXIT_EVENTS:
            reasons.append("missing_exit")
        if entries:
            window = [e.seq for e in ordered if e.seq >= entries[0]]
            if window != list(range(entries[0], last.seq + 1)):
                reasons.append("sequence_gap")
        result.append(SessionStats(
            session_id=session_id, cohort=cohort,
            coverage="unknown" if reasons else "complete",
            coverage_reasons=tuple(sorted(set(reasons))), exit_type=exit_type,
            attempt_states=tuple(states),
            # Attempts are in start order; reject is not instrumented, so an unsuccessful
            # earlier attempt (errored, or no outcome observed) counts as a retry.
            after_retry="connected" in states and any(
                s in {"rejected", "errored", "no_outcome_observed"}
                for s in states[:states.index("connected")]
            ),
            event_ids=tuple(e.event_id for e in ordered),
        ))
    return tuple(result)
