export const simulationApi = "/api/ens/simulations";
export type FeedbackMode =
  "mixed" | "answered" | "skipped" | "unanswered" | "not_shown";
export type FeedbackPreset =
  "mixed" | "details" | "permission" | "cost" | "other";
export interface SimulationReport {
  simulation_id: string;
  source: "synthetic";
  created_at: string;
  data_version: string;
  v1_digest: string;
  journey_digest: string;
  v1: { status: string; findings: unknown[]; digest: string };
  population: { synthetic: number; visitor: number; text: string };
  summary: string;
  question: {
    version: string;
    stem: string;
    source: string;
    options: { id: string; label: string; hypothesis_id: string }[];
  };
  segments: {
    id: string;
    label: string;
    sessions: number;
    total_sessions: number;
    text: string;
  }[];
  coverage: {
    eligible: number;
    shown: number;
    answered: number;
    skipped: number;
    shown_no_response: number;
    inactive: number;
    not_shown: number;
    not_asked: number;
    total_sessions: number;
    instrumentation: string;
  };
  findings: {
    segment: string;
    segment_label: string;
    hypothesis_id: string;
    label: string;
    selected: number;
    respondents: number;
    status: string;
    text: string;
    observation: string;
  }[];
  paths: {
    events: string[];
    sessions: number;
    total_sessions: number;
    text: string;
  }[];
  examples: unknown[];
  limit: number;
  remaining: number;
  limitations: string[];
  errors: string[];
}
export interface SimulationLoad {
  batch_id: string;
  n: number;
  seed: number;
  feedback: FeedbackMode;
  preset: FeedbackPreset;
}
export function simulationTokenKey(id: string) {
  return `ghost:ens-simulation:${id}`;
}
export async function simulationRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15000),
  });
  const value = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof value.detail === "string"
        ? value.detail
        : "The simulation request failed.",
    );
  }
  return value as T;
}
