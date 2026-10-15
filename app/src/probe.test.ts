import { describe, expect, it, vi } from "vitest";
import {
  at_exit,
  isProbePlan,
  loadProbePlan,
  shuffleOptions,
  type ExitContext,
} from "./probe";
import type { ProbePlan } from "./types";

export const plan: ProbePlan = {
  plan_id: "plan1",
  question_version: "q1",
  decision_point: "DP1",
  target_cohort: "gate_event_no_attempt",
  stem: "What best describes your decision not to connect right now?",
  options: [
    { id: "a", label: "Just browsing" },
    { id: "b", label: "Not sure who is asking" },
    { id: "other", label: "Something else" },
  ],
  ends_at: "2030-01-01T00:00:00Z",
  closed_hint: false,
};
const context: ExitContext = {
  decisionPoint: "DP1",
  now: Date.parse("2029-01-01T00:00:00Z"),
  consent: true,
  alreadyAsked: false,
  walletPopupOpen: false,
  hasAttempted: false,
  cohort: "gate_event_no_attempt",
};

describe("pure at_exit eligibility", () => {
  it.each([
    ["eligible Not now", {}, {}, "show_probe"],
    ["at deadline", {}, { now: Date.parse(plan.ends_at) }, "no_action"],
    ["after deadline", {}, { now: Date.parse(plan.ends_at) + 1 }, "no_action"],
    ["already asked", {}, { alreadyAsked: true }, "no_action"],
    ["wallet popup", {}, { walletPopupOpen: true }, "no_action"],
    ["attempt happened", {}, { hasAttempted: true }, "no_action"],
    ["no consent", {}, { consent: false }, "no_action"],
    ["closed hint", { closed_hint: true }, {}, "no_action"],
    ["wrong point", {}, { decisionPoint: "DP2" }, "no_action"],
    ["wrong cohort", {}, { cohort: "no_gate_event" }, "no_action"],
    ["bad deadline", { ends_at: "invalid" }, {}, "no_action"],
  ] as const)("%s", (_label, planPatch, contextPatch, expected) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      at_exit({ ...plan, ...planPatch }, { ...context, ...contextPatch }),
    ).toBe(expected);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does nothing when no plan loaded", () =>
    expect(at_exit(null, context)).toBe("no_action"));
  it("allows DP2 Back without mentioning wallet in the stem", () => {
    expect(
      at_exit(
        { ...plan, decision_point: "DP2", target_cohort: "no_gate_event" },
        { ...context, decisionPoint: "DP2", cohort: "no_gate_event" },
      ),
    ).toBe("show_probe");
  });
});

it("fails open for unavailable or malformed plans", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response('{"surprise":true}')),
  );
  expect(await loadProbePlan("s1", "DP1")).toBeNull();
  expect(await loadProbePlan("s1", "DP2")).toBeNull();
  expect(isProbePlan(plan)).toBe(true);
  expect(
    isProbePlan({
      ...plan,
      options: [{ id: "other", label: "Something else" }],
    }),
  ).toBe(false);
});

it("shuffles hypothesis options while keeping Something else last", () => {
  const ordered = shuffleOptions(plan.options, () => 0);
  expect(ordered.map((o) => o.id)).toEqual(["b", "a", "other"]);
  expect(plan.options.map((o) => o.id)).toEqual(["a", "b", "other"]);
});

it("loads both decision-point plans independently on the pinned API query", async () => {
  const fetchMock = vi.fn().mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify({
          ...plan,
          decision_point: url.includes("decision_point=DP2") ? "DP2" : "DP1",
        }),
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const result = await Promise.all([
    loadProbePlan("s both", "DP1"),
    loadProbePlan("s both", "DP2"),
  ]);
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    "/api/probe-plan?session_id=s%20both&decision_point=DP1",
    "/api/probe-plan?session_id=s%20both&decision_point=DP2",
  ]);
  expect(result.map((p) => p?.decision_point)).toEqual(["DP1", "DP2"]);
});
