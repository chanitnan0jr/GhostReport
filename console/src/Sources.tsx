import { findingText, sessions } from "./format";
import type { Finding, Report, Session, SessionSource } from "./types";

const names: Record<SessionSource, string> = {
  seed: "Simulated users (Playwright) — seed",
  test: "Tests (automated)",
  visitor: "Visitors",
};
const sources = ["seed", "test", "visitor"] as const;

export function sessionSource(report: Report, session: Session): string {
  const source =
    report.current.session_sources?.[session.session_id] ?? session.source;
  return source
    ? (names[source] ?? "Source unavailable")
    : "Source unavailable";
}

export function Population({ report }: { report: Report }) {
  const counts = report.current.sources;
  const total = report.current.sessions.length;
  const valid =
    counts &&
    sources.every((s) => Number.isInteger(counts[s]) && counts[s] >= 0) &&
    sources.reduce((n, s) => n + counts[s], 0) === total;
  return (
    <aside className="population" aria-label="Session sources">
      <div className="population-heading">
        <strong>Recorded session sources</strong>
        <span className="evidence-label">Observed</span>
      </div>
      {valid ? (
        <>
          <p className="population-summary">
            {report.current.population ?? "Source totals below"}
          </p>
          <dl>
            {sources.map((source) => (
              <div key={source}>
                <dt>{names[source]}</dt>
                <dd>{sessions(counts[source], total)}</dd>
              </div>
            ))}
          </dl>
          <p className="muted small">
            Seed and test sessions are simulations. Combined report labels
            include these sources; visitor counts are shown separately. Sessions
            are not verified unique people.
          </p>
        </>
      ) : (
        <p className="muted">
          Source breakdown is unavailable in this report. Do not interpret this
          population as visitor-only evidence.
        </p>
      )}
    </aside>
  );
}

export function FindingSources({
  finding,
}: {
  finding: Pick<Finding, "selected" | "respondents" | "text" | "by_source">;
}) {
  if (!finding.by_source || !findingText(finding)) return null;
  return (
    <div className="finding-sources" aria-label="Respondents by source">
      <span className="small muted">
        Combined label above; selections by source:
      </span>
      {sources.map((source) => {
        const value = finding.by_source?.[source];
        return value ? (
          <span key={source}>
            <strong>{names[source]}</strong> · {value.selected} of{" "}
            {value.respondents} respondents
          </span>
        ) : null;
      })}
      <span className="small muted">
        A visitor-only status is not supplied.
      </span>
    </div>
  );
}
