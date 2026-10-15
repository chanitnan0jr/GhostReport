import { cohortNames } from "./format";
import type { Report } from "./types";

export function YourSession({
  report,
  sid,
}: {
  report: Report;
  sid: string | null;
}) {
  if (!sid) return null;
  const session = report.current.sessions.find((s) => s.session_id === sid);
  return (
    <aside className="your-session" aria-label="Your session">
      <div>
        <strong>Your session</strong>
        <p>
          {session
            ? cohortNames[session.cohort]
            : "Waiting for your recorded activity"}
        </p>
      </div>
      {session ? (
        <div className="your-session-details">
          <span>Telemetry coverage: {session.coverage}</span>
          <span>Exit: {session.exit_type.replaceAll("_", " ")}</span>
        </div>
      ) : (
        <p className="muted small">
          After trying the app, this panel will show where your session landed.
        </p>
      )}
      <a href={`/app/?sid=${encodeURIComponent(sid)}`}>
        Return to your session
      </a>
    </aside>
  );
}
