import { findingText } from "./format";
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
