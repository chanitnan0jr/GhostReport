import { useEffect, useRef, useState } from "react";
import { safeText, sessions, time } from "./format";
import {
  simulationApi,
  simulationRequest,
  simulationTokenKey,
  type FeedbackMode,
  type FeedbackPreset,
  type SimulationLoad,
  type SimulationReport,
} from "./ensSimulation";
import "./EnsSimulation.css";

export default function EnsSimulation({
  page = "report",
  onCreated,
}: {
  page?: "report" | "segments";
  onCreated?: (id: string) => void;
}) {
  const [id, setId] = useState(
    new URLSearchParams(location.search).get("simulation"),
  );
  const [report, setReport] = useState<SimulationReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState(20);
  const [feedback, setFeedback] = useState<FeedbackMode>("mixed");
  const [preset, setPreset] = useState<FeedbackPreset>("mixed");
  const pending = useRef<SimulationLoad | null>(null);
  const token = id ? localStorage.getItem(simulationTokenKey(id)) : null;
  const mock = import.meta.env.VITE_MOCK === "1";
  function accept(next: SimulationReport) {
    setReport((previous) =>
      previous?.simulation_id === next.simulation_id &&
      previous.population.synthetic > next.population.synthetic
        ? previous
        : next,
    );
  }
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await simulationRequest<SimulationReport>(
          `${simulationApi}/${encodeURIComponent(id!)}`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(8000),
            ]),
          },
        );
        if (!controller.signal.aborted) accept(value);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Simulation unavailable.");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const value = await simulationRequest<{
        simulation_id: string;
        token: string;
        report: SimulationReport;
      }>(simulationApi, { method: "POST" });
      localStorage.setItem(
        simulationTokenKey(value.simulation_id),
        value.token,
      );
      const url = new URL(location.href);
      url.searchParams.set("simulation", value.simulation_id);
      url.hash = "";
      history.replaceState(null, "", url.pathname + url.search);
      setId(value.simulation_id);
      onCreated?.(value.simulation_id);
      accept(value.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create simulation.");
    } finally {
      setBusy(false);
    }
  }
  async function addLoad() {
    if (!id || !token) return;
    setBusy(true);
    setError("");
    pending.current ??= {
      batch_id: crypto.randomUUID(),
      n,
      feedback,
      preset,
      seed: crypto.getRandomValues(new Uint32Array(1))[0] % 2 ** 31,
    };
    try {
      accept(
        await simulationRequest<SimulationReport>(
          `${simulationApi}/${encodeURIComponent(id)}/load`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(pending.current),
          },
        ),
      );
      pending.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add load.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="ens-simulation"
      id={page === "segments" ? "segments" : "top"}
    >
      <header className="panel ens-simulation-intro">
        <span className="evidence-label">
          Simulation · synthetic events and feedback
        </span>
        <h1>
          {id
            ? "ENS simulation report"
            : "Test the ENS report with simulated feedback"}
        </h1>
        <p>
          Generate event sequences and feedback to exercise the report. This
          mode does not run ENS or Playwright. Every session and answer is
          synthetic, in a separate run.
        </p>
        {!id && (
          <>
            <p>
              The approved ENS journeys classify the generated logs. A
              simulation baseline is frozen before load is added; no LLM call is
              needed.
            </p>
            <button
              className="primary"
              onClick={() => void create()}
              disabled={busy}
            >
              {busy
                ? "Creating simulation…"
                : mock
                  ? "Preview synthetic report"
                  : "Start ENS simulation"}
            </button>
            <a href="/report/?project=ens#segments">
              View approved ENS journey rules →
            </a>
          </>
        )}
        {id && (
          <p className="small muted">
            Run <code>{id}</code> · refreshes every 3 s
            {report && <> · Created {time(report.created_at)}</>}
          </p>
        )}
      </header>
      {error && (
        <p className="warning" role="alert">
          {safeText(error)}
        </p>
      )}
      {id && !report && !error && <p role="status">Loading simulation…</p>}
      {report && (
        <>
          <section className="panel">
            <span className="evidence-label">Synthetic data</span>
            <h2>Add load and feedback</h2>
            <p className="ens-simulation-population">
              {report.population.text}
            </p>
            {token ? (
              <form
                className="ens-load-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addLoad();
                }}
              >
                <label>
                  Sessions per batch
                  <select
                    aria-label="Sessions per batch"
                    value={n}
                    disabled={busy}
                    onChange={(e) => {
                      setN(Number(e.target.value));
                      pending.current = null;
                    }}
                  >
                    {[10, 20, 50, 100, 200].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Simulated delivery and feedback
                  <select
                    aria-label="Simulated delivery and feedback"
                    value={feedback}
                    disabled={busy}
                    onChange={(e) => {
                      setFeedback(e.target.value as FeedbackMode);
                      pending.current = null;
                    }}
                  >
                    <option value="mixed">
                      Answers, skips and nonresponse
                    </option>
                    <option value="answered">All shown sessions answer</option>
                    <option value="skipped">All shown sessions skip</option>
                    <option value="unanswered">Shown with no response</option>
                    <option value="not_shown">Question not shown</option>
                  </select>
                </label>
                <label>
                  Answer preset
                  <select
                    aria-label="Answer preset"
                    value={preset}
                    disabled={busy}
                    onChange={(e) => {
                      setPreset(e.target.value as FeedbackPreset);
                      pending.current = null;
                    }}
                  >
                    <option value="mixed">Mixed options</option>
                    {report.question.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={busy || report.remaining < n}
                >
                  {busy
                    ? "Adding synthetic load…"
                    : "Add simulated load + feedback"}
                </button>
              </form>
            ) : (
              <p>
                {mock
                  ? "Static mock preview. The real backend is required to add load."
                  : "Shared read-only simulation. Only its creator can add load."}
              </p>
            )}
            <p className="small muted">
              {sessions(report.population.synthetic, report.limit)} used in this
              simulation’s capacity. Completed and inactive sessions are not
              asked.
            </p>
            <div className="ens-simulation-links">
              <a
                href={`/report/?project=ens&simulation=${encodeURIComponent(report.simulation_id)}#segments`}
              >
                View simulated segments →
              </a>
              <a
                href={`/report/?project=ens&simulation=${encodeURIComponent(report.simulation_id)}`}
              >
                View simulation report →
              </a>
              <a href="/report/?project=ens">Start a separate simulation →</a>
            </div>
          </section>
          {report.errors.length > 0 && (
            <div className="warning" role="alert">
              {report.errors.map(safeText).join(" · ")}
            </div>
          )}
          <section className="panel">
            <span className="evidence-label">
              Synthetic data · server-computed counts
            </span>
            <h2>Summary</h2>
            <p>{safeText(report.summary)}</p>
            <details>
              <summary>Frozen simulation baseline and question</summary>
              <p>
                Journey digest: <code>{report.journey_digest}</code>
              </p>
              <p>
                Simulation v1 digest: <code>{report.v1_digest}</code>
              </p>
              <p>{report.question.source}</p>
              <p>{report.question.stem}</p>
              <ul>
                {report.question.options.map((option) => (
                  <li key={option.id}>{option.label}</li>
                ))}
              </ul>
            </details>
          </section>
          <section className="panel">
            <span className="evidence-label">
              Synthetic events · approved journey rules
            </span>
            <h2>Simulated segments</h2>
            <div className="ens-segment-grid">
              {report.segments.map((segment) => (
                <article key={segment.id}>
                  <h3>{safeText(segment.label)}</h3>
                  <strong>{segment.text}</strong>
                </article>
              ))}
            </div>
            <h3>Generated event paths</h3>
            <p>
              These are authored test sequences, not recordings of ENS
              execution. Steps without a recorded event are not reconstructed.
            </p>
            <div className="ens-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Population</th>
                    <th>Event sequence</th>
                  </tr>
                </thead>
                <tbody>
                  {report.paths.map((path) => (
                    <tr key={path.events.join("|")}>
                      <td>{path.text}</td>
                      <td className="ens-event-path">
                        {path.events.map((event, index) => (
                          <span key={`${index}:${event}`}>
                            <code>{event}</code>
                            {index < path.events.length - 1 ? " → " : ""}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {page === "report" && (
            <section className="panel">
              <span className="evidence-label">
                Simulated feedback · hypothesis presets
              </span>
              <h2>Hypotheses v1 vs current</h2>
              <p>
                These generic hypothesis presets belong to this simulation. They
                are not the ENS code-only investigation’s hypotheses. Counts are
                separate for each segment.
              </p>
              {report.segments.map((segment) => (
                <div key={segment.id} className="ens-findings-group">
                  <h3>{safeText(segment.label)}</h3>
                  <div className="ens-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Hypothesis preset</th>
                          <th>v1 baseline</th>
                          <th>Current simulated feedback</th>
                          <th>Observation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.findings
                          .filter((finding) => finding.segment === segment.id)
                          .map((finding) => (
                            <tr key={finding.hypothesis_id}>
                              <td>
                                <code>{finding.hypothesis_id}</code>{" "}
                                <span className="evidence-label">generic</span>
                                <p>{safeText(finding.label)}</p>
                              </td>
                              <td>
                                <span className="ens-neutral">
                                  {safeText(report.v1.status)}
                                </span>
                                <p>Baseline before generated feedback</p>
                              </td>
                              <td>
                                <span className="ens-neutral">
                                  {safeText(finding.status)}
                                </span>
                                <p>{finding.text}</p>
                              </td>
                              <td>{safeText(finding.observation)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          )}
          {page === "report" && (
            <section className="panel">
              <span className="evidence-label">Simulated feedback</span>
              <h2>Findings</h2>
              <p>
                Selections below are generated answers for this report exercise,
                not feedback from ENS visitors.
              </p>
              {report.coverage.answered === 0 ? (
                <p className="ens-neutral">
                  Unresolved · no simulated answers yet
                </p>
              ) : (
                <ul>
                  {report.findings
                    .filter((finding) => finding.selected > 0)
                    .map((finding) => (
                      <li key={`${finding.segment}:${finding.hypothesis_id}`}>
                        <strong>{safeText(finding.segment_label)}</strong> ·{" "}
                        {safeText(finding.label)}
                        <p>
                          {finding.text}{" "}
                          <span className="ens-neutral">
                            {safeText(finding.status)}
                          </span>
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )}
          <section className="panel">
            <span className="evidence-label">
              Synthetic delivery and feedback
            </span>
            <h2>Coverage</h2>
            <div className="ens-coverage-grid">
              {(
                [
                  [
                    "Eligible",
                    report.coverage.eligible,
                    report.coverage.total_sessions,
                  ],
                  [
                    "Question shown",
                    report.coverage.shown,
                    report.coverage.eligible,
                  ],
                  ["Answered", report.coverage.answered, report.coverage.shown],
                  ["Skipped", report.coverage.skipped, report.coverage.shown],
                  [
                    "Shown, no response",
                    report.coverage.shown_no_response,
                    report.coverage.shown,
                  ],
                  [
                    "Eligible, not shown",
                    report.coverage.not_shown,
                    report.coverage.eligible,
                  ],
                  [
                    "Inactive, not asked",
                    report.coverage.inactive,
                    report.coverage.total_sessions,
                  ],
                ] as const
              ).map(([label, k, total]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{sessions(k, total)}</strong>
                </article>
              ))}
            </div>
          </section>
          <section className="panel">
            <span className="evidence-label">
              Code evidence · not validated by synthetic load
            </span>
            <h2>Evidence gaps</h2>
            <p>
              Synthetic load does not verify ENS instrumentation. A missing
              event in these test sequences cannot establish what a real user
              saw or did. The existing code review remains separate.
            </p>
            <a href="/report/?project=ens#workflow">
              Inspect the ENS Workflow Map and reference checks →
            </a>
          </section>
          <section className="panel">
            <span className="evidence-label">Simulation scope</span>
            <h2>Limitations</h2>
            <ul>
              {report.limitations.map((limit) => (
                <li key={limit}>{safeText(limit)}</li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <span className="evidence-label">Synthetic records</span>
            <h2>Inspect generated logs and feedback</h2>
            {!mock && (
              <a
                href={`${simulationApi}/${encodeURIComponent(report.simulation_id)}/records`}
                target="_blank"
                rel="noreferrer"
              >
                View all generated records as JSON ↗
              </a>
            )}
            <details>
              <summary>
                Recent generated sessions, exposures and responses
              </summary>
              <pre>{JSON.stringify(report.examples, null, 2)}</pre>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
