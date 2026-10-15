import { useEffect, useState } from "react";
import { apiUrl } from "./api";

export type FactEvidence =
  "observed" | "self_report" | "probe" | "code" | "run" | "plan";

// engine/report_doc.py: one fact the document may cite, with its source in /api/report.
export interface DocFact {
  id: string;
  kind: string;
  evidence: FactEvidence;
  label: string;
  statement: string;
  source: string;
  numbers: number[];
  pairs: [number, number, "sessions" | "respondents"][];
  data: Record<string, unknown>;
  refs: { file: string; lines: number[]; quote: string }[];
  related: string[];
}

export interface ReportDocument {
  markdown: string;
  source: "llm" | "template";
  rejected: string[];
  pending?: boolean;
  context_sha256: string;
  snapshot_id: string;
  generated_at: string | null;
  prompt: string | null;
  title: string;
  investigation_id: string;
  outline: string[];
  facts: DocFact[];
}

function isDocument(value: unknown): value is ReportDocument {
  return (
    !!value &&
    typeof value === "object" &&
    "markdown" in value &&
    typeof value.markdown === "string" &&
    "facts" in value &&
    Array.isArray(value.facts) &&
    "context_sha256" in value
  );
}

/**
 * The document for the current evidence snapshot. It is fetched again when the report's
 * evidence changes, and while an AI draft is pending, until the checked draft arrives.
 */
export function useReportDocument(revision: string) {
  const [doc, setDoc] = useState<ReportDocument | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/api/report/document"), {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Report document unavailable (${response.status})`);
        const value: unknown = await response.json();
        if (!isDocument(value)) throw new Error("Unexpected report document");
        if (controller.signal.aborted) return;
        setDoc((prev) =>
          prev &&
          prev.context_sha256 === value.context_sha256 &&
          prev.source === value.source &&
          prev.pending === value.pending
            ? prev
            : value,
        );
        setError("");
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Report document unavailable",
          );
      });
    return () => controller.abort();
  }, [revision, tick]);
  const waiting = Boolean(error) || Boolean(doc?.pending);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [waiting]);
  return { doc, error };
}
