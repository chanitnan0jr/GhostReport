import { useCallback, useEffect, useRef, useState } from "react";
import { SANDBOX_START } from "../../../shared/sandbox";
import { time } from "../format";
import type { Report } from "../types";
import {
  canControl,
  fetchReveal,
  fetchState,
  lockSandbox,
  SandboxError,
  sendTraffic,
  startInvestigation,
} from "./sandboxApi";
import { RevealPanel } from "./RevealPanel";
import { BatchSummary, TrafficForm } from "./TrafficForm";
import type {
  LockRequest,
  Reveal,
  SandboxHypothesis,
  SandboxQuestion,
  SandboxState,
  TrafficRequest,
} from "./types";
import "./SandboxPanel.css";

export interface SandboxPanelProps {
  sandboxId: string;
  report: Report | null;
  refresh: () => Promise<void>;
}

type Step = "before" | "investigate" | "lock" | "after" | "reveal";

const STEPS: [Step, string][] = [
  ["before", "Traffic before the lock"],
  ["investigate", "Investigate"],
  ["lock", "Approve and lock v1"],
  ["after", "Traffic after the lock"],
  ["reveal", "Reveal"],
];

// engine/catalog.py CLASS_DEFINITIONS, shortened.
const CLASS_LABEL: Record<string, string> = {
  "HC-unaware-requirement": "Did not know a wallet was needed",
  "HC-gate-permission": "Concern about the gate’s permissions",
  "HC-browsing": "Browsing, not applying now",
  "HC-unclear-requester": "Unsure who is asking",
};

function suggested(state: SandboxState): Step {
  if (state.phase === "locked")
    return state.batches.some((b) => b.phase === "post_lock")
      ? "reveal"
      : "after";
  if (state.phase === "draft_ready") return "lock";
  if (state.phase === "investigating") return "investigate";
  return state.sessions_total > 0 ? "investigate" : "before";
}

function available(step: Step, state: SandboxState): boolean {
  const locked = state.phase === "locked";
  if (step === "before" || step === "investigate") return !locked;
  if (step === "lock") return !locked && state.phase !== "investigating";
  if (step === "after") return locked;
  return locked && state.batches.some((b) => b.phase === "post_lock");
}

function done(step: Step, state: SandboxState): boolean {
  const locked = state.phase === "locked";
  if (step === "before") return state.sessions_total > 0;
  if (step === "investigate") return locked || state.phase === "draft_ready";
  if (step === "lock") return locked;
  if (step === "after")
    return state.batches.some((b) => b.phase === "post_lock");
  return false;
}

function Hypotheses({ items }: { items: SandboxHypothesis[] }) {
  return (
    <ul className="sbx-hypotheses">
      {items.map((h) => (
        <li key={h.id}>
          <span className="sbx-id">{h.id}</span>
          <span>{h.statement}</span>
          {h.class_id && (
            <span className="sbx-label">
              {CLASS_LABEL[h.class_id] ?? h.class_id}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Questions({ items }: { items: SandboxQuestion[] }) {
  return (
    <div className="sbx-questions">
      {items.map((q) => (
        <div className="sbx-question" key={q.decision_point}>
          <p className="sbx-question-stem">
            <span>{q.decision_point}</span> {q.stem}
          </p>
          <ul className="sbx-options">
            {q.options.map((o) => (
              <li key={o.id}>{o.label}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Digest({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sbx-digest">
      <span>v1 sha256</span>
      <code>{value}</code>
      <button
        type="button"
        className="quiet"
        onClick={() =>
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function SandboxPanel({
  sandboxId,
  report,
  refresh,
}: SandboxPanelProps) {
  const [state, setState] = useState<SandboxState | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [view, setView] = useState<Step | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ status: number; text: string } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(true);
  const owner = canControl(sandboxId);
  const phase = useRef<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const next = await fetchState(sandboxId, signal);
      setState(next);
      if (phase.current !== next.phase) {
        // A new phase moves the panel to the step that comes next.
        phase.current = next.phase;
        setView(null);
      }
      if (next.phase === "locked")
        setReveal(await fetchReveal(sandboxId, signal));
      return next;
    },
    [sandboxId],
  );

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      let delay = 3000;
      try {
        const next = await load(controller.signal);
        if (next.phase === "investigating") delay = 1500;
        setError((current) => (current?.status === 404 ? null : current));
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof SandboxError && failure.status === 404) {
          setError({ status: 404, text: failure.message });
          return; // expired: stop polling
        }
        delay = 6000;
      }
      if (!controller.signal.aborted) timer = setTimeout(tick, delay);
    }
    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [load]);

  async function act(name: string, action: () => Promise<string>) {
    setBusy(name);
    setError(null);
    setMessage("");
    try {
      setMessage(await action());
      await Promise.all([load(), refresh()]);
    } catch (failure) {
      setError({
        status: failure instanceof SandboxError ? failure.status : 0,
        text:
          failure instanceof Error
            ? failure.message
            : "The sandbox request failed.",
      });
    } finally {
      setBusy(null);
    }
  }

  const traffic = (body: TrafficRequest) =>
    act("traffic", async () => {
      const result = await sendTraffic(sandboxId, body);
      // Stay on this step so the batch result stays in view.
      setView(result.phase === "post_lock" ? "after" : "before");
      return "";
    });
  const investigate = () =>
    act("investigate", async () => {
      await startInvestigation(sandboxId);
      return "";
    });
  const lock = (body: LockRequest) =>
    act("lock", async () => {
      await lockSandbox(sandboxId, body);
      return "";
    });

  if (error?.status === 404)
    return (
      <section className="sbx" aria-label="Sandbox controls">
        <p className="sbx-ended" role="alert">
          This sandbox has expired or does not exist.{" "}
          <a href={SANDBOX_START}>Start a new sandbox</a>
        </p>
      </section>
    );
  if (!state)
    return (
      <section className="sbx" aria-label="Sandbox controls">
        <p className="sbx-hint" role="status">
          Opening the sandbox…
        </p>
      </section>
    );

  const step = view && available(view, state) ? view : suggested(state);
  const investigateInfo = state.investigate;
  const lastBatch = state.batches.at(-1);
  const remaining = state.limits.sessions_total - state.sessions_total;
  const locked = state.locked;
  const aiBlocked =
    !owner ||
    state.phase === "investigating" ||
    state.sessions_total < investigateInfo.min_sessions ||
    investigateInfo.runs_left < 1 ||
    investigateInfo.global_runs_left < 1;
  const preparedHypotheses: SandboxHypothesis[] = (
    report?.hypotheses ?? []
  ).map((h) => ({
    id: h.id,
    statement: h.statement,
    class_id: h.class_id ?? null,
  }));

  return (
    <section className="sbx" aria-labelledby="sbx-title">
      <header className="sbx-head">
        <h2 id="sbx-title">Sandbox</h2>
        <p className="sbx-meta">
          {state.sessions_total} simulated sessions · deleted at{" "}
          {time(state.expires_at)}
        </p>
        <a className="sbx-new" href={SANDBOX_START}>
          New sandbox
        </a>
        <button
          type="button"
          className="quiet"
          aria-expanded={open}
          aria-controls="sbx-body"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide controls" : "Show controls"}
        </button>
      </header>

      <ol className="sbx-steps" aria-label="Sandbox steps">
        {STEPS.map(([id, label], index) => {
          const reachable = available(id, state);
          return (
            <li key={id}>
              <button
                type="button"
                className={`sbx-step${done(id, state) ? " is-done" : ""}`}
                aria-current={step === id ? "step" : undefined}
                disabled={!reachable}
                onClick={() => {
                  setView(id);
                  setOpen(true);
                }}
              >
                <span className="sbx-step-n" aria-hidden="true">
                  {done(id, state) ? "✓" : index + 1}
                </span>
                <span className="sbx-visually-hidden">Step {index + 1}:</span>{" "}
                {label}
                {done(id, state) && (
                  <span className="sbx-visually-hidden"> (done)</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {!owner && (
        <p className="sbx-readonly">
          You can watch this sandbox, but only the browser that started it can
          change it. <a href={SANDBOX_START}>Start your own sandbox</a>
        </p>
      )}

      <div className="sbx-body" id="sbx-body" hidden={!open}>
        {step === "before" && (
          <>
            <p className="sbx-lead">
              Simulated sessions walk the app’s flow and send their events
              through the normal ingest. Segments update as soon as a batch
              lands. No question is asked before v1 is locked.
            </p>
            <TrafficForm
              key="before"
              phase="pre_lock"
              questions={[]}
              remaining={remaining}
              disabled={!owner}
              busy={busy === "traffic"}
              onSubmit={traffic}
            />
          </>
        )}

        {step === "investigate" && (
          <>
            <p className="sbx-lead">
              The AI reads the app’s Workflow Map and this snapshot of{" "}
              {state.sessions_total} sessions, then proposes hypotheses and two
              exit questions. Nothing changes until you approve them.
            </p>
            <div className="sbx-actions">
              <button
                type="button"
                className="primary"
                disabled={aiBlocked || busy !== null}
                onClick={investigate}
              >
                {state.phase === "investigating"
                  ? "Investigating…"
                  : "Investigate with AI"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={
                  !owner || busy !== null || state.phase === "investigating"
                }
                onClick={() => setView("lock")}
              >
                Use the prepared investigation
              </button>
              <span className="sbx-hint">
                {state.sessions_total < investigateInfo.min_sessions
                  ? `Generate at least ${investigateInfo.min_sessions} sessions first.`
                  : `${investigateInfo.runs_left} AI runs left here · ${investigateInfo.global_runs_left} left for all sandboxes`}
              </span>
            </div>
            {state.phase === "investigating" && (
              <p className="sbx-progress" role="status">
                Reading the snapshot of {investigateInfo.snapshot_sessions}{" "}
                sessions. This usually takes 5–30 seconds.
              </p>
            )}
            {investigateInfo.status === "failed" && investigateInfo.error && (
              <p className="sbx-error" role="alert">
                The investigation did not finish: {investigateInfo.error}
              </p>
            )}
          </>
        )}

        {step === "lock" && !locked && (
          <>
            {state.draft ? (
              <>
                <p className="sbx-lead">
                  The AI’s draft
                  {investigateInfo.cached ? " (served from the cache)" : ""},
                  written from {investigateInfo.snapshot_sessions} sessions.
                  Approving locks these hypotheses and questions as v1 before
                  anyone is asked.
                </p>
                <div className="sbx-review">
                  <div>
                    <h3>Hypotheses</h3>
                    <Hypotheses items={state.draft.hypotheses} />
                  </div>
                  <div>
                    <h3>Exit questions</h3>
                    <Questions items={state.draft.questions} />
                  </div>
                </div>
                {(state.draft.rejected.option ?? []).length > 0 && (
                  <p className="sbx-hint">
                    The guards removed {state.draft.rejected.option.length}{" "}
                    proposed options that broke the question rules.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="sbx-lead">
                  The prepared investigation is the judging run’s approved one:
                  the same AI stages wrote it earlier, and a person approved it.
                  Locking it calls no AI.
                </p>
                <Hypotheses items={preparedHypotheses} />
              </>
            )}
            <div className="sbx-actions">
              {state.draft && (
                <button
                  type="button"
                  className="primary"
                  disabled={!owner || busy !== null}
                  onClick={() => lock({ source: "ai" })}
                >
                  {busy === "lock" ? "Locking…" : "Approve and lock v1"}
                </button>
              )}
              <button
                type="button"
                className={state.draft ? "secondary" : "primary"}
                disabled={!owner || busy !== null}
                onClick={() => lock({ source: "prepared" })}
              >
                {state.draft
                  ? "Lock the prepared investigation instead"
                  : busy === "lock"
                    ? "Locking…"
                    : "Lock the prepared investigation"}
              </button>
            </div>
          </>
        )}

        {locked && (step === "lock" || step === "after") && (
          <div className="sbx-locked" role="status">
            <p className="sbx-lead">
              v1 is locked from the{" "}
              {locked.source === "ai" ? "AI’s draft" : "prepared investigation"}{" "}
              at {time(locked.data_cutoff)}. Its hypotheses and questions can no
              longer change; questions are open until {time(locked.ends_at)}.
            </p>
            <Digest value={locked.digest} />
          </div>
        )}

        {step === "after" && locked && (
          <>
            <p className="sbx-lead">
              New sessions now meet the approved questions at eligible exits,
              through the same eligibility and exposure checks as the app.
              Simulated people answer from the mix you set below; the engine
              never sees that mix.
            </p>
            <TrafficForm
              key={`after-${locked.digest}`}
              phase="post_lock"
              questions={locked.questions}
              remaining={remaining}
              disabled={!owner}
              busy={busy === "traffic"}
              onSubmit={traffic}
            />
          </>
        )}

        {step === "reveal" && reveal && <RevealPanel reveal={reveal} />}

        {lastBatch && (step === "before" || step === "after") && (
          <div className="sbx-next">
            <BatchSummary batch={lastBatch} />
            {step === "before" &&
              state.sessions_total >= investigateInfo.min_sessions && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setView("investigate")}
                >
                  Next: investigate
                </button>
              )}
            {step === "after" && lastBatch.phase === "post_lock" && (
              <button
                type="button"
                className="secondary"
                onClick={() => setView("reveal")}
              >
                Next: reveal
              </button>
            )}
          </div>
        )}
        {message && !error && (
          <p className="sbx-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="sbx-error" role="alert">
            {error.text}
            {error.status === 429 && !locked && (
              <>
                {" "}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => setView("lock")}
                >
                  Use the prepared investigation
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
