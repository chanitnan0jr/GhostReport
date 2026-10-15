import { OperatorBar } from "./OperatorBar";
import { OperatorGate } from "./OperatorGate";
import { ReportPanels } from "./ReportPanels";
import { RunBanner } from "./RunBanner";
import { reportWarnings, safeText, time } from "./format";
import { useReport } from "./useReport";
import { Population } from "./Sources";

const navigation = [
  ["funnel", "Funnel"],
  ["hypotheses", "Hypotheses"],
  ["workflow", "Workflow"],
  ["gaps", "Evidence gaps"],
  ["trace", "Decision trace"],
  ["coverage", "Coverage"],
  ["findings", "Findings"],
  ["next-action", "Next action"],
  ["limitations", "Limitations"],
];

export default function App() {
  const { report, error, updatedAt, refresh } = useReport();
  const warnings = report ? reportWarnings(report) : [];
  const mode = report?.run.mode;
  return (
    <div className="console-shell">
      <aside className="sidebar">
        <a className="brand" href="#top">
          <span className="brand-icon" aria-hidden="true">
            G
          </span>
          GhostReport
        </a>
        <span className="nav-title">Investigation</span>
        <nav aria-label="Report panels">
          {navigation.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <a className="partb-link" href="/ens/">
          Tested on ENS ↗
        </a>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Evidence you can trace
        </div>
      </aside>
      <main id="top" className="workspace">
        <header className="workspace-top">
          <span>
            {new URLSearchParams(location.search).get("operator") === "1"
              ? "Operator console"
              : "Investigation report"}
          </span>
          <div className="refresh-status">
            <span className={error ? "status-dot warning-dot" : "status-dot"} />
            {error ? "Refresh interrupted" : "Polls every 3 s"}
            {updatedAt && (
              <span className="last-updated">
                Last received {time(updatedAt)}
              </span>
            )}
          </div>
        </header>
        {(mode === "seed" || mode === "replay" || mode === "demo") && (
          <div className={`mode-banner ${mode}`} role="status">
            <strong>
              {mode === "replay"
                ? "REPLAY"
                : mode === "demo"
                  ? "DEMO"
                  : "SEED DATA"}
            </strong>
            <span>
              {mode === "replay"
                ? "Recorded run. This is not a live investigation."
                : mode === "demo"
                  ? "Prepared investigation + recorded activity"
                  : "Demonstration dataset. These are not live participant results."}
            </span>
          </div>
        )}
        {error && (
          <div className="warning" role="alert">
            <strong>Report refresh unavailable</strong>
            <span>{safeText(error)}</span>
            <span>
              {report
                ? "The last received report is shown below."
                : "Please try again in a moment."}
            </span>
          </div>
        )}
        {!report ? (
          <div className="loading-state" role="status">
            <h1>Opening the investigation</h1>
            <p>Waiting for the report API…</p>
            <button className="secondary" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="investigation-title">
              <div>
                <p className="section-kicker">Wallet onboarding</p>
                <h1>What’s behind the drop-off?</h1>
                <p className="muted">
                  An investigation into sessions that did not start connecting.
                </p>
              </div>
              <code className="investigation-id">
                {safeText(report.investigation_id)}
              </code>
            </div>
            <RunBanner run={report.run} />
            <Population report={report} />
            <OperatorGate key={report.run.run_id}>
              <OperatorBar
                key={report.run.run_id}
                report={report}
                refresh={refresh}
              />
            </OperatorGate>
            <nav className="mobile-report-nav" aria-label="Jump to report">
              <a href="/ens/">Tested on ENS</a>
              <a href="#coverage">Your session & coverage</a>
              <a href="#findings">Findings</a>
              <a href="#limitations">Limitations</a>
            </nav>
            {warnings.length > 0 && (
              <div className="warning report-errors" role="alert">
                <strong>Report requires attention</strong>
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="snapshot-context">
              <div>
                <span>v1 baseline</span>
                <strong>
                  {report.v1 ? "Locked before probe evidence" : "Awaiting lock"}
                </strong>
              </div>
              <div>
                <span>Current evidence</span>
                <strong>{time(report.current.data_cutoff)}</strong>
              </div>
              <div>
                <span>Last written snapshot</span>
                <strong>
                  {report.snapshots.length
                    ? `v${report.snapshots.at(-1)!.version} · ${time(report.snapshots.at(-1)!.data_cutoff)}`
                    : "None written"}
                </strong>
              </div>
            </div>
            <ReportPanels report={report} />
            <footer className="report-footer">
              Policy <code>{safeText(report.run.policy_version)}</code> ·
              Catalog <code>{safeText(report.run.catalog_version)}</code> ·
              Build <code>{safeText(report.run.app_build)}</code> · Commit{" "}
              <code>{safeText(report.run.code_commit)}</code>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
