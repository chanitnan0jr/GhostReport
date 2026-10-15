export type Page =
  | "ProjectList"
  | "ProjectPage"
  | "ApplyModal"
  | "MockWalletPopup"
  | "ApplicationForm";
export type EventName =
  | "project_viewed"
  | "apply_clicked"
  | "wallet_gate_shown"
  | "wallet_attempted"
  | "wallet_connected"
  | "wallet_rejected"
  | "wallet_errored"
  | "not_now_clicked"
  | "back_nav";

export interface CanonicalEvent {
  event_id: string;
  session_id: string;
  seq: number;
  attempt_id: string | null;
  event: EventName;
  occurred_at: string;
  page: Page;
  schema_version: 1;
  props: Record<string, string>;
}

export type Cohort =
  | "connected"
  | "attempted_no_success"
  | "gate_event_no_attempt"
  | "no_gate_event";
export type DecisionPoint = "DP1" | "DP2";
export interface ProbePlan {
  plan_id: string;
  question_version: string;
  decision_point: DecisionPoint;
  target_cohort: Cohort;
  stem: string;
  options: { id: string; label: string }[];
  ends_at: string;
  closed_hint: boolean;
}

export interface ProbeExposure {
  exposure_id: string;
  plan_id: string;
  session_id: string;
  shown_at: string;
  client_cohort_at_shown: Cohort;
  event_seq_at_shown: number;
  options_shown: string[];
}

export type ProbeResponse = Pick<
  ProbeExposure,
  "plan_id" | "session_id" | "shown_at" | "event_seq_at_shown" | "options_shown"
> & {
  exposure_id: string;
  responded_at: string;
} & (
    | { option_ids: string[]; skipped?: never }
    | { skipped: true; option_ids?: never }
  );

export interface Project {
  id: string;
  title: string;
  category: string;
  grant: string;
  summary: string;
  description: string;
  goals: string[];
  color: string;
  number: string;
}
