import draft from "../../fixtures/partb/draft.ens.json" with { type: "json" };
import review from "../../fixtures/partb/review.json" with { type: "json" };
import type { PartB } from "./partb";

const permalink = (file: string, lines: number[]) =>
  `${review.target.repo}/blob/${review.target.commit}/${encodeURI(file)}#L${lines[0]}${lines[0] === lines[1] ? "" : `-L${lines[1]}`}`;

export function mockPartB(): PartB {
  const checks = review.ref_check.checks;
  return {
    label: "Tested on a real repo: ENS",
    mode: "code_only",
    target: review.target,
    finding: {
      ...review.finding,
      refs: review.finding.refs.map((ref) => ({
        ...ref,
        permalink: permalink(ref.file, ref.lines),
      })),
    },
    flow_map: (["states", "outcomes", "ui_facts"] as const).flatMap((kind) =>
      draft.workflow[kind].map((fact) => {
        const check = checks.find((c) => c.id === fact.id)!;
        return {
          id: fact.id,
          kind,
          desc: fact.desc,
          instrumentation:
            fact.instrumentation as PartB["flow_map"][number]["instrumentation"],
          ...fact.code_ref,
          permalink: permalink(fact.code_ref.file, fact.code_ref.lines),
          ref_check: check.verdict as PartB["flow_map"][number]["ref_check"],
          ref_note: check.note,
        };
      }),
    ),
    cannot_check: draft.cannot_check,
    ref_check: {
      method: review.ref_check.method,
      checked: checks.length,
      correct: checks.filter((c) => c.verdict === "correct").length,
      wrong: checks.filter((c) => c.verdict === "wrong").length,
      partial: checks.filter((c) => c.verdict === "partial").length,
    },
    scope: {
      searched_files: draft.workflow.scope.searched_files.length,
      truncated: draft.workflow.scope.truncated,
      token_cap: 30_000,
      commit_sha: draft.workflow.scope.commit_sha,
    },
    limits: review.limits,
    llm: draft.llm,
  };
}
