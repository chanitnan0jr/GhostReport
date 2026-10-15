import { useEffect, useState } from "react";
import type { Cohort, Report, Session } from "./types";
import { safeText, sessions } from "./format";
import {
  fetchJourneys,
  samePopulation,
  type JourneyGraph,
  type JourneyStep,
} from "./journeys";
import {
  cohortInfo,
  cohortOrder,
  populationQuery,
  sourceLabel,
  sourceOf,
  type PopulationFilter,
} from "./segmentView";
import { SourceIcon } from "./sourceIcons";
import "./CohortCards.css";

const RULE: Record<Cohort, number> = {
  no_gate_event: 4,
  gate_event_no_attempt: 3,
  attempted_no_success: 2,
  connected: 1,
};
const OBSERVED: Record<Cohort, string> = {
  no_gate_event:
    "No wallet gate event was recorded. The session may have exited earlier, or instrumentation may be incomplete.",
  gate_event_no_attempt:
    "A wallet gate event was recorded, but no connect attempt was recorded.",
  attempted_no_success:
    "At least one connect attempt was recorded, but no successful connection was recorded.",
  connected:
    "At least one wallet connection success was recorded, either on the first attempt or after a retry.",
};
const EVENT_LABELS: Record<string, string> = {
  project_viewed: "Viewed a project",
  apply_clicked: "Clicked Apply",
  wallet_gate_shown: "Saw the wallet gate",
  wallet_attempted: "Started connecting",
  wallet_connected: "Connected",
  wallet_errored: "Network error",
  wallet_rejected: "Rejected",
  not_now_clicked: "Not now",
  back_nav: "Back to projects",
};
const NOTE_LABELS = {
  no_outcome_observed: "No outcome observed",
  pending: "Waiting for a result",
};
const EXITS = [
  ["back", "Back"],
  ["not_now", "Not now"],
  ["inactive", "Inactive"],
  ["open", "Open"],
] as const;
const ATTEMPT_STATES = ["no_outcome_observed", "errored", "pending"];

function CohortIcon({ cohort }: { cohort: Cohort }) {
  const paths: Record<Cohort, React.ReactNode> = {
    no_gate_event: (
      <>
        <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.8" />
      </>
    ),
    gate_event_no_attempt: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2.5" />
        <path d="M16 12.5h2.5M3 9.5h13a2 2 0 0 0 2-2V6" />
      </>
    ),
    attempted_no_success: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.4v.1" />
      </>
    ),
    connected: (
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    ),
  };
  return (
    <span className="cohort-acc-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">{paths[cohort]}</svg>
    </span>
  );
}

function Rows({ items }: { items: [React.ReactNode, string, boolean?][] }) {
  return (
    <dl className="cohort-acc-rows">
      {items.map(([label, value, muted], index) => (
        <div key={index} className={muted ? "is-muted" : undefined}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cohort-acc-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Step({ step }: { step: JourneyStep }) {
  if ("note" in step)
    return (
      <span className="cohort-path-note" title="No event recorded">
        {NOTE_LABELS[step.note]}
      </span>
    );
  return (
    <code className="cohort-path-chip" title={step.event}>
      {EVENT_LABELS[step.event] ?? safeText(step.event)}
    </code>
  );
}

// /api/journeys for the same population: recorded event paths and question
// outcomes per cohort. Refreshed on its own clock, like the full journey chart.
function useJourneyCohorts(filter: PopulationFilter) {
  const [graph, setGraph] = useState<JourneyGraph | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const value = await fetchJourneys(
          populationQuery(filter),
          AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        );
        if (!controller.signal.aborted) {
          setGraph(value);
          setError("");
        }
      } catch (failure: unknown) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "Paths unavailable",
          );
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [filter]);
  const current =
    graph && samePopulation(graph, populationQuery(filter)) ? graph : null;
  return { rows: current?.cohorts, loaded: Boolean(current), error };
}

export function CohortCards({
  report,
  population,
  selected,
  onSelect,
  filter,
}: {
  report: Report;
  population: Session[];
  selected: Cohort | null;
  onSelect: (cohort: Cohort | null) => void;
  filter: PopulationFilter;
}) {
  const [open, setOpen] = useState<Set<Cohort>>(() => new Set());
  const journeys = useJourneyCohorts(filter);
  // The investigation's user-reject outcome, when its event call was not found.
  const reject = report.workflow.outcomes.find(
    (outcome) =>
      /reject/.test(outcome.id) && outcome.instrumentation !== "found_in_code",
  );
  const total = population.length;

  function toggle(cohort: Cohort, expanded: boolean) {
    setOpen((current) => {
      const next = new Set(current);
      if (expanded) next.delete(cohort);
      else next.add(cohort);
      return next;
    });
    if (expanded && selected === cohort) onSelect(null);
    if (!expanded) onSelect(cohort);
  }

  return (
    <div className="cohort-accordion" aria-label="Recorded cohorts">
      {cohortOrder.map((cohort) => {
        const info = cohortInfo[cohort];
        const members = population.filter((s) => s.cohort === cohort);
        const n = members.length;
        const expanded = open.has(cohort) || selected === cohort;
        const headerId = `cohort-${cohort}-header`;
        const bodyId = `cohort-${cohort}-body`;
        const complete = members.filter(
          (s) => s.coverage === "complete",
        ).length;
        const attempts = members.flatMap((s) => s.attempt_states);
        const states = [
          ...ATTEMPT_STATES,
          ...new Set(attempts.filter((s) => !ATTEMPT_STATES.includes(s))),
        ];
        const retried = members.filter((s) => s.after_retry).length;
        const plans = report.current.probes.filter((p) =>
          p.target_cohorts.includes(cohort),
        );
        const asked = plans.map((p) => p.decision_point).join(" / ");
        const row = journeys.rows?.find((r) => r.cohort === cohort);
        const unsourced = members.filter((s) => !sourceOf(report, s)).length;
        return (
          <article
            key={cohort}
            className={`cohort-acc cohort-tone-${info.tone}${expanded ? " is-open" : ""}${selected === cohort ? " is-selected" : ""}`}
          >
            <button
              type="button"
              id={headerId}
              className="cohort-acc-header"
              aria-expanded={expanded}
              aria-controls={bodyId}
              onClick={() => toggle(cohort, expanded)}
            >
              <span className="cohort-acc-identity">
                <CohortIcon cohort={cohort} />
                <span>
                  <span className="cohort-acc-title">
                    <strong>{info.label}</strong>
                    {plans.length > 0 && (
                      <span className="cohort-acc-target">
                        Investigation target
                      </span>
                    )}
                  </span>
                  <span className="cohort-acc-count">
                    <span className="cohort-acc-rule">Rule {RULE[cohort]}</span>
                    {sessions(n, total)}
                  </span>
                </span>
              </span>
              <span className="cohort-acc-observed">{OBSERVED[cohort]}</span>
              <span className="cohort-acc-evidence">
                {cohort === "connected" ? (
                  <span className="cohort-acc-status">
                    <i className="is-neutral" aria-hidden="true" />
                    {retried} after a retry
                  </span>
                ) : cohort === "attempted_no_success" ? (
                  <span className="cohort-acc-status">
                    <i className="is-warning" aria-hidden="true" />
                    {states
                      .map(
                        (state) =>
                          [
                            state,
                            attempts.filter((s) => s === state).length,
                          ] as const,
                      )
                      .filter(([, k]) => k)
                      .map(([state, k]) => `${k} ${state.replaceAll("_", " ")}`)
                      .join(" · ") || "No attempts"}
                  </span>
                ) : (
                  <span className="cohort-acc-status">
                    <i
                      className={complete === n ? "is-good" : "is-warning"}
                      aria-hidden="true"
                    />
                    Coverage complete {complete} of {n}
                  </span>
                )}
                <span>
                  <strong>Asked:</strong> {asked || "—"}
                </span>
              </span>
              <span className="cohort-acc-action">
                {expanded ? "Hide details" : "View details"}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
            <div
              id={bodyId}
              role="region"
              aria-labelledby={headerId}
              className="cohort-acc-body"
              inert={!expanded}
            >
              <div className="cohort-acc-inner">
                <div className="cohort-acc-panels">
                  <Panel title="Source breakdown">
                    <Rows
                      items={(["seed", "test", "visitor"] as const).map(
                        (value) => {
                          const k = members.filter(
                            (s) => sourceOf(report, s) === value,
                          ).length;
                          return [
                            <>
                              <SourceIcon source={value} />
                              {sourceLabel[value]}
                            </>,
                            sessions(k, n),
                            !k,
                          ];
                        },
                      )}
                    />
                    {unsourced > 0 && (
                      <p className="cohort-acc-note">
                        Source unavailable: {sessions(unsourced, n)}
                      </p>
                    )}
                  </Panel>
                  <Panel title="Coverage & evidence">
                    {cohort === "connected" ? (
                      <Rows
                        items={[
                          ["Coverage", "Not required for this rule"],
                          ["Connected after a retry", sessions(retried, n)],
                          ["Attempts recorded", `${attempts.length}`],
                        ]}
                      />
                    ) : (
                      <>
                        <Rows
                          items={[
                            ["Complete", sessions(complete, n)],
                            [
                              "Unknown",
                              sessions(n - complete, n),
                              complete === n,
                            ],
                          ]}
                        />
                        {cohort === "attempted_no_success" ? (
                          <>
                            <h4>Attempt outcomes (by attempt)</h4>
                            <Rows
                              items={states.map((state) => {
                                const k = attempts.filter(
                                  (s) => s === state,
                                ).length;
                                return [
                                  <code>{state}</code>,
                                  `${k} of ${attempts.length} attempts`,
                                  !k,
                                ];
                              })}
                            />
                          </>
                        ) : (
                          <p className="cohort-acc-note">
                            {cohort === "no_gate_event"
                              ? "No wallet_gate_shown or wallet_attempted event recorded. Unknown coverage cannot support an absence claim."
                              : "wallet_gate_shown recorded; no wallet_attempted recorded."}
                          </p>
                        )}
                      </>
                    )}
                  </Panel>
                  <Panel title="Exit & question">
                    <Rows
                      items={EXITS.map(([key, label]) => {
                        const k = members.filter(
                          (s) => s.exit_type === key,
                        ).length;
                        return [label, sessions(k, n), !k];
                      })}
                    />
                    <h4>Question{asked ? ` · ${asked}` : ""}</h4>
                    {cohort === "connected" && !plans.length ? (
                      <p className="cohort-acc-note">Not applicable.</p>
                    ) : row && Object.keys(row.probes).length ? (
                      Object.entries(row.probes).map(([point, counts]) => {
                        const shown =
                          counts.answered +
                          counts.skipped +
                          counts.shown_no_response;
                        return (
                          <Rows
                            key={point}
                            items={[
                              [
                                `Shown (${point})`,
                                sessions(shown, row.sessions),
                              ],
                              ["Answered", `${counts.answered} of ${shown}`],
                              ["Skipped", `${counts.skipped} of ${shown}`],
                              [
                                "Shown, no response",
                                `${counts.shown_no_response} of ${shown}`,
                              ],
                            ]}
                          />
                        );
                      })
                    ) : (
                      <p className="cohort-acc-note">
                        {!journeys.loaded
                          ? "Loading question outcomes…"
                          : plans.length
                            ? "No question shown to this cohort yet."
                            : "Not targeted by the returned question plans."}
                      </p>
                    )}
                    {plans.length > 0 && (
                      <p className="cohort-acc-note">
                        Counted by current cohort membership. Eligibility is not
                        supplied by the API.
                      </p>
                    )}
                  </Panel>
                </div>
                {cohort === "attempted_no_success" && reject && (
                  <aside className="cohort-acc-gap">
                    <div>
                      <strong>
                        {reject.instrumentation === "not_found_in_scope"
                          ? "Reject isn’t instrumented"
                          : "Reject instrumentation is unconfirmed"}
                      </strong>
                      <p>
                        If a user rejects the wallet request and no reject event
                        is recorded, the attempt appears as{" "}
                        <code>no_outcome_observed</code>. Not every attempt with
                        no outcome observed was a rejection.
                      </p>
                    </div>
                    <a href={`#fact-${reject.id}`}>
                      Inspect instrumentation gap →
                    </a>
                  </aside>
                )}
                <section className="cohort-acc-paths">
                  <h3>Most common recorded paths</h3>
                  {journeys.error && !row ? (
                    <p className="cohort-acc-note">
                      Recorded paths unavailable: {safeText(journeys.error)}.
                    </p>
                  ) : !journeys.loaded ? (
                    <p className="cohort-acc-note">Loading recorded paths…</p>
                  ) : !row ? (
                    <p className="cohort-acc-note">
                      This API version does not return recorded paths per
                      cohort.
                    </p>
                  ) : row.top_paths.length ? (
                    <ol>
                      {row.top_paths.map((path, index) => (
                        <li key={index}>
                          <span className="cohort-path-count">
                            <strong>{path.sessions}×</strong> ·{" "}
                            {sessions(path.sessions, row.sessions)}
                          </span>
                          <span className="cohort-path-steps">
                            {path.steps.map((step, stepIndex) => (
                              <span
                                key={stepIndex}
                                className="cohort-path-pair"
                              >
                                {stepIndex > 0 && (
                                  <span
                                    className="cohort-path-arrow"
                                    aria-hidden="true"
                                  >
                                    →
                                  </span>
                                )}
                                <Step step={step} />
                              </span>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="cohort-acc-note">No recorded paths yet.</p>
                  )}
                  {row && row.sessions !== n && (
                    <p className="cohort-acc-note">
                      Paths come from /api/journeys ({row.sessions} sessions
                      now); the report snapshot above has {n}. They refresh
                      separately.
                    </p>
                  )}
                </section>
                <nav
                  className="cohort-acc-links"
                  aria-label={`${info.label} links`}
                >
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      onSelect(cohort);
                      document
                        .getElementById("segment-sessions")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                  >
                    View sessions →
                  </button>
                  <a href="#workflow">Inspect workflow →</a>
                  {plans.length > 0 && (
                    <a href="#hypotheses">View related hypotheses →</a>
                  )}
                </nav>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
