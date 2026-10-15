import { safeText } from "./format";
import type { Report } from "./types";

export function RunBanner({ run }: { run: Report["run"] }) {
  const verification = Object.entries(run.verification ?? {});
  return (
    <div className="run-banner" aria-label="Run information">
      <div className="run-info">
        <span>
          Run <code>{safeText(run.run_id)}</code>
        </span>
        <span>
          Mode <strong>{safeText(run.mode)}</strong>
        </span>
        <span>
          Build {run.build_verified ? "verified" : "unverified"} ·{" "}
          <code>{safeText(run.code_commit)}</code>
        </span>
      </div>
      {verification.length ? (
        <ul className="verification-list">
          {verification.map(([event, info]) => (
            <li key={event}>
              <code>{safeText(event)}</code>
              {info.verified === true && info.test && info.commit ? (
                <>
                  {" "}
                  verified by <code>{safeText(info.test)}</code> at{" "}
                  <code>{safeText(info.commit)}</code>
                </>
              ) : (
                <span className="unverified"> unverified</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">
          Event verification details are not supplied in this report.
        </p>
      )}
    </div>
  );
}
