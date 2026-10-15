import { describe, expect, it } from "vitest";
import { buildFlow } from "./CohortFlow";
import type { Cohort, Session } from "./types";

function session(
  index: number,
  cohort: Cohort,
  attempt_states: string[] = [],
): Session {
  return {
    session_id: `s-${index}`,
    cohort,
    coverage: "complete",
    coverage_reasons: [],
    exit_type: "inactive",
    attempt_states,
    after_retry:
      attempt_states.includes("connected") && attempt_states[0] !== "connected",
    event_ids: [],
  };
}

// Reference snapshot: 21 = 8 + 13, 13 = 5 + 8, 8 = 3 + 5.
const population = [
  ...Array.from({ length: 8 }, (_, i) => session(i, "no_gate_event")),
  ...Array.from({ length: 5 }, (_, i) =>
    session(10 + i, "gate_event_no_attempt"),
  ),
  session(20, "attempted_no_success", ["no_outcome_observed"]),
  session(21, "attempted_no_success", ["errored", "no_outcome_observed"]),
  session(22, "attempted_no_success", ["errored"]),
  ...Array.from({ length: 4 }, (_, i) =>
    session(30 + i, "connected", ["connected"]),
  ),
  session(34, "connected", ["errored", "connected"]),
];

describe("buildFlow", () => {
  const { nodes, edges } = buildFlow(population);
  const count = (id: string) => nodes.get(id)!.members.length;
  const edge = (source: string, target: string) =>
    edges.find((e) => e.source === source && e.target === target)!.members
      .length;

  it("reconciles every branch with the four cohort rules", () => {
    expect(count("entry")).toBe(21);
    expect([count("no_gate"), count("gate")]).toEqual([8, 13]);
    expect([count("no_attempt"), count("attempt")]).toEqual([5, 8]);
    expect(count("connected")).toBe(5);
    expect(
      count("outcome:no_outcome_observed") + count("outcome:errored"),
    ).toBe(3);
    expect(count("outcome:no_outcome_observed")).toBe(2);
    expect(count("outcome:errored")).toBe(1);
    expect(nodes.has("outcome:pending")).toBe(false);
  });

  it("branches where the data diverges and counts a retry once", () => {
    expect(edge("entry", "no_gate")).toBe(8);
    expect(edge("entry", "gate")).toBe(13);
    expect(edge("gate", "no_attempt")).toBe(5);
    expect(
      nodes.get("connected")!.members.filter((s) => s.after_retry),
    ).toHaveLength(1);
    expect(edge("attempt", "outcome:errored")).toBe(1);
  });

  it("groups cohorts into three segments", () => {
    expect(count("seg:browsers")).toBe(8);
    expect(count("seg:stalled_at_wallet")).toBe(8);
    expect(count("seg:connected")).toBe(5);
    for (const column of [1, 3, 4]) {
      const members = [...nodes.values()]
        .filter((node) => node.column === column)
        .reduce((sum, node) => sum + node.members.length, 0);
      expect(members).toBe(column === 3 ? 13 : 21);
    }
  });
});
