import { apiUrl, authorizedRequest, sandboxId } from "./api";
import { readSandboxToken } from "../../shared/sandbox";

export interface JourneySpec {
  project: "app" | "ens";
  version: number;
  columns: { state_id: string; events: string[] }[];
  segments: { id: string; label: string }[];
  rules: {
    id: string;
    label: string;
    segment: string;
    predicate: object;
    rationale: string;
    evidence: {
      node_id: string;
      file: string;
      lines: number[];
      quote: string;
    }[];
  }[];
}
export interface SpecRecord {
  spec: JourneySpec;
  digest: string;
  approved_by?: string;
  approved_at?: string;
}
export interface JourneyComparison {
  code_only: boolean;
  total_sessions?: number;
  nodes: {
    id: string;
    column: number;
    label: string;
    ref_check?: "correct" | "wrong" | "partial" | null;
    ref_note?: string | null;
    sessions?: number;
    total_sessions?: number;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    sessions?: number;
    total_sessions?: number;
  }[];
  segments: {
    id: string;
    label: string;
    sessions?: number;
    total_sessions?: number;
    by_source?: Record<string, number>;
    template_cohorts?: Record<string, number>;
  }[];
}
export interface SpecView {
  project: "app" | "ens";
  status: "ready" | "running";
  validation: string[];
  stale: boolean;
  draft: SpecRecord | null;
  approved: SpecRecord | null;
  template: JourneySpec | null;
  comparison: JourneyComparison | null;
}
export async function readSpec(
  project: string,
  signal?: AbortSignal,
  source?: string,
  exclude?: string,
): Promise<SpecView> {
  const query = new URLSearchParams({ project });
  if (source) query.set("source", source);
  if (exclude) query.set("exclude", exclude);
  const path = `/api/journeys/spec?${query}`;
  const response = await fetch(project === "ens" ? path : apiUrl(path), {
    signal,
  });
  if (!response.ok)
    throw new Error(
      "Journey definitions are unavailable. The template is unchanged.",
    );
  const value = await response.json();
  if (
    !value ||
    !Array.isArray(value.validation) ||
    !("approved" in value) ||
    !("draft" in value)
  )
    throw new Error(
      "Journey definitions are unavailable. The template is unchanged.",
    );
  return value as SpecView;
}
export async function journeyAction(
  action: "generate" | "approve",
  body?: object,
  project: "app" | "ens" = "app",
) {
  const path = `/api/journeys/${action}?project=${project}`;
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const sandbox = sandboxId();
  if (!sandbox || project === "ens") return authorizedRequest(path, init);
  const token = readSandboxToken(sandbox);
  if (!token)
    throw new Error(
      "Only the sandbox owner can change its journey definitions.",
    );
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      typeof value.detail === "string"
        ? value.detail
        : "The journey request failed.",
    );
  return value;
}
