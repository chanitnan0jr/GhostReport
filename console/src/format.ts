import type { Finding, Report } from "./types";

export const cohortNames: Record<string, string> = {
  connected: "Connected",
  attempted_no_success: "Attempted, no success",
  gate_event_no_attempt: "Gate shown, no attempt",
  no_gate_event: "No gate event recorded",
};

export function sessions(k: number, n: number): string {
  return `${k} of ${n} sessions`;
}

export function time(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date) + " UTC"
  );
}

export function groupKey(
  finding: Pick<Finding, "decision_point" | "cohort" | "question_version">,
): string {
  return `${finding.decision_point}|${finding.cohort}|${finding.question_version}`;
}

export function findingLabel(finding: Finding): string {
  return finding.respondents < 3
    ? "Unresolved"
    : selfReportLabel(finding.self_report);
}

export function selfReportLabel(value: string): string {
  if (value === "Selected by ≥ 50%")
    return "Selected by at least half (self-report)";
  return value.includes("%") ? "See respondent counts" : safeText(value);
}

export function findingText(
  finding: Pick<Finding, "selected" | "respondents" | "text" | "by_source">,
): string | null {
  if (
    !Number.isInteger(finding.selected) ||
    !Number.isInteger(finding.respondents) ||
    finding.selected < 0 ||
    finding.respondents < finding.selected
  )
    return null;
  let expected = `${finding.selected} of ${finding.respondents} respondents`;
  if (finding.by_source) {
    const entries = Object.entries(finding.by_source);
    if (
      entries.some(
        ([source, value]) =>
          !["seed", "test", "visitor"].includes(source) ||
          !value ||
          !Number.isInteger(value.selected) ||
          !Number.isInteger(value.respondents) ||
          value.selected < 0 ||
          value.respondents < value.selected,
      )
    )
      return null;
    if (
      entries.reduce((n, [, v]) => n + v.selected, 0) !== finding.selected ||
      entries.reduce((n, [, v]) => n + v.respondents, 0) !== finding.respondents
    )
      return null;
    const parts = (["seed", "test", "visitor"] as const).flatMap((source) => {
      const value = finding.by_source?.[source];
      return value?.respondents
        ? [
            `${source === "visitor" ? "visitors" : source} ${value.selected} of ${value.respondents}`,
          ]
        : [];
    });
    if (parts.length) expected += ` (${parts.join(" · ")})`;
  }
  return finding.text === expected ? finding.text : null;
}

export function safeText(value: string): string {
  return /\b(?:confirmed|root cause|caus(?:e|es|ed|ing)|proved)\b|%/i.test(
    value,
  )
    ? "Text withheld by wording guard"
    : value;
}

export function reportWarnings(report: Report): string[] {
  const warnings = report.current.errors.map((error) =>
    typeof error === "string"
      ? safeText(error)
      : safeText(
          [
            error.plan_id,
            error.cohort,
            error.exposure_id,
            error.reason ?? "Unspecified report error",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
  );
  if (!report.hypotheses.some((h) => h.id === "H_other"))
    warnings.push(
      "H_other is missing from the report. An unresolved placeholder is shown.",
    );
  for (const finding of report.current.findings) {
    if (!findingText(finding))
      warnings.push(
        `Count wording withheld for ${finding.hypothesis_id} · ${finding.decision_point} · ${finding.cohort}: numerator or denominator does not match the finding.`,
      );
  }
  return [...new Set(warnings)].map(safeText);
}
