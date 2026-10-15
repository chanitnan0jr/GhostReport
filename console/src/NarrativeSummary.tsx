import { safeText, selfReportLabel } from "./format";
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
        <div>
          <p className="section-kicker">
            Before and after the optional question
          </p>
          <h1 id="summary-title">Wallet step investigation report</h1>
        </div>
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
          <div className="narrative-copy">
            <h2>Summary</h2>
            <p className="narrative-text">
              {/\b(?:recommend\w*|should|most common reason)\b/i.test(
                narrative.text,
              )
                ? "Summary withheld by wording guard. See the counted evidence below."
                : safeText(narrative.text)}
            </p>
          </div>
          <details className="narrative-facts">
            <summary>See the facts</summary>
            <p className="small muted">
              Source facts from the report API. Numeric fields are unchanged;
              string labels use the same wording guard as the report.
            </p>
            <pre>
              {JSON.stringify(
                narrative.facts ?? {},
                (_key, value: unknown) =>
                  typeof value === "string" ? selfReportLabel(value) : value,
                2,
              )}
            </pre>
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
