import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { sandboxId } from "./api";
import { readSandboxToken } from "../../shared/sandbox";
import { OperatorGate } from "./OperatorGate";
import { safeText, sessions } from "./format";
import { journeyAction, readSpec, type SpecView } from "./journeySpecs";
import { navigationHref } from "../../shared/navigation";
import "./GeneratedJourneys.css";

const Graph = lazy(() => import("./GeneratedJourneyGraph"));

export function GeneratedJourneys({
  project = "app",
  source,
  exclude,
}: {
  project?: "app" | "ens";
  source?: string;
  exclude?: string;
}) {
  const [view, setView] = useState<SpecView | null>(null);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const next = await readSpec(project, signal, source, exclude);
      if (!signal?.aborted) {
        setView(next);
        setError("");
      }
    },
    [project, source, exclude],
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        await load(
          AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        );
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Journey definitions unavailable.",
          );
      }
      if (!controller.signal.aborted) timer = setTimeout(tick, 3000);
    }
    setView(null);
    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [load]);
  async function act(action: "generate" | "approve") {
    setBusy(true);
    setMessage("");
    try {
      await journeyAction(
        action,
        action === "approve"
          ? { digest: view?.draft?.digest, approved_by: reviewer.trim() }
          : undefined,
      );
      await load();
      setMessage(
        action === "generate"
          ? "Draft requested. Definitions appear only after validation."
          : "Journey definitions approved. The report still uses the template.",
      );
      if (action === "approve")
        requestAnimationFrame(() => {
          heading.current?.focus({ preventScroll: true });
          heading.current?.scrollIntoView({ block: "start" });
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Journey request failed.");
    } finally {
      setBusy(false);
    }
  }
  const record = view?.approved ?? view?.draft;
  const sbx = sandboxId();
  const owner = sbx ? Boolean(readSandboxToken(sbx)) : false;
  const controls = !view?.approved && (
    <div className="journey-controls">
      <button
        className="secondary"
        disabled={busy || view?.status === "running" || !view}
        onClick={() => void act("generate")}
      >
        {view?.status === "running"
          ? "Generating journeys…"
          : "Generate user journeys"}
      </button>
      {view?.draft && view.validation.length === 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("approve");
          }}
        >
          <label>
            Reviewer name
            <input
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <button
            className="primary"
            disabled={busy || !reviewer.trim() || view.status === "running"}
          >
            Approve reviewed definitions
          </button>
        </form>
      )}
    </div>
  );
  return (
    <section
      className="generated-journeys"
      aria-label={
        project === "ens"
          ? "ENS proposed journeys"
          : "Generated journeys comparison"
      }
    >
      <header>
        <span className="evidence-label">
          {project === "ens"
            ? "Code evidence"
            : "Computed from recorded events"}
        </span>
        <h2 ref={heading} tabIndex={-1}>
          {project === "ens"
            ? "Proposed journeys (from code, not observed)"
            : "Generated definitions"}
        </h2>
        <p>
          {project === "ens"
            ? "LLM-generated structure from the pinned ENS Workflow Map. No recorded ENS sessions or behavioural counts."
            : "The same sessions, grouped by approved rules. The original template continues to drive the report and locked v1."}
        </p>
      </header>
      {error && (
        <p role="status" className="journey-note">
          {safeText(error)}
        </p>
      )}
      {view?.stale && (
        <p className="warning">
          The approved definitions refer to an earlier Workflow Map and are
          withheld.
        </p>
      )}
      {view?.validation.map((problem) => (
        <p key={problem} role="alert" className="warning">
          {safeText(problem)}
        </p>
      ))}
      {!view && !error && <p role="status">Loading journey definitions…</p>}
      {view && !record && (
        <p className="journey-empty">
          {project === "ens"
            ? "No validated ENS journey draft is available. An operator can generate one offline from its Workflow Map; visitors cannot generate or change it."
            : "No validated generated definitions yet. Review a draft before comparing it with the template."}
        </p>
      )}
      {record && (
        <>
          <p className="journey-state">
            {view?.approved
              ? "Approved definitions"
              : project === "ens"
                ? "LLM-generated draft · awaiting operator approval"
                : "Validated draft · review required"}
          </p>
          {project === "ens" && !view?.approved && (
            <p className="journey-note">
              This draft passed the definition and code-reference checks. Review
              the graph, rules and cited code below before approving its digest.
              The paths are proposals from code, not observed user journeys.
            </p>
          )}
          <details>
            <summary>Definition digest</summary>
            <code>{record.digest}</code>
          </details>
          {view?.approved && (
            <p className="small muted">
              Approved by {safeText(record.approved_by ?? "")} ·{" "}
              {safeText(record.approved_at ?? "")}
            </p>
          )}
          {view?.comparison && (
            <Suspense fallback={<p>Opening journey graph…</p>}>
              <Graph value={view.comparison} />
            </Suspense>
          )}
          {view?.comparison?.segments.map((segment) => (
            <article className="generated-segment" key={segment.id}>
              <h3>{safeText(segment.label)}</h3>
              {segment.sessions !== undefined &&
                segment.total_sessions !== undefined && (
                  <>
                    <strong>
                      {sessions(segment.sessions, segment.total_sessions)}
                    </strong>
                    <ul>
                      {Object.entries(segment.by_source ?? {}).map(
                        ([source, count]) => (
                          <li key={source}>
                            {source === "seed"
                              ? "Simulated users (Playwright) — seed"
                              : source === "test"
                                ? "Automated tests"
                                : "Visitors"}
                            : {sessions(count, segment.sessions!)}
                          </li>
                        ),
                      )}
                    </ul>
                    <details>
                      <summary>
                        Where these sessions sit in the template
                      </summary>
                      <ul>
                        {Object.entries(segment.template_cohorts ?? {}).map(
                          ([cohort, count]) => (
                            <li key={cohort}>
                              <code>{cohort}</code> ·{" "}
                              {sessions(count, segment.sessions!)}
                            </li>
                          ),
                        )}
                      </ul>
                    </details>
                  </>
                )}
            </article>
          ))}
          <details open={!view?.approved}>
            <summary>
              {view?.approved
                ? "Approved rules and code evidence"
                : "Review rules and code evidence"}
            </summary>
            <ol className="generated-rules">
              {record.spec.rules.map((rule) => (
                <li key={rule.id}>
                  <h3>{safeText(rule.label)}</h3>
                  <p>{safeText(rule.rationale)}</p>
                  <pre>{JSON.stringify(rule.predicate, null, 2)}</pre>
                  {rule.evidence.map((ref) => (
                    <details key={ref.node_id}>
                      <summary>
                        <a
                          href={navigationHref(
                            `/report/#fact-${encodeURIComponent(ref.node_id)}`,
                            new URL(location.href),
                          )}
                        >
                          {ref.file}:{ref.lines.join("–")}
                        </a>
                      </summary>
                      <blockquote>
                        <code>{ref.quote}</code>
                      </blockquote>
                    </details>
                  ))}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      {project === "app" &&
        (sbx ? owner && controls : <OperatorGate>{controls}</OperatorGate>)}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
