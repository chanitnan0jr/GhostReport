import { sessionKey } from "./session";
import type { Cohort, DecisionPoint, ProbePlan, ProbeResponse } from "./types";

export interface ExitContext {
  decisionPoint: DecisionPoint;
  now: number;
  consent: boolean;
  alreadyAsked: boolean;
  walletPopupOpen: boolean;
  hasAttempted: boolean;
  cohort: Cohort;
}

/** Evaluate an optional question using the loaded plan and local session state. */
export function at_exit(
  plan: ProbePlan | null,
  context: ExitContext,
): "show_probe" | "no_action" {
  if (
    !plan ||
    context.now >= Date.parse(plan.ends_at) ||
    !Number.isFinite(Date.parse(plan.ends_at)) ||
    plan.closed_hint ||
    plan.decision_point !== context.decisionPoint ||
    !context.consent ||
    context.alreadyAsked ||
    context.walletPopupOpen ||
    context.hasAttempted
  )
    return "no_action";
  if (context.cohort !== plan.target_cohort) return "no_action";
  return "show_probe";
}

export function askedKey(sessionId: string): string {
  return sessionKey(sessionId, "probe_asked");
}

export function isProbePlan(value: unknown): value is ProbePlan {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as Partial<ProbePlan>;
  if (
    typeof plan.plan_id !== "string" ||
    typeof plan.question_version !== "string" ||
    !["DP1", "DP2"].includes(plan.decision_point ?? "") ||
    ![
      "no_gate_event",
      "gate_event_no_attempt",
      "attempted_no_success",
      "connected",
    ].includes(plan.target_cohort ?? "") ||
    typeof plan.stem !== "string" ||
    !plan.stem.trim() ||
    typeof plan.ends_at !== "string" ||
    !Number.isFinite(Date.parse(plan.ends_at)) ||
    typeof plan.closed_hint !== "boolean" ||
    !Array.isArray(plan.options) ||
    plan.options.length < 2 ||
    plan.options.length > 5
  )
    return false;
  const options = plan.options;
  if (
    !options.every(
      (o) =>
        o &&
        typeof o.id === "string" &&
        o.id.length > 0 &&
        typeof o.label === "string" &&
        o.label.trim().length > 0,
    ) ||
    new Set(options.map((o) => o.id)).size !== options.length ||
    options.filter((o) => o.label === "Something else").length !== 1 ||
    options.some((o) => o.label === "Skip")
  )
    return false;
  if (
    plan.decision_point === "DP1" &&
    !options.some((o) => o.label === "Not sure who is asking")
  )
    return false;
  return true;
}

export async function loadProbePlan(
  sessionId: string,
  decisionPoint: DecisionPoint,
  signal?: AbortSignal,
): Promise<ProbePlan | null> {
  try {
    const response = await fetch(
      `/api/probe-plan?session_id=${encodeURIComponent(sessionId)}&decision_point=${decisionPoint}`,
      {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(2000)])
          : AbortSignal.timeout(2000),
      },
    );
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return isProbePlan(value) ? value : null;
  } catch {
    return null;
  }
}

export function shuffleOptions(
  options: ProbePlan["options"],
  random: () => number = Math.random,
): ProbePlan["options"] {
  const other = options.find((option) => option.label === "Something else");
  const shuffled = options.filter((option) => option !== other);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return other ? [...shuffled, other] : shuffled;
}

export async function sendResponse(response: ProbeResponse): Promise<void> {
  const result = await fetch("/api/probe/response", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(response),
    signal: AbortSignal.timeout(4000),
    keepalive: true,
  });
  if (!result.ok) throw new Error("Could not send response");
}
