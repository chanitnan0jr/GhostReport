import type { ReactNode } from "react";
import { findingLabel, findingText, safeText } from "./format";
import type { CodeFact, Finding } from "./types";
import { FindingSources } from "./Sources";

export function Panel({
  id,
  title,
  label,
  description,
  children,
  className = "",
}: {
  id: string;
  title: string;
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`panel ${className}`}
      aria-labelledby={`${id}-title`}
      data-panel={id}
    >
      <header className="panel-header">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <span className="evidence-label">{label}</span>
      </header>
      {children}
    </section>
  );
}

export function EvidenceRefs({ ids }: { ids: string[] }) {
  if (!ids.length)
    return <span className="small muted">No evidence references recorded</span>;
  return (
    <details className="evidence-refs">
      <summary>Evidence references</summary>
      <ul>
        {ids.map((id) => (
          <li key={id}>
            <code>{safeText(id)}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function CodeReference({ fact }: { fact: CodeFact }) {
  const ref = fact.code_ref;
  return (
    <div className="code-reference">
      <code className="file-ref">
        {safeText(ref.file)}:{ref.lines.join("–")}
      </code>
      <pre>
        <code>{safeText(ref.quote)}</code>
      </pre>
    </div>
  );
}

export function FindingStatus({ finding }: { finding: Finding }) {
  const label = findingLabel(finding);
  const text = findingText(finding);
  return (
    <div className="finding-status">
      <div className="status-row">
        <span
          className={`status ${label === "Unresolved" ? "neutral" : "reported"}`}
        >
          {safeText(label)}
        </span>
        {finding.evidence_conflict && (
          <span className="conflict">Evidence conflict</span>
        )}
      </div>
      <strong className="count-text">
        {text ?? "Count withheld by validation guard"}
      </strong>
      <FindingSources finding={finding} />
      <span className="observation">{safeText(finding.observation)}</span>
      <EvidenceRefs ids={finding.evidence_ids} />
    </div>
  );
}
