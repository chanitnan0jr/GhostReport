import { lazy, Suspense, useEffect, useState } from "react";
import { GeneratedJourneys } from "./GeneratedJourneys";
import { activeSite } from "../../shared/navigation";
import { ConsoleHeader, useConsoleHash } from "./ConsoleHeader";
import { InvestigationDocument } from "./InvestigationDocument";
import { Segments } from "./Segments";
import { OperatorBar } from "./OperatorBar";
import { OperatorGate } from "./OperatorGate";
import { reportWarnings, safeText, time } from "./format";
import { useReport } from "./useReport";
import { sandboxId } from "./api";
import { SandboxPanel } from "./sandbox/SandboxPanel";
import { SANDBOX_BANNER } from "./sandbox/types";

const WorkflowMap = lazy(() => import("./WorkflowMap"));
const EnsSimulation = lazy(() => import("./EnsSimulation"));

export default function App() {
  const project = activeSite(new URL(location.href));
  const { report, error, updatedAt, refresh } = useReport(project === "app");
  const warnings = report ? reportWarnings(report) : [];
  const mode = report?.run.mode;
  const hash = useConsoleHash();
  const sandbox = sandboxId();
  const [simulation, setSimulation] = useState(
    new URLSearchParams(location.search).get("simulation"),
  );
  const ready = report !== null;
  const page =
    hash === "#segments"
      ? "segments"
      : hash === "#workflow" || hash.startsWith("#fact-")
        ? "workflow"
        : "report";
  useEffect(() => {
    if ((page === "report" && !ready) || !hash) return;
    const frame = requestAnimationFrame(() => {
      // A sandbox opens each page at the top, so its controls come first.
      if (sandbox && (hash === "#segments" || hash === "#workflow"))
        window.scrollTo({ top: 0 });
      else
        document
          .getElementById(
            hash.startsWith("#fact-") ? "workflow" : hash.slice(1),
          )
          ?.scrollIntoView();
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, ready, page, sandbox]);
  if (project === "ens")
    return (
      <>
        <ConsoleHeader hash={hash} />
        <div className="console-shell">
          <main className="workspace">
            <p className="mode-banner">
              {simulation
                ? "ENS simulation · synthetic events and feedback · separate from visitor data"
                : "ENS data · code_only · read-only · nothing deployed"}
            </p>
            {page === "workflow" ? (
              <Suspense fallback={<p>Opening Workflow Map…</p>}>
                <WorkflowMap target="ens" />
              </Suspense>
            ) : page === "segments" ? (
              simulation ? (
                <Suspense fallback={<p>Opening simulation…</p>}>
                  <EnsSimulation page="segments" />
                </Suspense>
              ) : (
                <div id="segments">
                  <GeneratedJourneys project="ens" />
                  <p>
                    <a href="/report/?project=ens">
                      Test the report with simulated events and feedback →
                    </a>
                  </p>
                </div>
              )
            ) : (
              <Suspense fallback={<p>Opening simulation…</p>}>
                <EnsSimulation onCreated={setSimulation} />
              </Suspense>
            )}
          </main>
        </div>
      </>
    );
  return (
    <>
      <ConsoleHeader hash={hash} />
      <div className="console-shell">
        <main
          id="top"
          className={`workspace${page === "segments" ? " segments-workspace" : page === "report" ? " report-workspace" : ""}`}
        >
          {sandbox && (
            <>
              <div className="mode-banner sandbox" role="status">
                <strong>SANDBOX</strong>
                <span>{SANDBOX_BANNER}</span>
              </div>
              <SandboxPanel
                sandboxId={sandbox}
                report={report}
                refresh={refresh}
              />
            </>
          )}
          {page !== "report" && (
            <header className="workspace-top">
              <span>
                {new URLSearchParams(location.search).get("operator") === "1"
                  ? "Operator console"
                  : page === "segments"
                    ? "User journeys and segments"
                    : page === "workflow"
                      ? "App workflow and instrumentation"
                      : "Wallet step investigation report"}
              </span>
              <div className="refresh-status">
                <span
                  className={error ? "status-dot warning-dot" : "status-dot"}
                />
                {error ? "Refresh interrupted" : "Polls every 3 s"}
                {updatedAt && (
                  <span className="last-updated">
                    Last received {time(updatedAt)}
                  </span>
                )}
              </div>
            </header>
          )}
          {page !== "report" &&
            (mode === "seed" || mode === "replay" || mode === "demo") && (
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
          {page === "segments" ? (
            <Segments report={report} />
          ) : page === "workflow" ? (
            <Suspense
              fallback={
                <section id="workflow" className="panel" role="status">
                  Opening Workflow Map…
                </section>
              }
            >
              <WorkflowMap revision={report?.workflow.version} />
            </Suspense>
          ) : !report ? (
            <div className="loading-state" role="status">
              <h1>Opening the investigation</h1>
              <p>Waiting for the report API…</p>
              <button className="secondary" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          ) : (
            <InvestigationDocument
              report={report}
              updatedAt={updatedAt}
              refreshError={Boolean(error)}
            >
              {!sandbox && (
                <OperatorGate key={report.run.run_id}>
                  <OperatorBar
                    key={report.run.run_id}
                    report={report}
                    refresh={refresh}
                  />
                </OperatorGate>
              )}
            </InvestigationDocument>
          )}
        </main>
      </div>
    </>
  );
}
