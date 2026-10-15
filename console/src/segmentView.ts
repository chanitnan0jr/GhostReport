import type { Cohort, Report, Session, SessionSource } from "./types";

export const cohortOrder: Cohort[] = [
  "no_gate_event",
  "gate_event_no_attempt",
  "attempted_no_success",
  "connected",
];
export const cohortInfo: Record<
  Cohort,
  { label: string; segment: string; tone: string; description: string }
> = {
  no_gate_event: {
    label: "No gate event recorded",
    segment: "Browsers",
    tone: "browsers",
    description:
      "No wallet gate event or connection attempt was recorded. Sessions may leave early, or events may be missing.",
  },
  gate_event_no_attempt: {
    label: "Gate shown, no attempt",
    segment: "Stopped at the wallet",
    tone: "gate",
    description:
      "A wallet gate event was recorded, with no connection attempt recorded.",
  },
  attempted_no_success: {
    label: "Attempted, no success recorded",
    segment: "Stopped at the wallet",
    tone: "stalled_at_wallet",
    description:
      "At least one attempt was recorded, with no successful connection recorded.",
  },
  connected: {
    label: "Connected",
    segment: "Connected",
    tone: "connected",
    description:
      "A wallet connection succeeded, on the first attempt or after a retry.",
  },
};
export const sourceOrder: SessionSource[] = ["seed", "visitor", "test"];
export const sourceLabel: Record<SessionSource, string> = {
  seed: "Simulated users (Playwright) — seed",
  visitor: "Visitors",
  test: "Automated tests",
};
export function sourceOf(
  report: Report,
  session: Session,
): SessionSource | null {
  const value =
    report.current.session_sources?.[session.session_id] ?? session.source;
  return value && sourceOrder.includes(value) ? value : null;
}
export function sessionPopulation(report: Report, source?: SessionSource) {
  return report.current.sessions.filter(
    (session) => !source || sourceOf(report, session) === source,
  );
}

export function segmentSnapshotIssue(report: Report): string | null {
  const { sessions: records, cohorts } = report.current;
  if (
    !Array.isArray(records) ||
    !Array.isArray(cohorts) ||
    new Set(records.map((s) => s.session_id)).size !== records.length ||
    records.some(
      (s) =>
        typeof s.session_id !== "string" ||
        !cohortOrder.includes(s.cohort) ||
        !["complete", "unknown"].includes(s.coverage) ||
        !["back", "not_now", "inactive", "open"].includes(s.exit_type) ||
        !Array.isArray(s.attempt_states) ||
        s.attempt_states.some((value) => typeof value !== "string") ||
        !Array.isArray(s.coverage_reasons) ||
        s.coverage_reasons.some((value) => typeof value !== "string") ||
        typeof s.after_retry !== "boolean",
    )
  )
    return "Session summaries are inconsistent. Cohort counts are withheld.";
  for (const cohort of cohortOrder) {
    const members = records.filter((s) => s.cohort === cohort);
    const row = cohorts.find((item) => item.cohort === cohort);
    if (
      (!row && members.length) ||
      (row &&
        (row.sessions !== members.length ||
          row.coverage_complete !==
            members.filter((s) => s.coverage === "complete").length ||
          row.coverage_unknown !==
            members.filter((s) => s.coverage === "unknown").length ||
          (["back", "not_now", "inactive", "open"] as const).some(
            (exit) =>
              (row.exit_types[exit] ?? 0) !==
              members.filter((s) => s.exit_type === exit).length,
          )))
    )
      return "Cohort totals do not match the session summaries. Counts are withheld until the next report refresh.";
  }
  if (cohorts.reduce((sum, row) => sum + row.sessions, 0) !== records.length)
    return "Cohort totals do not match this report population. Counts are withheld.";
  return null;
}
