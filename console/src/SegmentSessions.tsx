import { useState } from "react";
import type { Cohort, Report, Session, SessionSource } from "./types";
import { safeText, time } from "./format";
import { cohortInfo, cohortOrder, sourceOf } from "./segmentView";
import { SourceIcon } from "./sourceIcons";
import {
  useSeedSessionDetails,
  type SeedSessionDetail,
} from "./useSeedSessionDetails";
import "./SegmentSessions.css";

const RULE: Record<Cohort, number> = {
  no_gate_event: 4,
  gate_event_no_attempt: 3,
  attempted_no_success: 2,
  connected: 1,
};
const SHORT: Record<Cohort, string> = {
  no_gate_event: "No gate event",
  gate_event_no_attempt: "Gate / no attempt",
  attempted_no_success: "Attempt / no success",
  connected: "Connected",
};
const SOURCE: Record<SessionSource, string> = {
  seed: "Seed (simulated)",
  visitor: "Visitor",
  test: "Automated test",
};
const EXIT: Record<Session["exit_type"], string> = {
  back: "Back",
  not_now: "Not now",
  inactive: "Inactive",
  open: "Open",
};
const PAGE_SIZE = 8;

type SortKey = "session" | "source" | "coverage" | "exit";

function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}
function stamp(value: string | null | undefined) {
  return value ? time(value) : "Not supplied";
}
function Chevron({ dir }: { dir: "up" | "down" | "right" | "left" }) {
  const d = {
    up: "M6 15l6-6 6 6",
    down: "M6 9l6 6 6-6",
    right: "M9 6l6 6-6 6",
    left: "M15 6l-6 6 6 6",
  }[dir];
  return (
    <svg className="explorer-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
function Coverage({ value }: { value: Session["coverage"] }) {
  return (
    <span className={`explorer-coverage is-${value}`}>
      {value === "complete" ? "Complete" : "Unknown"}
    </span>
  );
}
function RuleBadge({ cohort }: { cohort: Cohort }) {
  return (
    <span className={`explorer-rule cohort-tone-${cohortInfo[cohort].tone}`}>
      R{RULE[cohort]}
    </span>
  );
}

function SessionDetail({
  session,
  report,
  detail,
  index,
  total,
  own,
  onMove,
}: {
  session: Session;
  report: Report;
  detail: SeedSessionDetail | null | undefined;
  index: number;
  total: number;
  own: boolean;
  onMove: (step: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const source = sourceOf(report, session);
  const info = cohortInfo[session.cohort];
  const verified = report.run.verification?.wallet_gate_shown?.verified;
  const events = detail?.events ?? [];
  const reportHref = `/report/?sid=${encodeURIComponent(session.session_id)}#coverage`;
  const has = (name: string) => events.some((e) => e.event === name);
  return (
    <aside
      className="explorer-card explorer-detail"
      aria-labelledby="session-detail-title"
    >
      <header className="explorer-detail-head">
        <div>
          <h3 id="session-detail-title">Session details</h3>
          <div className="explorer-detail-id">
            <code title={session.session_id}>
              {shortId(safeText(session.session_id))}
            </code>
            <button
              type="button"
              className="explorer-icon-button"
              aria-label="Copy session ID"
              title={copied ? "Copied" : "Copy session ID"}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(session.session_id)
                  .then(() => setCopied(true));
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {copied ? (
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                ) : (
                  <>
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                  </>
                )}
              </svg>
            </button>
            {own && <span className="your-session-label">Your session</span>}
          </div>
        </div>
        <div className="explorer-detail-actions">
          <a
            className="explorer-outline-link"
            href={
              source === "seed" && detail
                ? `/api/seed-sessions/${encodeURIComponent(session.session_id)}`
                : reportHref
            }
            target="_blank"
            rel="noreferrer"
          >
            {source === "seed" && detail ? "Raw JSON" : "Open in new tab"} ↗
          </a>
          <div className="explorer-stepper">
            <button
              type="button"
              className="explorer-icon-button"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              aria-label="Previous session"
            >
              <Chevron dir="left" />
            </button>
            <span>
              {index + 1} / {total}
            </span>
            <button
              type="button"
              className="explorer-icon-button"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              aria-label="Next session"
            >
              <Chevron dir="right" />
            </button>
          </div>
        </div>
      </header>
      <div className="explorer-badges">
        <span className="explorer-badge">
          {source && <SourceIcon source={source} />}
          {source ? source.toUpperCase() : "SOURCE UNAVAILABLE"}
        </span>
        <span
          className={`explorer-badge explorer-badge-cohort cohort-tone-${info.tone}`}
        >
          <RuleBadge cohort={session.cohort} />
          {info.label.toUpperCase()}
        </span>
        <span className={`explorer-badge is-coverage-${session.coverage}`}>
          <i aria-hidden="true" />
          COVERAGE {session.coverage.toUpperCase()}
        </span>
      </div>
      <dl className="explorer-facts">
        <div>
          <dt>Source</dt>
          <dd>{source ?? "Not supplied"}</dd>
        </div>
        <div>
          <dt>Exit</dt>
          <dd>{EXIT[session.exit_type]}</dd>
        </div>
        <div>
          <dt>Classification</dt>
          <dd>
            R{RULE[session.cohort]} · {info.label}
            <small>(reported by /api/report)</small>
          </dd>
        </div>
        <div>
          <dt>Last event</dt>
          <dd>{stamp(events.at(-1)?.received_at)}</dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>
            {session.coverage_reasons.length
              ? session.coverage_reasons.map(safeText).join(" · ")
              : "No coverage issue returned"}
          </dd>
        </div>
        <div>
          <dt>First seen</dt>
          <dd>{stamp(events[0]?.received_at)}</dd>
        </div>
        <div>
          <dt>Question</dt>
          <dd>
            {detail
              ? detail.probe
                ? `${safeText(detail.probe.decision_point)} · ${detail.probe.status.replaceAll("_", " ")}`
                : "No exposure recorded"
              : "Not supplied"}
          </dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>
            {session.attempt_states.length
              ? session.attempt_states.map(safeText).join(" → ")
              : "None recorded"}
          </dd>
        </div>
      </dl>
      <section className="explorer-timeline">
        <h4>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
          </svg>
          Event timeline <span>(server time UTC)</span>
        </h4>
        {source !== "seed" || detail === null ? (
          <div className="explorer-empty">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M9 13h6M9 17h6" />
            </svg>
            <strong>Raw event timeline unavailable</strong>
            <p>
              {source === "seed"
                ? "Raw events could not be loaded for this seed session. No event path is reconstructed."
                : "The public API exposes the cohort summary for this session, but not individual raw events. No path or probe response is inferred."}
            </p>
            <a href={reportHref}>View classification in Report →</a>
            <p className="explorer-info">
              Raw event traces are available for simulated seed sessions.
            </p>
          </div>
        ) : detail === undefined ? (
          <p className="explorer-muted" role="status">
            Loading recorded events…
          </p>
        ) : (
          <>
            <ol className="explorer-events">
              {events.map((event) => (
                <li key={event.seq}>
                  <span className="explorer-seq">{event.seq}</span>
                  <code>{safeText(event.event)}</code>
                  {event.event === "wallet_gate_shown" && (
                    <span className="explorer-tag">
                      {verified ? "Run build verified" : "Unverified build"}
                    </span>
                  )}
                  <span className="explorer-page">{safeText(event.page)}</span>
                  <time>{stamp(event.received_at)}</time>
                </li>
              ))}
            </ol>
            {detail.probe && (
              <div className="explorer-probe">
                <strong>
                  Question record · {safeText(detail.probe.decision_point)} ·{" "}
                  {detail.probe.status.replaceAll("_", " ")}
                </strong>
                <span>
                  Shown after event <code>{detail.probe.after_seq}</code> ·
                  exposure {stamp(detail.probe.shown_received_at)} · response{" "}
                  {stamp(detail.probe.responded_received_at)}
                </span>
                {detail.probe.selected.length > 0 && (
                  <span>
                    Selected: {detail.probe.selected.map(safeText).join(" · ")}
                  </span>
                )}
                <span className="explorer-muted">
                  Exposure and response records are separate from the event
                  timeline; no probe event is fabricated.
                </span>
              </div>
            )}
          </>
        )}
      </section>
      <section className="explorer-classified">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="6" cy="5" r="2.2" />
          <circle cx="6" cy="19" r="2.2" />
          <circle cx="18" cy="12" r="2.2" />
          <path d="M6 7.2v9.6M6 12h9.8M8 5.5c5 0 6 2 8.2 5" />
        </svg>
        <div>
          <h4>How this session was classified</h4>
          <p>
            Labelled R{RULE[session.cohort]} ({info.label}) from the cohort
            reported by /api/report: {info.description}
          </p>
          <p>
            {source === "seed" && detail
              ? `Its raw log ${has("wallet_gate_shown") ? "contains" : "has no"} wallet_gate_shown, ${has("wallet_attempted") ? "contains" : "has no"} wallet_attempted and ${has("wallet_connected") ? "contains" : "has no"} wallet_connected.`
              : "Individual raw events for this session are not available, so this label is not independently checked against an event log."}
          </p>
        </div>
      </section>
    </aside>
  );
}

export function SegmentSessions({
  report,
  population,
  cohort,
  onCohort,
  sid,
}: {
  report: Report;
  population: Session[];
  cohort: Cohort | null;
  onCohort: (value: Cohort | null) => void;
  sid: string | null;
}) {
  const [chosen, setChosen] = useState(sid ?? "");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "session",
    desc: false,
  });
  // null: show the page that holds the chosen session.
  const [pageIndex, setPageIndex] = useState<number | null>(null);
  const needle = query.trim().toLowerCase();
  const sortValue: Record<SortKey, (s: Session) => string> = {
    session: (s) => s.session_id,
    source: (s) => sourceOf(report, s) ?? "~",
    coverage: (s) => s.coverage,
    exit: (s) => EXIT[s.exit_type],
  };
  const rows = population
    .filter((s) => !cohort || s.cohort === cohort)
    .filter((s) => !needle || s.session_id.toLowerCase().includes(needle))
    .sort((a, b) => {
      const order = sortValue[sort.key](a).localeCompare(
        sortValue[sort.key](b),
        undefined,
        { numeric: true },
      );
      return (
        (sort.desc ? -order : order) || a.session_id.localeCompare(b.session_id)
      );
    });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const chosenAt = rows.findIndex((s) => s.session_id === chosen);
  const shown = Math.min(
    pageIndex ?? Math.floor(Math.max(0, chosenAt) / PAGE_SIZE),
    pages - 1,
  );
  const first = shown * PAGE_SIZE;
  const page = rows.slice(first, first + PAGE_SIZE);
  const current =
    rows.find((s) => s.session_id === chosen) ?? page[0] ?? rows[0];
  const index = current ? rows.indexOf(current) : -1;
  const seedIds = [...page, ...(current ? [current] : [])]
    .filter((s) => sourceOf(report, s) === "seed")
    .map((s) => s.session_id);
  const detailFor = useSeedSessionDetails(report.run.run_id, [
    ...new Set(seedIds),
  ]);

  function choose(id: string) {
    setChosen(id);
    const at = rows.findIndex((s) => s.session_id === id);
    if (at >= 0) setPageIndex(Math.floor(at / PAGE_SIZE));
  }
  function header(key: SortKey, label: string) {
    const active = sort.key === key;
    return (
      <th
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          className={`explorer-sort${active ? " is-active" : ""}`}
          onClick={() => setSort({ key, desc: active ? !sort.desc : false })}
        >
          {label}
          <Chevron dir={active && !sort.desc ? "up" : "down"} />
        </button>
      </th>
    );
  }

  return (
    <section
      className="explorer"
      id="segment-sessions"
      aria-labelledby="session-explorer-title"
    >
      <header className="explorer-heading">
        <div>
          <h2 id="session-explorer-title">Session Explorer</h2>
          <p>Inspect the recorded evidence behind every classification.</p>
        </div>
        <div className="explorer-snapshot">
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
              <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
            </svg>
            Snapshot · {time(report.current.data_cutoff)}
          </span>
          <strong>{population.length} sessions</strong>
          <small>
            Rows from /api/report; seed event logs from /api/seed-sessions
            (refreshed every 15 s). Use the population filter above for sources.
          </small>
        </div>
      </header>
      <div className="explorer-grid">
        <div className="explorer-card explorer-list">
          <header className="explorer-list-head">
            <div>
              <h3>Sessions</h3>
              <p>
                Browse sessions and inspect the recorded evidence. Select a
                session to view details.
              </p>
            </div>
            <label className="explorer-search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              <input
                type="search"
                placeholder="Search session ID…"
                aria-label="Search session ID"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPageIndex(0);
                }}
              />
            </label>
          </header>
          <div
            className="explorer-pills"
            role="group"
            aria-label="Session cohort"
          >
            <button
              type="button"
              aria-pressed={cohort === null}
              onClick={() => {
                onCohort(null);
                setPageIndex(0);
              }}
            >
              All cohorts
            </button>
            {cohortOrder.map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={cohort === value}
                className={`cohort-tone-${cohortInfo[value].tone}`}
                onClick={() => {
                  onCohort(value);
                  setPageIndex(0);
                }}
              >
                R{RULE[value]} {SHORT[value]}
              </button>
            ))}
          </div>
          <div className="explorer-table">
            <table>
              <thead>
                <tr>
                  {header("session", "Session")}
                  {header("source", "Source")}
                  <th>Recorded path / reported cohort</th>
                  {header("coverage", "Coverage")}
                  {header("exit", "Exit")}
                  <th>Last event</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {page.map((session) => {
                  const source = sourceOf(report, session);
                  const detail =
                    source === "seed" ? detailFor(session.session_id) : null;
                  const selected = session.session_id === current?.session_id;
                  return (
                    <tr
                      key={session.session_id}
                      aria-selected={selected}
                      className={
                        session.session_id === sid ? "is-own-session" : ""
                      }
                      onClick={() => choose(session.session_id)}
                    >
                      <th scope="row">
                        <button
                          type="button"
                          className="explorer-id"
                          title={session.session_id}
                          onClick={(event) => {
                            event.stopPropagation();
                            choose(session.session_id);
                          }}
                        >
                          {shortId(safeText(session.session_id))}
                        </button>
                        {session.session_id === sid && (
                          <span className="your-session-label">You</span>
                        )}
                      </th>
                      <td>{source ? SOURCE[source] : "Unavailable"}</td>
                      <td>
                        {detail?.events.length ? (
                          <span
                            className="explorer-path"
                            title={detail.events
                              .map((e) => e.event)
                              .join(" → ")}
                          >
                            {detail.events.slice(0, 2).map((event, i) => (
                              <span key={event.seq}>
                                {i > 0 && (
                                  <span
                                    className="explorer-arrow"
                                    aria-hidden="true"
                                  >
                                    →
                                  </span>
                                )}
                                <code>{safeText(event.event)}</code>
                              </span>
                            ))}
                            {detail.events.length > 2 && (
                              <span className="explorer-more">
                                +{detail.events.length - 2}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="explorer-reported">
                            <RuleBadge cohort={session.cohort} />
                            {cohortInfo[session.cohort].label}
                          </span>
                        )}
                      </td>
                      <td>
                        <Coverage value={session.coverage} />
                      </td>
                      <td>{EXIT[session.exit_type]}</td>
                      <td className="explorer-muted">
                        {detail?.events.length
                          ? stamp(detail.events.at(-1)!.received_at)
                          : "Not supplied"}
                      </td>
                      <td className="explorer-row-chevron">
                        <Chevron dir="right" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && (
              <p className="explorer-empty-row">
                No recorded sessions match this selection.
              </p>
            )}
          </div>
          <footer className="explorer-list-foot">
            <span>
              {rows.length
                ? `Showing ${first + 1}–${first + page.length} of ${rows.length} sessions`
                : "Showing 0 sessions"}
            </span>
            {pages > 1 && (
              <nav className="explorer-pages" aria-label="Session pages">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={shown === 0}
                  onClick={() => setPageIndex(shown - 1)}
                >
                  <Chevron dir="left" />
                </button>
                {Array.from({ length: pages }, (_, i) => (
                  <button
                    type="button"
                    key={i}
                    aria-current={i === shown ? "page" : undefined}
                    onClick={() => setPageIndex(i)}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={shown === pages - 1}
                  onClick={() => setPageIndex(shown + 1)}
                >
                  <Chevron dir="right" />
                </button>
              </nav>
            )}
          </footer>
        </div>
        {current ? (
          <SessionDetail
            key={current.session_id}
            session={current}
            report={report}
            detail={
              sourceOf(report, current) === "seed"
                ? detailFor(current.session_id)
                : null
            }
            index={index}
            total={rows.length}
            own={current.session_id === sid}
            onMove={(step) => choose(rows[index + step].session_id)}
          />
        ) : (
          <aside className="explorer-card explorer-detail explorer-empty">
            <strong>No session selected</strong>
            <p>Choose a populated cohort or clear the search.</p>
          </aside>
        )}
      </div>
    </section>
  );
}
