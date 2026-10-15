import type { Cohort } from "./types";
import { apiUrl } from "./api";
export type JourneySource = "seed" | "test" | "visitor";
export type SourceCounts = Record<JourneySource, number>;

export interface JourneyNode {
  id: string;
  column: number;
  row: number;
  label: string;
  kind: "step" | "outcome" | "exit" | "segment" | "probe";
  count: number;
  by_source: SourceCounts;
}

export interface JourneySegment {
  id: string;
  segment: "browsers" | "stalled_at_wallet" | "connected";
  label: string;
  definition: string;
  sessions: number;
  by_source: SourceCounts;
  cohorts: Record<string, number>;
  probe: "DP1" | "DP2" | null;
  coverage: { complete: number; unknown: number };
  top_paths: { steps: string[]; sessions: number }[];
}

// A recorded event name, or a note that an attempt had no recorded result.
export type JourneyStep =
  { event: string } | { note: "no_outcome_observed" | "pending" };
export type ProbeStatusCounts = Record<
  "answered" | "skipped" | "shown_no_response",
  number
>;
export interface JourneyCohort {
  cohort: Cohort;
  sessions: number;
  probes: Partial<Record<"DP1" | "DP2", ProbeStatusCounts>>;
  top_paths: { steps: JourneyStep[]; sessions: number }[];
}

export interface JourneyGraph {
  direction: "LR";
  columns: { index: number; label: string }[];
  nodes: JourneyNode[];
  edges: {
    source: string;
    target: string;
    count: number;
    by_source: SourceCounts;
  }[];
  segments: JourneySegment[];
  cohorts?: JourneyCohort[];
  sessions: number;
  by_source: SourceCounts;
  only: JourneySource | null;
  notes: string[];
}

export const journeySources = ["seed", "test", "visitor"] as const;
export const journeySourceNames: Record<JourneySource, string> = {
  seed: "Simulated users (Playwright) — seed",
  test: "Automated tests",
  visitor: "Visitors",
};

const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

function splitMatches(value: SourceCounts | undefined, total: number): boolean {
  return Boolean(
    value &&
    journeySources.every((key) => count(value[key])) &&
    journeySources.reduce((sum, key) => sum + value![key], 0) === total,
  );
}

export function validateJourneys(value: JourneyGraph): void {
  if (
    !value ||
    value.direction !== "LR" ||
    !count(value.sessions) ||
    !splitMatches(value.by_source, value.sessions) ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    !Array.isArray(value.segments) ||
    !Array.isArray(value.notes)
  )
    throw new Error("Unexpected journey response");
  const columnIds = new Set(value.columns.map((column) => column.index));
  const nodeIds = new Set(value.nodes.map((node) => node.id));
  if (
    columnIds.size !== value.columns.length ||
    !columnIds.has(7) ||
    nodeIds.size !== value.nodes.length ||
    value.columns.some(
      (column) => !count(column.index) || typeof column.label !== "string",
    ) ||
    value.nodes.some(
      (node) =>
        !columnIds.has(node.column) ||
        !count(node.row) ||
        typeof node.id !== "string" ||
        typeof node.label !== "string" ||
        !count(node.count) ||
        node.count > value.sessions ||
        !splitMatches(node.by_source, node.count),
    ) ||
    value.edges.some(
      (edge) =>
        !nodeIds.has(edge.source) ||
        !nodeIds.has(edge.target) ||
        !count(edge.count) ||
        edge.count > value.sessions ||
        !splitMatches(edge.by_source, edge.count),
    )
  )
    throw new Error("Journey node or edge counts are inconsistent");
  const segments = new Set(value.segments.map((segment) => segment.segment));
  if (
    value.segments.length !== 3 ||
    !segments.has("browsers") ||
    !segments.has("stalled_at_wallet") ||
    !segments.has("connected") ||
    value.segments.reduce((sum, segment) => sum + segment.sessions, 0) !==
      value.sessions ||
    journeySources.some(
      (source) =>
        value.segments.reduce(
          (sum, segment) => sum + (segment.by_source?.[source] ?? 0),
          0,
        ) !== value.by_source[source],
    ) ||
    value.segments.some(
      (segment) =>
        !count(segment.sessions) ||
        typeof segment.label !== "string" ||
        typeof segment.definition !== "string" ||
        segment.id !== `c7:${segment.segment}` ||
        !["DP1", "DP2", null].includes(segment.probe) ||
        !splitMatches(segment.by_source, segment.sessions) ||
        !segment.cohorts ||
        Object.values(segment.cohorts).some((number) => !count(number)) ||
        Object.values(segment.cohorts).reduce(
          (sum, number) => sum + number,
          0,
        ) !== segment.sessions ||
        !segment.coverage ||
        !count(segment.coverage.complete) ||
        !count(segment.coverage.unknown) ||
        segment.coverage.complete + segment.coverage.unknown !==
          segment.sessions ||
        !Array.isArray(segment.top_paths) ||
        segment.top_paths.some(
          (path) =>
            !count(path.sessions) ||
            path.sessions > segment.sessions ||
            !Array.isArray(path.steps) ||
            path.steps.some((step) => typeof step !== "string"),
        ) ||
        segment.top_paths.reduce((sum, path) => sum + path.sessions, 0) >
          segment.sessions ||
        value.nodes.some(
          (node) =>
            node.id === segment.id &&
            (node.count !== segment.sessions ||
              journeySources.some(
                (source) =>
                  node.by_source[source] !== segment.by_source[source],
              )),
        ),
    )
  )
    throw new Error("Journey segment counts do not match their cohorts");
  if (
    value.cohorts !== undefined &&
    !validCohorts(value.cohorts, value.sessions)
  )
    throw new Error("Journey cohort paths are inconsistent");
}

const cohortIds: Cohort[] = [
  "no_gate_event",
  "gate_event_no_attempt",
  "attempted_no_success",
  "connected",
];

function validCohorts(rows: JourneyCohort[], total: number): boolean {
  return (
    Array.isArray(rows) &&
    rows.length === cohortIds.length &&
    rows.every((row, index) => row?.cohort === cohortIds[index]) &&
    rows.reduce((sum, row) => sum + row.sessions, 0) === total &&
    rows.every(
      (row) =>
        count(row.sessions) &&
        row.probes !== null &&
        typeof row.probes === "object" &&
        Object.entries(row.probes).every(
          ([point, counts]) =>
            ["DP1", "DP2"].includes(point) &&
            counts &&
            (["answered", "skipped", "shown_no_response"] as const).every(
              (key) => count(counts[key]),
            ),
        ) &&
        Array.isArray(row.top_paths) &&
        row.top_paths.reduce((sum, path) => sum + path.sessions, 0) <=
          row.sessions &&
        row.top_paths.every(
          (path) =>
            count(path.sessions) &&
            Array.isArray(path.steps) &&
            path.steps.every((step) =>
              step && "event" in step
                ? typeof step.event === "string"
                : step &&
                  "note" in step &&
                  ["no_outcome_observed", "pending"].includes(step.note),
            ),
        ),
    )
  );
}

export async function fetchJourneys(
  source: JourneySource | undefined,
  signal: AbortSignal,
): Promise<JourneyGraph> {
  const response = await fetch(
    apiUrl(`/api/journeys${source ? `?source=${source}` : ""}`),
    { signal },
  );
  if (!response.ok)
    throw new Error(`Journey data unavailable (${response.status})`);
  const value: JourneyGraph = await response.json();
  validateJourneys(value);
  if (value.only !== (source ?? null))
    throw new Error("Journey source does not match the requested population");
  return value;
}
