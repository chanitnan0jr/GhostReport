import { useState } from "react";
import { sandboxReportUrl, startSandbox } from "../../shared/sandbox";
import { Shell } from "./HomePage";

const STEPS = [
  [
    "Generate traffic",
    "Simulated sessions walk the app’s flow and send their events through the normal ingest. Segments update at once.",
  ],
  [
    "Investigate",
    "The AI reads the app’s Workflow Map and your snapshot, then proposes hypotheses and two exit questions. Or use the prepared investigation, with no AI call.",
  ],
  [
    "Approve and lock v1",
    "You play the operator: approve the draft and lock it. The v1 sha256 is shown before anyone is asked.",
  ],
  [
    "Generate traffic after the lock",
    "Set what simulated people would answer. Exits meet the approved question through the same eligibility checks as the app.",
  ],
  [
    "Reveal",
    "Compare the mix you set with the report’s “k of n respondents”, including what it could not count.",
  ],
] as const;

export function SandboxPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const sandbox = await startSandbox();
      if (!sandbox.saved) {
        setError(
          "This browser blocks site storage, so it could not keep control of the sandbox. Allow storage for this site and try again.",
        );
        return;
      }
      location.assign(sandboxReportUrl(sandbox.sandbox_id));
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message
          ? failure.message
          : "The sandbox could not start. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="gr-page sandbox-page">
        <span className="gr-kicker">Sandbox</span>
        <h1>Run the whole loop in a minute</h1>
        <p className="gr-lead">
          Start your own simulated run and watch GhostReport go from traffic to
          a locked investigation to counted answers. It is a separate run, never
          mixed with the judging run, and it is deleted after 3 hours.
        </p>
        <ol className="sandbox-steps">
          {STEPS.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <p className="sandbox-note">
          Everything in a sandbox is a simulation: answers come from the mix you
          set. It shows the pipeline, not real user insight.
        </p>
        <div className="gr-actions">
          <button
            type="button"
            className="gr-button"
            onClick={() => void start()}
            disabled={busy}
          >
            {busy ? "Starting…" : "Start a sandbox"}
          </button>
          <a className="gr-button-quiet" href="/report/#segments">
            See the judging run instead
          </a>
        </div>
        {error && (
          <p className="gr-error sandbox-error" role="alert">
            {error}
          </p>
        )}
      </main>
    </Shell>
  );
}
