import { REPO_URL } from "./content";
import { Shell } from "./HomePage";

// Every snippet below is copied from code in this repository; the config shows only
// the keys the engine reads today (engine/config.py), with the rest marked as planned.
const BLOB = `${REPO_URL}/blob/main`;

const CONFIG_READ_ONLY = `# ghostreport.yaml: read-only (L0), like the ENS run
repo:
  url: https://github.com/<owner>/<repo>
  commit: <sha>            # pinned, read only
  include: ["src/**/*.ts", "src/**/*.tsx"]
workflow:
  keywords: [registration, isConnected, openConnectModal]
mode: code_only            # no behavior data
analytics:
  calls: [sendEvent]       # your tracking wrappers`;

const CONFIG_EVENTS = `# add your events (L1): your analytics name → canonical name
mode: behavioral
events:
  "Project Viewed": project_viewed
  "Apply Clicked": apply_clicked
  "Wallet Gate Shown": wallet_gate_shown
  "Wallet Connect Started": wallet_attempted
  "Wallet Connected": wallet_connected
  "Wallet Error": wallet_errored
  "Not Now Clicked": not_now_clicked
  "Back To List": back_nav`;

const ANALYZE = `uv run python -m engine.analyze <your checkout> draft.json \\
  --config ghostreport.yaml`;

const TRACK = `// app/src/App.tsx and ApplyModal.tsx: one call per step, in order
tracker.track("apply_clicked", "ProjectPage", { project_id: project.id });
tracker.track("wallet_gate_shown", "ApplyModal", { project_id: project.id });
const exit = tracker.track("not_now_clicked", "ApplyModal", { project_id: project.id });`;

const PROBE = `// app/src/App.tsx: ask only at an eligible exit, never before it
const plan = await loadProbePlan(sessionId, "DP1"); // null until v1 is locked
if (at_exit(plan, { decisionPoint: "DP1", now: Date.now(), consent, ... }) === "show_probe")
  setInvitation({ plan, sessionId, cohortAtShown: cohort, eventSeqAtShown: exit });

{invitation && <ProbeCard invitation={invitation} onClose={() => setInvitation(null)} />}`;

const LOCK = `uv run python -m engine.demo prepare --draft draft.json --approved-by <you>
uv run python -m engine.demo serve --run-id pilot --mode pilot`;

function Code({ children }: { children: string }) {
  return (
    <pre className="install-code">
      <code>{children}</code>
    </pre>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="install-step" aria-labelledby={`install-${number}`}>
      <span className="step-number" aria-hidden="true">
        {number}
      </span>
      <div className="install-body">
        <h2 id={`install-${number}`}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function InstallPage() {
  return (
    <Shell>
      <div className="seed-shell">
        <main className="seed-page install-page">
          <p className="seed-kicker">Install · 3 steps</p>
          <h1>Add GhostReport to your repo</h1>
          <p className="seed-intro">
            Start read-only: point it at a pinned commit and get a workflow map,
            evidence gaps and hypotheses to review, as we did with{" "}
            <a href="/ens/">ENS</a>. Add events and the optional question when
            you are ready.
          </p>

          <Step number="01" title="Describe the workflow in one file">
            <p>
              <code>ghostreport.yaml</code> names the repo, the words that find
              the workflow, and your tracking functions.
            </p>
            <div className="install-pair">
              <Code>{CONFIG_READ_ONLY}</Code>
              <Code>{CONFIG_EVENTS}</Code>
            </div>
            <p className="install-note">
              Read today: <code>repo</code>, <code>workflow.keywords</code>,{" "}
              <code>mode</code>, <code>analytics.calls</code>,{" "}
              <code>events</code>. Planned, not enforced yet:{" "}
              <code>requires_seq</code>, <code>privacy</code>,{" "}
              <code>probe</code>.
            </p>
            <Code>{ANALYZE}</Code>
            <p>
              The draft is never applied on its own: an operator reviews the
              hypotheses and probe questions first.
            </p>
          </Step>

          <Step number="02" title="Send events with track()">
            <p>
              Copy{" "}
              <a
                href={`${BLOB}/app/src/track.ts`}
                target="_blank"
                rel="noreferrer"
              >
                track.ts
              </a>{" "}
              and call it once per step. It numbers events per session, batches
              them, and drops any property outside the allow-list or anything
              that looks like a wallet address. Already have analytics? Skip
              this and map your names under <code>events:</code>.
            </p>
            <Code>{TRACK}</Code>
          </Step>

          <Step number="03" title="Ask one optional question at the exit">
            <p>
              Drop{" "}
              <a
                href={`${BLOB}/app/src/ProbeCard.tsx`}
                target="_blank"
                rel="noreferrer"
              >
                &lt;ProbeCard/&gt;
              </a>{" "}
              where people leave. It shows only the questions approved before
              the lock, never blocks the exit, and Skip is always one click.
            </p>
            <Code>{PROBE}</Code>
            <p>Approve the draft, lock v1, and start collecting:</p>
            <Code>{LOCK}</Code>
          </Step>
        </main>
        <footer>
          <span>GhostReport · Install</span>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source on GitHub ↗
          </a>
        </footer>
      </div>
    </Shell>
  );
}
