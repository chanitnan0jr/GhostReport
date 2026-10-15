export interface PartBRef {
  file: string;
  lines: number[];
  permalink: string;
  label?: string;
}
export interface PartB {
  label: string;
  mode: "code_only";
  target: { repo: string; commit: string; license: string };
  finding: { title: string; text: string; refs: PartBRef[] };
  flow_map: (PartBRef & {
    id: string;
    kind: "states" | "outcomes" | "ui_facts";
    desc: string;
    instrumentation: "found_in_code" | "not_found_in_scope" | "unknown";
    ref_check: "correct" | "wrong" | "partial";
    ref_note: string;
  })[];
  cannot_check: { rule_id: string; needs_event: string; rule: string }[];
  ref_check: {
    method: string;
    checked: number;
    correct: number;
    wrong: number;
    partial: number;
  };
  scope: {
    searched_files: number;
    truncated: boolean;
    token_cap: number;
    commit_sha: string;
  };
  limits: string[];
  llm: { model: string; thinking: boolean; prompts: string[] };
}

export function sourceLink(value: string, commit: string): string | null {
  try {
    const url = new URL(value);
    return url.origin === "https://github.com" &&
      /^[a-f0-9]{40}$/.test(commit) &&
      url.pathname.startsWith(`/ensdomains/ens-app-v3/blob/${commit}/`)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function fetchPartB(signal: AbortSignal): Promise<PartB> {
  const response = await fetch("/api/partb", { signal });
  if (!response.ok)
    throw new Error(`Code-only report unavailable (${response.status})`);
  const value = await response.json();
  if (
    !value ||
    value.mode !== "code_only" ||
    value.target?.repo !== "https://github.com/ensdomains/ens-app-v3" ||
    !/^[a-f0-9]{40}$/.test(value.target?.commit ?? "") ||
    !Array.isArray(value.flow_map) ||
    !Array.isArray(value.finding?.refs) ||
    !Array.isArray(value.cannot_check) ||
    !value.scope ||
    !value.ref_check ||
    !Array.isArray(value.limits) ||
    !value.llm
  )
    throw new Error("Unexpected code-only report response");
  return value as PartB;
}
