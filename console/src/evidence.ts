import type { Finding } from "./types";
import { findingText } from "./format";

interface Base {
  id: string;
  column: number;
  label: string;
}
export type EvidenceNode =
  | (Base & {
      kind: "code";
      desc: string;
      file: string;
      lines: number[];
      quote: string;
      instrumentation: string;
      permalink: string | null;
    })
  | (Base & {
      kind: "hypothesis";
      statement: string;
      approved_class: string | null;
      generic: boolean;
      v1: string;
      current: string[];
    })
  | (Base & { kind: "option"; decision_point: string })
  | (Base & { kind: "rule"; text: string })
  | (Base & {
      kind: "finding";
      decision_point: string;
      cohort: string;
      self_report: string;
      observation: string;
    } & Pick<Finding, "selected" | "respondents" | "text" | "by_source">)
  | (Base & { kind: "segment"; segment: string });
export interface EvidenceGraph {
  columns: { index: number; label: string }[];
  nodes: EvidenceNode[];
  edges: { source: string; target: string; relation: string }[];
  highlight: Record<string, string[]>;
  notes: string[];
}

export function evidenceSourceLink(value: string | null): string | null {
  try {
    if (!value) return null;
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.origin === "https://github.com" &&
      /^\/[^/]+\/[^/]+\/blob\/[0-9a-f]{40}\//.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function fetchEvidence(
  signal: AbortSignal,
): Promise<EvidenceGraph> {
  const response = await fetch("/api/evidence", { signal });
  if (!response.ok)
    throw new Error(`Hypothesis evidence map unavailable (${response.status})`);
  const value: EvidenceGraph = await response.json();
  if (
    !value ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.notes) ||
    value.notes.some((note) => typeof note !== "string") ||
    !value.highlight
  )
    throw new Error("Unexpected hypothesis evidence response");
  const ids = new Set(value.nodes.map((node) => node.id));
  const columns = new Set(value.columns.map((column) => column.index));
  if (
    columns.size !== value.columns.length ||
    value.columns.some(
      (column) =>
        !Number.isInteger(column.index) ||
        column.index < 0 ||
        typeof column.label !== "string",
    ) ||
    ids.size !== value.nodes.length ||
    value.nodes.some(
      (node) =>
        typeof node.id !== "string" ||
        typeof node.label !== "string" ||
        !columns.has(node.column) ||
        ![
          "code",
          "hypothesis",
          "option",
          "rule",
          "finding",
          "segment",
        ].includes(node.kind),
    ) ||
    value.edges.some(
      (edge) =>
        !ids.has(edge.source) ||
        !ids.has(edge.target) ||
        typeof edge.relation !== "string",
    ) ||
    Object.entries(value.highlight).some(
      ([id, members]) =>
        !ids.has(id) ||
        !Array.isArray(members) ||
        members.some((member) => !ids.has(member)),
    )
  )
    throw new Error(
      "Hypothesis evidence links do not match the supplied nodes",
    );
  for (const node of value.nodes) {
    if (
      (node.kind === "hypothesis" &&
        (typeof node.statement !== "string" ||
          typeof node.v1 !== "string" ||
          !Array.isArray(node.current) ||
          node.current.some((label) => typeof label !== "string") ||
          !Array.isArray(value.highlight[node.id]))) ||
      (node.kind === "code" &&
        (typeof node.desc !== "string" ||
          typeof node.quote !== "string" ||
          typeof node.file !== "string" ||
          !Array.isArray(node.lines))) ||
      (node.kind === "rule" && typeof node.text !== "string") ||
      (node.kind === "finding" &&
        (findingText(node) === null ||
          typeof node.self_report !== "string" ||
          typeof node.observation !== "string"))
    )
      throw new Error(
        "Hypothesis evidence details or respondent counts are invalid",
      );
  }
  return value;
}
