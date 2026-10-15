import { useEffect, useState } from "react";
import { fetchPartB, sourceLink, type PartB, type PartBRef } from "./partb";
import { SiteHeader } from "./SiteHeader";
const safeText = (value: string) =>
  /\b(?:confirmed|root cause|cause|proved)\b/i.test(value)
    ? "Text withheld by wording guard"
    : value;

function Reference({ ref, commit }: { ref: PartBRef; commit: string }) {
  const href = sourceLink(ref.permalink, commit);
  const label = `${ref.file}:${ref.lines[0] === ref.lines[1] ? ref.lines[0] : ref.lines.join("–")}`;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      <code>{label}</code> ↗
    </a>
  ) : (
    <code>{label}</code>
  );
}

export function PartBPage() {
  const [report, setReport] = useState<PartB | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetchPartB(
      AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    )
      .then((value) => {
        if (!controller.signal.aborted) setReport(value);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Code-only report unavailable",
          );
      });
    return () => controller.abort();
  }, [revision]);

  return (
    <div className="partb-shell">
      <SiteHeader />
      <main className="partb-page">
        <p className="section-kicker">Part B · Independent repository</p>
        <h1>Tested on a real repo: ENS</h1>
        <p className="partb-intro">
          A read-only investigation of code our team did not write. No ENS user
          sessions were collected and no questions were delivered.
        </p>
        {error ? (
          <div className="warning" role="alert">
            <strong>Code-only report unavailable</strong>
            <span>{safeText(error)}</span>
            <button
              className="secondary"
              onClick={() => {
                setError("");
                setRevision((n) => n + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : !report ? (
          <p role="status">Loading the reviewed investigation…</p>
        ) : (
          <>
            <div className="partb-metadata">
              <span>
                Mode <code>code_only (read-only, nothing deployed)</code>
              </span>
              <span>
                Repo{" "}
                <a href={report.target.repo} target="_blank" rel="noreferrer">
                  {report.target.repo}
                </a>
              </span>
              <span>
                License <strong>{safeText(report.target.license)}</strong>
              </span>
              <span>
                Commit <code>{report.target.commit}</code>
              </span>
            </div>
            <section
              className="panel partb-finding"
              aria-labelledby="ens-finding-title"
            >
              <span className="evidence-label">Code evidence</span>
              <h2 id="ens-finding-title">{report.finding.title}</h2>
              <p>{report.finding.text}</p>
              <ul className="partb-refs">
                {report.finding.refs.map((ref) => (
                  <li key={ref.permalink}>
                    <p>{safeText(ref.label ?? "Reviewed code reference")}</p>
                    <Reference ref={ref} commit={report.target.commit} />
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel" aria-labelledby="ens-review-title">
              <span className="evidence-label">
                Code evidence · Human review
              </span>
              <h2 id="ens-review-title">What the human check found</h2>
              <p>{safeText(report.ref_check.method)}</p>
              <p className="partb-review-counts">
                {report.ref_check.correct} correct · {report.ref_check.wrong}{" "}
                wrong · {report.ref_check.partial} partial (checked by hand)
              </p>
              <p className="muted">
                A matching file, line and quote does not by itself establish
                that the description is supported. Review corrections are
                visible below.
              </p>
            </section>
            <section className="panel" aria-labelledby="ens-map-title">
              <span className="evidence-label">
                Code evidence · Model extraction + human review
              </span>
              <h2 id="ens-map-title">Registration flow map</h2>
              <p className="muted">
                Model descriptions are shown alongside the reviewer verdict.
                Restricted wording is redacted; the pinned source remains
                available. Rows marked wrong or partial must be read with their
                corrections.
              </p>
              <div className="table-scroll">
                <table className="partb-table">
                  <thead>
                    <tr>
                      <th>Kind / fact</th>
                      <th>Model description</th>
                      <th>Instrumentation in scope</th>
                      <th>Code reference</th>
                      <th>Human check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.flow_map.map((fact) => (
                      <tr key={fact.id} className={`review-${fact.ref_check}`}>
                        <th scope="row">
                          <span className="small muted">
                            {fact.kind.replaceAll("_", " ")}
                          </span>
                          <code>{fact.id}</code>
                        </th>
                        <td>
                          {fact.desc.replace(
                            /\b(?:confirmed|root cause|cause|proved)\b/gi,
                            "[restricted wording]",
                          )}
                        </td>
                        <td>
                          {fact.kind !== "outcomes"
                            ? "Not assessed for this fact"
                            : fact.instrumentation === "found_in_code"
                              ? "Found in code"
                              : fact.instrumentation === "not_found_in_scope"
                                ? "Not found in searched files"
                                : "Unknown"}
                        </td>
                        <td>
                          <Reference ref={fact} commit={report.target.commit} />
                        </td>
                        <td>
                          <strong className="review-verdict">
                            {fact.ref_check}
                          </strong>
                          {fact.ref_note && <p>{safeText(fact.ref_note)}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel" aria-labelledby="ens-cannot-title">
              <span className="evidence-label">Policy</span>
              <h2 id="ens-cannot-title">Checks that could not run</h2>
              {report.cannot_check.map((item) => (
                <article key={`${item.rule_id}:${item.needs_event}`}>
                  <h3>
                    Cannot check {item.rule_id}: needs {item.needs_event}
                  </h3>
                  <p>
                    Requires <code>{safeText(item.needs_event)}</code>. The
                    target’s event mapping does not provide this event, so the
                    check was dropped. No behavioral conclusion follows.
                  </p>
                </article>
              ))}
            </section>
            <section className="panel" aria-labelledby="ens-limits-title">
              <span className="evidence-label">
                Code evidence · Scope limitations
              </span>
              <h2 id="ens-limits-title">Scope and limitations</h2>
              <p>
                <strong>{report.scope.searched_files} searched files</strong> ·{" "}
                {report.scope.token_cap.toLocaleString("en-US")} token cap ·{" "}
                {report.scope.truncated
                  ? "Truncated context"
                  : "Context not truncated"}
              </p>
              <ul>
                {report.limits.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
              <p className="muted">
                The successful-connection reference was additionally checked by
                hand outside the searched files. No whole-repository absence or
                user intent is established by this code-only investigation.
              </p>
              <p className="small muted">
                Model <code>{safeText(report.llm.model)}</code> · Thinking{" "}
                {report.llm.thinking ? "on" : "off"} · Prompts{" "}
                {report.llm.prompts.map(safeText).join(", ")}
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
