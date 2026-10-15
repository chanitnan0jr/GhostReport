import { useEffect, useRef, useState } from "react";
import { ROLE_CARDS } from "./content";
import { Shell } from "./HomePage";

const defaultNavigate = (url: string) => window.location.assign(url);

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const values = crypto.getRandomValues(new Uint8Array(16));
  values[6] = (values[6] & 15) | 64;
  values[8] = (values[8] & 63) | 128;
  const hex = [...values].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Try the App: the roles service assigns A or B (randomised, blind); judges never choose. */
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
  const pendingProject = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function start(projectId?: string) {
    if (inFlight.current) return;
    pendingProject.current = projectId ?? null;
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
      <Shell>
        <main className="gr-card role-card-screen">
          <p className="role-text">{ROLE_CARDS[assignment.role]}</p>
          <button
            className="gr-button"
            onClick={() =>
              navigate(
                `/app/?sid=${encodeURIComponent(assignment.sessionId)}${pendingProject.current ? `#/project/${pendingProject.current}` : ""}`,
              )
            }
          >
            Start
          </button>
        </main>
      </Shell>
    );

  return (
    <Shell>
      <main className="gr-page">
        <span className="gr-kicker">Try the App</span>
        <h1>Try the app as a real user</h1>
        <p className="gr-lead">
          Follow a short role card, use the grant app the way you really would,
          and see where you land. You may get one optional question when you
          leave. Your session counts as a visitor, separately from the simulated
          users.
        </p>
        <div className="try-steps">
          <section className="gr-card">
            <span className="try-number">1</span>
            <h2>Get a role card</h2>
            <p>
              The roles service gives you card A (a team looking for funding) or
              B (curious about the community) at random, so the results stay
              comparable. You don’t pick.
            </p>
            <button
              className="gr-button"
              onClick={() => void start()}
              disabled={preparing}
            >
              {preparing ? "Preparing your session…" : "Try the app as a user"}
            </button>
            {error && (
              <div className="gr-error" role="alert">
                {error} <a href="/app/">Continue without a role →</a>
              </div>
            )}
          </section>
          <section className="gr-card">
            <span className="try-number">2</span>
            <h2>Use the app</h2>
            <p>
              Common Ground DAO is a mock grant app. The wallet is simulated: no
              real wallet or funds. The first connection may show a simulated
              network error once; retrying always works.
            </p>
          </section>
          <section className="gr-card">
            <span className="try-number">3</span>
            <h2>Optional question when you leave</h2>
            <p>
              If you leave at a point under investigation, one question may
              appear. Skip is always one click, and it never blocks you.
            </p>
          </section>
        </div>
        <div className="gr-card try-after">
          <div>
            <h3>Finished? See where you landed</h3>
            <p className="gr-muted">
              The app links to your own path and segment in the report.
            </p>
          </div>
          <a className="gr-button-quiet" href="/report/#segments">
            Open Segments →
          </a>
        </div>
      </main>
    </Shell>
  );
}
