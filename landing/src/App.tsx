import { useEffect, useRef, useState } from "react";
import {
  CONFIG_EXAMPLE,
  INTEGRATION_LEVELS,
  REPO_URL,
  ROLE_CARDS,
} from "./content";

const defaultNavigate = (url: string) => window.location.assign(url);

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const values = crypto.getRandomValues(new Uint8Array(16));
  values[6] = (values[6] & 15) | 64;
  values[8] = (values[8] & 63) | 128;
  const hex = [...values].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function App({
  navigate = defaultNavigate,
}: { navigate?: (url: string) => void } = {}) {
  const [assignment, setAssignment] = useState<{
    sessionId: string;
    role: "A" | "B";
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const pendingSession = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function start() {
    if (inFlight.current) return;
    pendingSession.current ??= uuid();
    const controller = new AbortController();
    inFlight.current = controller;
    setPreparing(true);
    setError("");
    try {
      const response = await fetch("/roles/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: pendingSession.current }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error("Role service unavailable");
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== "object" ||
        !("role" in body) ||
        (body.role !== "A" && body.role !== "B")
      )
        throw new Error("Invalid role assignment");
      localStorage.setItem("ghost:judge_sid", pendingSession.current);
      setAssignment({ sessionId: pendingSession.current, role: body.role });
    } catch {
      if (!controller.signal.aborted)
        setError("We couldn’t prepare your session. Please try again.");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      setPreparing(false);
    }
  }

  if (assignment)
    return (
      <main className="role-screen">
        <p className="role-text">{ROLE_CARDS[assignment.role]}</p>
        <button
          className="primary"
          onClick={() =>
            navigate(`/app/?sid=${encodeURIComponent(assignment.sessionId)}`)
          }
        >
          Start
        </button>
      </main>
    );

  return (
    <div className="landing">
      <header className="header">
        <a href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          GhostReport
        </a>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="repo-link"
        >
          View on GitHub <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main>
        <section className="hero">
          <h1>
            Follow the drop-off.
            <br />
            <span>Find the missing evidence.</span>
          </h1>
          <p className="pitch">
            GhostReport connects code, behavior, and optional feedback into an
            investigation you can trace.
          </p>
          <p className="simulation-note">
            The wallet is simulated. No real wallet or funds. A network error
            may be simulated once.
          </p>
        </section>
        <section className="step first-step" aria-labelledby="step-one">
          <span className="step-number" aria-hidden="true">
            01
          </span>
          <div className="step-content">
            <h2 id="step-one">Try the app as a user</h2>
            <p>
              Get a short role card. Explore the grant app and make your own
              choices.
            </p>
            <button
              className="primary"
              onClick={() => void start()}
              disabled={preparing}
            >
              {preparing ? "Preparing your session…" : "Try the app as a user"}
              <span aria-hidden="true">↗</span>
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
        <section className="step" aria-labelledby="step-two">
          <span className="step-number" aria-hidden="true">
            02
          </span>
          <div className="step-content">
            <h2 id="step-two">See the investigation update</h2>
            <p>
              Compare the locked baseline with new evidence. Your session will
              be highlighted in the report.
            </p>
            <a className="text-link" href="/report/">
              Open the investigation <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
        <section className="step integration-step" aria-labelledby="step-three">
          <span className="step-number" aria-hidden="true">
            03
          </span>
          <div className="step-content">
            <h2 id="step-three">Add it to your repo</h2>
            <p>
              Start with source code. Add events and optional feedback when
              you’re ready.
            </p>
            <div className="integration-levels">
              {INTEGRATION_LEVELS.map(([level, title, description]) => (
                <article key={level}>
                  <span className="level">{level}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
            <details className="config-example">
              <summary>View ghostreport.yaml</summary>
              <pre>
                <code>{CONFIG_EXAMPLE}</code>
              </pre>
            </details>
            <a className="text-link ens-link" href="/ens/">
              Tested on a real repo: ENS <span aria-hidden="true">↗</span>
            </a>
            <a
              className="text-link"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              Explore the source on GitHub <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>
      <footer>
        <span>GhostReport</span>
        <span>Built for questions worth investigating.</span>
      </footer>
    </div>
  );
}
