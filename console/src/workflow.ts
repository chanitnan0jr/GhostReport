export type Instrumentation =
  "found_in_code" | "not_found_in_scope" | "unknown";
export type WorkflowTarget = "app" | "ens";
export interface WorkflowFact {
  id: string;
  kind: "state" | "outcome" | "ui_fact";
  order: number;
  desc: string;
  instrumentation: Instrumentation;
  file: string;
  lines: number[];
  quote: string;
  permalink: string | null;
  ref_check: "correct" | "wrong" | "partial" | null;
  ref_note: string | null;
}
export interface WorkflowView {
  target: WorkflowTarget;
  label: string;
  mode: string;
  repo: string | null;
  commit: string;
  permalinks: string | null;
  scope: { searched_files: number; truncated: boolean };
  legend: Record<Instrumentation, string>;
  nodes: WorkflowFact[];
}
export const instrumentationLabels: Record<Instrumentation, string> = {
  found_in_code: "Found in code",
  not_found_in_scope: "not found in searched files",
  unknown: "Unknown in searched scope",
};
export const instrumentationColors: Record<Instrumentation, string> = {
  found_in_code: "#87e1c3",
  not_found_in_scope: "#f3c67b",
  unknown: "#b2bdcd",
};

export function workflowPermalink(
  view: WorkflowView,
  fact: WorkflowFact,
): string | null {
  try {
    if (!fact.permalink || !view.repo || !/^[a-f0-9]{40}$/.test(view.commit))
      return null;
    const repo = new URL(view.repo);
    const link = new URL(fact.permalink);
    return link.protocol === "https:" &&
      link.origin === repo.origin &&
      link.pathname.startsWith(
        `${repo.pathname.replace(/\/$/, "")}/blob/${view.commit}/`,
      )
      ? link.href
      : null;
  } catch {
    return null;
  }
}

export async function fetchWorkflow(
  target: WorkflowTarget,
  signal: AbortSignal,
): Promise<WorkflowView> {
  const response = await fetch(`/api/workflow?target=${target}`, { signal });
  if (!response.ok)
    throw new Error(`Workflow Map unavailable (${response.status})`);
  const value: WorkflowView = await response.json();
  if (
    !value ||
    value.target !== target ||
    !Array.isArray(value.nodes) ||
    !value.scope ||
    !value.legend ||
    new Set(value.nodes.map((node) => node.id)).size !== value.nodes.length ||
    value.nodes.some(
      (node) =>
        !["state", "outcome", "ui_fact"].includes(node.kind) ||
        !Object.hasOwn(instrumentationLabels, node.instrumentation) ||
        typeof node.desc !== "string" ||
        typeof node.file !== "string" ||
        typeof node.quote !== "string" ||
        !Number.isInteger(node.order) ||
        !Array.isArray(node.lines) ||
        node.lines.length !== 2 ||
        node.lines.some((line) => !Number.isInteger(line) || line < 1),
    )
  )
    throw new Error("Unexpected Workflow Map response");
  return value;
}
