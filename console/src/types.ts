export type Cohort =
  | "connected"
  | "attempted_no_success"
  | "gate_event_no_attempt"
  | "no_gate_event";
export interface Session {
  session_id: string;
  cohort: Cohort;
  coverage: "complete" | "unknown";
  coverage_reasons: string[];
  exit_type: "not_now" | "back" | "inactive" | "open";
  attempt_states: string[];
  after_retry: boolean;
  event_ids: string[];
}
export interface Decision {
  decision_point: string;
  action_id: string;
  data_version: string;
  reason: string;
  result: string | null;
  session_ids: string[];
  evidence_ids: string[];
  contradicted_hypotheses: string[];
  rule_ids: string[];
  catalog_version: string;
}
export interface CodeFact {
  id: string;
  desc: string;
  code_ref: { file: string; lines: [number, number] | number[]; quote: string };
  instrumentation: "found_in_code" | "not_found_in_scope" | "unknown";
}
export interface Hypothesis {
  id: string;
  statement: string;
  class_id: string | null;
  code_evidence: string[];
  generic: boolean;
}
export interface Finding {
  hypothesis_id: string;
  cohort: Cohort;
  question_version: string;
  decision_point: string;
  selected: number;
  respondents: number;
  self_report: string;
  observation: string;
  evidence_conflict: boolean;
  evidence_ids: string[];
  rule_version: string;
  text: string;
}
export interface ProbeCounts {
  shown: number;
  answered: number;
  skipped: number;
  shown_no_response: number;
  pending: number;
  unknown_coverage: number;
  inferred_from_response: number;
}
export interface Probe {
  plan_id: string;
  decision_point: string;
  question_version: string;
  stem: string;
  target_cohorts: Cohort[];
  target_n: number;
  budget: number;
  ends_at: string;
  counts: ProbeCounts;
}
export interface Report {
  run: {
    run_id: string;
    mode: string;
    build_verified: boolean;
    code_commit: string;
    app_build: string;
    policy_version: string;
    catalog_version: string;
  };
  investigation_id: string;
  workflow: {
    version: string;
    scope: {
      commit_sha: string;
      searched_files: string[];
      unresolved_imports: string[];
      truncated: boolean;
    };
    states: CodeFact[];
    outcomes: CodeFact[];
    ui_facts: CodeFact[];
  };
  hypotheses: Hypothesis[];
  locked: boolean;
  v1: {
    digest: string;
    data_cutoff: string;
    sessions: Session[];
    decisions: Decision[];
  } | null;
  current: {
    data_cutoff: string;
    funnel: {
      visitors: number;
      apply_clicked: number;
      attempted: number;
      connected: number;
    };
    cohorts: {
      cohort: Cohort;
      sessions: number;
      coverage_complete: number;
      coverage_unknown: number;
      exit_types: Partial<Record<Session["exit_type"], number>>;
    }[];
    sessions: Session[];
    decisions: Decision[];
    probes: Probe[];
    findings: Finding[];
    orphan_responses: number;
    errors: (
      | string
      | {
          reason?: string;
          exposure_id?: string;
          plan_id?: string;
          cohort?: string;
        }
    )[];
  };
  snapshots: { version: number; digest: string; data_cutoff: string }[];
}

export interface SnapshotResult {
  version: number;
  digest: string;
  data_cutoff: string;
}
