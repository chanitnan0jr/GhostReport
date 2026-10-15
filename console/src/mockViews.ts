import ensDraft from "../../fixtures/partb/draft.ens.json" with { type: "json" };
import ensReview from "../../fixtures/partb/review.json" with { type: "json" };
import type {
  JourneyGraph,
  JourneyNode,
  JourneySegment,
  JourneySource,
} from "./journeys";
import type { Report, Session } from "./types";
import type { WorkflowFact, WorkflowTarget, WorkflowView } from "./workflow";

const sourceCounts = (number: number) => ({
  seed: number,
  test: 0,
  visitor: 0,
});
const columns = [
  "Entry",
  "Apply",
  "Wallet gate",
  "Started connecting",
  "First result",
  "Retry",
  "Exit",
  "Segment",
  "Probe",
];
const definitions = [
  {
    segment: "browsers",
    label: "Left before the wallet gate",
    cohorts: ["no_gate_event"],
    probe: "DP2",
    definition:
      "Viewed a project and left without the wallet gate being recorded.",
  },
  {
    segment: "stalled_at_wallet",
    label: "Stopped at the wallet",
    cohorts: ["gate_event_no_attempt", "attempted_no_success"],
    probe: "DP1",
    definition:
      "Reached the wallet gate but no connection succeeded: chose Not now, or started connecting with no success recorded.",
  },
  {
    segment: "connected",
    label: "Connected",
    cohorts: ["connected"],
    probe: null,
    definition: "A wallet connection succeeded, first time or after a retry.",
  },
] as const;

export function mockJourneys(
  report: Report,
  source?: JourneySource,
): JourneyGraph {
  const sessions = source && source !== "seed" ? [] : report.current.sessions;
  const nodes = new Map<string, JourneyNode>();
  const edges = new Map<string, JourneyGraph["edges"][number]>();
  const pathCounts = new Map<string, Map<string, number>>();
  function steps(session: Session): [number, string, string][] {
    const list: [number, string, string][] = [
      [0, "viewed", "Viewed a project"],
    ];
    if (session.cohort !== "no_gate_event")
      list.push(
        [1, "apply", "Clicked Apply"],
        [2, "gate", "Saw the wallet gate"],
      );
    if (["connected", "attempted_no_success"].includes(session.cohort)) {
      const first = session.attempt_states[0];
      list.push(
        [3, "attempt", "Started connecting"],
        first === "connected"
          ? [4, "connected", "Connected"]
          : first === "errored"
            ? [4, "errored", "Network error (simulated)"]
            : [4, "no_outcome_observed", "No result recorded"],
      );
      if (session.after_retry)
        list.push(
          session.cohort === "connected"
            ? [5, "retry_connected", "Retried → connected"]
            : [5, "retry_no_success", "Retried → no success"],
        );
    }
    list.push([
      6,
      session.exit_type,
      {
        not_now: "Not now",
        back: "Back to projects",
        inactive: "Went quiet (10 min)",
        open: "Still on the page",
      }[session.exit_type],
    ]);
    return list;
  }
  for (const session of sessions) {
    const spec = definitions.find((item) =>
      (item.cohorts as readonly string[]).includes(session.cohort),
    )!;
    const list = steps(session);
    const pathKey = JSON.stringify(list.map((step) => step[2]));
    const paths = pathCounts.get(spec.segment) ?? new Map<string, number>();
    paths.set(pathKey, (paths.get(pathKey) ?? 0) + 1);
    pathCounts.set(spec.segment, paths);
    list.push([7, spec.segment, spec.label]);
    list.forEach(([column, key, label], index) => {
      const id = `c${column}:${key}`;
      const node = nodes.get(id) ?? {
        id,
        column,
        row: nodes.size,
        label,
        kind:
          column === 7
            ? "segment"
            : column === 6
              ? "exit"
              : [4, 5].includes(column)
                ? "outcome"
                : "step",
        count: 0,
        by_source: sourceCounts(0),
      };
      node.count++;
      node.by_source.seed++;
      nodes.set(id, node);
      if (index === 0) return;
      const previous = `c${list[index - 1][0]}:${list[index - 1][1]}`;
      const edgeKey = `${previous}:${id}`;
      const edge = edges.get(edgeKey) ?? {
        source: previous,
        target: id,
        count: 0,
        by_source: sourceCounts(0),
      };
      edge.count++;
      edge.by_source.seed++;
      edges.set(edgeKey, edge);
    });
  }
  const segments: JourneySegment[] = definitions.map((spec) => {
    const members = sessions.filter((session) =>
      (spec.cohorts as readonly string[]).includes(session.cohort),
    );
    return {
      id: `c7:${spec.segment}`,
      segment: spec.segment,
      label: spec.label,
      definition: spec.definition,
      sessions: members.length,
      by_source: sourceCounts(members.length),
      probe: spec.probe,
      cohorts: Object.fromEntries(
        spec.cohorts.map((cohort) => [
          cohort,
          members.filter((s) => s.cohort === cohort).length,
        ]),
      ),
      coverage: {
        complete: members.filter((s) => s.coverage === "complete").length,
        unknown: members.filter((s) => s.coverage === "unknown").length,
      },
      top_paths: [...(pathCounts.get(spec.segment) ?? [])]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([key, number]) => ({
          steps: JSON.parse(key) as string[],
          sessions: number,
        })),
    };
  });
  return {
    direction: "LR",
    columns: columns.map((label, index) => ({ label, index })),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    segments,
    sessions: sessions.length,
    by_source: sourceCounts(sessions.length),
    only: source ?? null,
    notes: [
      "Mock journey steps are reconstructed from the shared session fixture for UI preview. Cohort and source counts match the mock report.",
      "The fixture does not include per-session probe exposures, so this preview adds no probe branches.",
    ],
  };
}

export function mockWorkflow(
  report: Report,
  target: WorkflowTarget,
): WorkflowView {
  const workflow = target === "ens" ? ensDraft.workflow : report.workflow;
  const nodes: WorkflowFact[] = (
    [
      ["states", "state"],
      ["outcomes", "outcome"],
      ["ui_facts", "ui_fact"],
    ] as const
  ).flatMap(([key, kind]) =>
    workflow[key].map((fact, order) => {
      const review =
        target === "ens"
          ? ensReview.ref_check.checks.find((check) => check.id === fact.id)
          : undefined;
      const lines = fact.code_ref.lines;
      return {
        id: fact.id,
        kind,
        order,
        desc: fact.desc,
        instrumentation:
          fact.instrumentation as WorkflowFact["instrumentation"],
        file: fact.code_ref.file,
        lines,
        quote: fact.code_ref.quote,
        permalink:
          target === "ens"
            ? `${ensReview.target.repo}/blob/${ensReview.target.commit}/${encodeURI(fact.code_ref.file)}#L${lines[0]}${lines[0] === lines[1] ? "" : `-L${lines[1]}`}`
            : null,
        ref_check: (review?.verdict as WorkflowFact["ref_check"]) ?? null,
        ref_note: review?.note ?? null,
      };
    }),
  );
  return {
    target,
    label:
      target === "ens"
        ? "ENS (real repo, code-only)"
        : "Our app (Micro Wallet Flow)",
    mode: target === "ens" ? "code_only" : "behavioral",
    repo: target === "ens" ? ensReview.target.repo : null,
    commit: workflow.scope.commit_sha,
    permalinks:
      target === "ens"
        ? null
        : "Pinned source permalinks are unavailable in this mock report.",
    scope: {
      searched_files: workflow.scope.searched_files.length,
      truncated: workflow.scope.truncated,
    },
    legend: {
      found_in_code: "event call found at this code",
      not_found_in_scope: "no event call in the searched files",
      unknown: "cannot tell from the searched files",
    },
    nodes,
  };
}
