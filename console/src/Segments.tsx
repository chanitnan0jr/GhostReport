import { useState } from "react";
import { CohortFlow } from "./CohortFlow";
import { CohortCards } from "./CohortCards";
import { SegmentSessions } from "./SegmentSessions";
import {
  sessionPopulation,
  segmentSnapshotIssue,
  sourceLabel,
  sourceOf,
} from "./segmentView";
import { SourceIcon } from "./sourceIcons";
import { safeText, sessions, time } from "./format";
import { useJudgeSession } from "./useJudgeSession";
import { useSessionJourney } from "./useSessionJourney";
import type { Cohort, Report, SessionSource } from "./types";
import "./Segments.css";

export function Segments({ report }: { report: Report | null }) {
  const [source, setSource] = useState<SessionSource | undefined>();
  const [selected, setSelected] = useState<Cohort | null>(null);
  const [highlightOwn, setHighlightOwn] = useState(true);
  const sid = useJudgeSession();
  const own = useSessionJourney(sid);
  if (!report)
    return (
      <section id="segments" className="segments-dashboard" role="status">
        <h1>User journeys and segments</h1>
        <p>Waiting for the report snapshot…</p>
      </section>
    );
  const issue = segmentSnapshotIssue(report);
  if (issue)
    return (
      <section id="segments" className="segments-dashboard">
        <h1>User journeys and segments</h1>
        <p className="warning" role="alert">
          {issue}
        </p>
      </section>
    );
  const everyone = sessionPopulation(report);
  const population = sessionPopulation(report, source);
  const personal = own?.value
    ? population.find((s) => s.session_id === sid)
    : undefined;
  const focus = selected ?? (highlightOwn ? personal?.cohort : null) ?? null;
  function selectCohort(value: Cohort | null) {
    setHighlightOwn(false);
    setSelected(value);
  }
  return (
    <section id="segments" className="segments-dashboard" aria-label="Segments">
      <section className="workflow-card" aria-labelledby="workflow-title">
        <header className="workflow-heading">
          <div className="segments-title-row">
            <h1 id="workflow-title">User journeys and segments</h1>
            {["seed", "replay", "demo"].includes(report.run.mode) && (
              <strong className="segment-mode-badge">
                {report.run.mode === "seed"
                  ? "SEED DATA"
                  : report.run.mode.toUpperCase()}
              </strong>
            )}
          </div>
          <p>
            How recorded events move through the application workflow, grouped
            by what was recorded, not by inferred intent.
          </p>
        </header>
        <div className="workflow-toolbar">
          <div
            className="source-filter"
            role="group"
            aria-label="Journey population"
          >
            {(
              [
                ["All", undefined],
                ["Visitors", "visitor"],
                ["Seed", "seed"],
                ["Automated tests", "test"],
              ] as const
            ).map(([label, value]) => (
              <button
                type="button"
                key={label}
                title={value ? sourceLabel[value] : "All recorded sources"}
                aria-pressed={source === value}
                onClick={() => setSource(value)}
              >
                {value && <SourceIcon source={value} />}
                {label}
                <span>
                  {value
                    ? everyone.filter((s) => sourceOf(report, s) === value)
                        .length
                    : everyone.length}
                </span>
              </button>
            ))}
          </div>
          <p className="workflow-meta">
            <strong>
              {sessions(population.length, report.current.sessions.length)}
            </strong>
            <span aria-label="Report data cutoff">
              Data cutoff {time(report.current.data_cutoff)}
            </span>
          </p>
        </div>
        {own?.value && (
          <div className="segment-personal-banner" role="status">
            <span className="segment-personal-dot" aria-hidden="true" />
            <span>
              <strong>Your session</strong> is in{" "}
              {safeText(own.value.segment_label)}{" "}
              <span className="muted">({sourceLabel[own.value.source]})</span>
            </span>
            {personal ? (
              <button
                type="button"
                className="segment-personal-action"
                onClick={() => selectCohort(personal.cohort)}
              >
                Highlight your cohort
              </button>
            ) : (
              <span className="muted">Choose All to include your session.</span>
            )}
          </div>
        )}
        {own?.error && (
          <p className="segment-data-note" role="status">
            {own.error}
          </p>
        )}
        <CohortFlow
          population={population}
          selected={focus}
          personal={Boolean(personal && focus === personal.cohort)}
          onSelect={selectCohort}
        />
      </section>
      <div className="cohort-grouping-note">
        <span className="evidence-label">Observed</span>
        <p>
          Four recorded cohorts, grouped into three segments. Gate shown, no
          attempt and Attempted, no success recorded both belong to{" "}
          <strong>Stopped at the wallet</strong>. Selecting a card focuses the
          cohort and session list.
        </p>
        {focus && (
          <button
            type="button"
            className="quiet"
            onClick={() => selectCohort(null)}
          >
            All cohorts
          </button>
        )}
      </div>
      <CohortCards
        report={report}
        population={population}
        source={source}
        selected={focus}
        onSelect={selectCohort}
      />
      <p className="segment-count-notes">
        Seed = Simulated users (Playwright) — seed. Question counts use plan
        exposures at shown time, independently of current cohort membership;
        eligibility and per-source question totals are not supplied. “No
        response” means shown without a response.
      </p>
      <SegmentSessions
        report={report}
        population={population}
        cohort={selected}
        onCohort={selectCohort}
        sid={sid}
      />
      <footer className="segment-page-note">
        Counts are sessions, not verified unique people. Coverage unknown cannot
        support absence claims. Session summaries and cohort counts use one
        /api/report snapshot; raw seed logs and personal paths refresh
        independently.
      </footer>
    </section>
  );
}
