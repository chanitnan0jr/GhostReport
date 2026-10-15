import { useEffect, useState } from "react";
import { DemoClips } from "./DemoClips";
import { Shell } from "./HomePage";

interface SeedSession {
  session_id: string;
  source: "seed";
  cohort: string;
  exit_type: string;
  coverage: string;
  events: { seq: number; event: string; page: string; received_at: string }[];
  probe: null | {
    decision_point: string;
    after_seq: number;
    status: string;
    selected: string[];
  };
}
interface SessionSummary {
  session_id: string;
  cohort: string;
}
interface Population {
  current: {
    sessions: SessionSummary[];
    session_sources?: Record<string, string>;
  };
}
const cohortNames: Record<string, string> = {
  connected: "Connected",
  attempted_no_success: "Attempted, no success",
  gate_event_no_attempt: "Gate shown, no attempt",
  no_gate_event: "No gate event recorded",
};
async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok)
    throw new Error(`Recorded sessions unavailable (${response.status}).`);
  return response.json() as Promise<T>;
}
const readable = (value: string) => value.replaceAll("_", " ");

export function SeedPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [session, setSession] = useState<SeedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void readJson<Population>(
      "/api/report",
      AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    )
      .then((report) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(report.current?.sessions))
          throw new Error("Unexpected session response.");
        if (!report.current.session_sources)
          throw new Error("Source labels are unavailable for this run.");
        const seeds = report.current.sessions.filter(
          (item) =>
            report.current.session_sources?.[item.session_id] === "seed",
        );
        setSessions(seeds);
        setSelected((current) =>
          seeds.some((item) => item.session_id === current)
            ? current
            : (seeds[0]?.session_id ?? ""),
        );
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Recorded sessions unavailable.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    setSession(null);
    if (!selected) return;
    const controller = new AbortController();
    void readJson<SeedSession>(
      `/api/seed-sessions/${encodeURIComponent(selected)}`,
      AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (
          !value ||
          value.source !== "seed" ||
          value.session_id !== selected ||
          !Array.isArray(value.events)
        )
          throw new Error("Unexpected recorded session response.");
        setSession(value);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Session details unavailable.",
          );
      });
    return () => controller.abort();
  }, [selected, revision]);

  return (
    <Shell>
      <div className="seed-shell">
        <main className="seed-page">
          <p className="seed-kicker">Recorded activity · Read only</p>
          <h1>Four simulated users, one real app</h1>
          <p className="seed-label">Simulated users (Playwright) — seed</p>
          <p className="seed-intro">
            Playwright clicked through the real app as four people from the role
            cards. Every event below came from the app's own{" "}
            <code>track()</code> and was received by the server; the report
            counts these sessions as seed, never as visitors. Nothing runs live
            on this page.
          </p>
          <DemoClips />
          <div className="clips-next">
            <a className="clips-cta" href="/app/">
              Now try it yourself →
            </a>
            <span>Your session joins the report as a visitor.</span>
          </div>
          <h2 className="seed-section">All 20 simulated sessions</h2>
          {import.meta.env.VITE_MOCK === "1" && (
            <p className="seed-error">
              Mock preview — local fixture, not a recorded browser run.
            </p>
          )}
          <p className="seed-intro">
            Explore the recorded steps of every simulated session. These are
            separate from visitor activity. Opening this page does not create
            sessions or send answers.
          </p>
          <div className="seed-toolbar">
            <a href="/report/">Open the full report ↗</a>
            <button
              className="seed-refresh"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              {loading ? "Loading…" : "Refresh recorded sessions"}
            </button>
          </div>
          {error && (
            <div role="alert" className="seed-error">
              {error} Use Refresh to try again.
            </div>
          )}
          {loading ? (
            <p role="status">Loading recorded sessions…</p>
          ) : !sessions.length && !error ? (
            <div className="seed-empty">
              <h2>No seed sessions in this run yet</h2>
              <p>
                Recorded sessions will appear once the demo run has been seeded.
                Visitor and automated test sessions are not displayed here.
              </p>
              <a href="/">Try the DAO app instead →</a>
            </div>
          ) : (
            sessions.length > 0 && (
              <div className="seed-layout">
                <aside className="seed-session-list" aria-label="Seed sessions">
                  <h2>Recorded sessions</h2>
                  <p>
                    {sessions.length} of {sessions.length} seed sessions
                  </p>
                  {sessions.map((item) => (
                    <button
                      key={item.session_id}
                      aria-pressed={selected === item.session_id}
                      onClick={() => {
                        setError("");
                        setSelected(item.session_id);
                      }}
                    >
                      <span>
                        {cohortNames[item.cohort] ?? readable(item.cohort)}
                      </span>
                      <code>{item.session_id}</code>
                    </button>
                  ))}
                </aside>
                <section
                  className="seed-detail"
                  aria-label="Recorded session details"
                >
                  {!session ? (
                    !error && <p role="status">Loading session details…</p>
                  ) : (
                    <>
                      <span className="seed-kicker">
                        Observed · Server-received events
                      </span>
                      <h2>
                        {cohortNames[session.cohort] ??
                          readable(session.cohort)}
                      </h2>
                      <code className="seed-id">{session.session_id}</code>
                      <dl className="seed-facts">
                        <div>
                          <dt>Source</dt>
                          <dd>Simulated users (Playwright) — seed</dd>
                        </div>
                        <div>
                          <dt>Telemetry coverage</dt>
                          <dd>{session.coverage}</dd>
                        </div>
                        <div>
                          <dt>Exit</dt>
                          <dd>{readable(session.exit_type)}</dd>
                        </div>
                      </dl>
                      <ol className="seed-timeline">
                        {session.events.map((event) => (
                          <li key={event.seq}>
                            <span className="seed-seq">{event.seq}</span>
                            <div>
                              <strong>{readable(event.event)}</strong>
                              <p>{event.page}</p>
                              <time dateTime={event.received_at}>
                                {new Date(event.received_at).toLocaleString()}
                              </time>
                            </div>
                          </li>
                        ))}
                      </ol>
                      {session.probe && (
                        <section className="seed-probe">
                          <h3>
                            Optional response · {session.probe.decision_point}
                          </h3>
                          <p>
                            Shown after event {session.probe.after_seq} ·{" "}
                            {readable(session.probe.status)}
                          </p>
                          {session.probe.selected.length > 0 && (
                            <ul>
                              {session.probe.selected.map((option) => (
                                <li key={option}>{option}</li>
                              ))}
                            </ul>
                          )}
                        </section>
                      )}
                    </>
                  )}
                </section>
              </div>
            )
          )}
        </main>
        <footer>
          <span>GhostReport · Recorded demo activity</span>
          <a href="/about/">About this project</a>
        </footer>
      </div>
    </Shell>
  );
}
