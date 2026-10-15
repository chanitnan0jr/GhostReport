import { safeText } from "./format";
import type { Report } from "./types";

export function NarrativeSummary({ report }: { report: Report }) {
  const narrative = report.narrative;
  const usable =
    narrative &&
    (narrative.source === "llm" || narrative.source === "template") &&
    typeof narrative.text === "string";
  return (
    <section
      className="narrative-summary"
      id="summary"
      aria-labelledby="summary-title"
    >
      <div className="narrative-heading">
        <h1 id="summary-title">Investigation summary</h1>
        {usable && (
          <span className="narrative-badge">
            {narrative.source === "llm"
              ? "Written by AI · every number checked against the facts"
              : "Template summary"}
          </span>
        )}
      </div>
      {usable ? (
        <>
          <p className="narrative-text">{safeText(narrative.text)}</p>
          <details className="narrative-facts">
            <summary>See the facts</summary>
            <pre>{JSON.stringify(narrative.facts ?? {}, null, 2)}</pre>
          </details>
        </>
      ) : (
        <p className="muted">
          A checked summary is not available in this report yet.
        </p>
      )}
    </section>
  );
}
