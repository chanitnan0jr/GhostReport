// Sandbox API contract, shared by the engine (engine/sandbox.py) and the console.
//
// A sandbox is its own run (mode "sandbox", one SQLite file), never the judging run.
// Create: POST /api/sandbox. Everything else lives under /api/sandbox/{id}/…:
//   reads (public, anyone with the link): report, report/document, journeys,
//     journeys/session/{sid}, evidence, workflow, seed-sessions/{sid}, health, draft,
//     state, reveal
//   controls (Authorization: Bearer <token> from the create response):
//     traffic, investigate, lock
// The console reaches the reads through apiUrl() in ../api.ts, which maps
// "/api/x" to "/api/sandbox/{id}/x" whenever the page URL has ?sandbox={id}.
// Errors are FastAPI-style JSON: { "detail": "…" }.

export type DecisionPoint = "DP1" | "DP2";

export const SANDBOX_BANNER =
  "Simulation — answers come from the mix you set. This shows the pipeline, not real user insight.";

export interface SandboxLimits {
  sessions_per_batch: number; // 100
  sessions_total: number; // 300 per sandbox
  investigate_runs: number; // 3 LLM runs per sandbox (cached runs are free)
}

/** POST /api/sandbox → 201. 503 when capacity is reached, 404 when disabled. */
export interface SandboxCreated {
  sandbox_id: string; // "sbx-" + 16 lowercase hex characters
  token: string; // keep it client-side only (localStorage); never put it in a URL
  expires_at: string; // ISO; the sandbox and its files are deleted after this
  limits: SandboxLimits;
}

/** Relative weights; the server normalizes them. Defaults are equal (1 each). */
export interface BranchWeights {
  project: { back: number; apply: number; idle: number };
  gate: { not_now: number; connect: number; idle: number };
  wallet: { approve: number; reject: number }; // reject sends no event (not instrumented)
  after_failure: { retry: number; not_now: number; idle: number }; // after reject or error
}

/**
 * POST /api/sandbox/{id}/traffic (owner). 1 ≤ n ≤ 100 per call, 300 per sandbox (429).
 * Before the lock it only sends events. After the lock, exits that the real
 * eligibility rules accept are shown the approved question and answer from `mix`.
 * 409 while an investigation is running.
 */
export interface TrafficRequest {
  n: number;
  drop_pct?: number; // 0–50, default 0: each event is lost in transit with this chance
  seed?: number | null; // omit for a random seed; the result echoes the seed used
  branches?: Partial<{ [K in keyof BranchWeights]: Partial<BranchWeights[K]> }>;
  // After the lock: per decision point, relative weight of each approved option id
  // (including "other"). Missing options get weight 0; a missing point is equal weights.
  mix?: Partial<Record<DecisionPoint, Record<string, number>>>;
  answer_rate?: number; // 0–1, default 0.7: of people shown the question, share who answer
  skip_rate?: number; // 0–1, default 0.15: share who press Skip; the rest close without a reply
}

export interface TrafficResult {
  batch: number; // 1-based, per sandbox
  phase: "pre_lock" | "post_lock";
  seed: number;
  generated: number; // sessions in this batch
  sessions_total: number;
  events_sent: number;
  events_dropped: number;
  exits: { back: number; not_now: number; idle: number; connected: number };
  probes: {
    shown: number;
    answered: number;
    skipped: number;
    no_response: number;
  };
  params: Required<Omit<TrafficRequest, "seed" | "mix" | "branches">> & {
    branches: BranchWeights;
    mix: Partial<Record<DecisionPoint, Record<string, number>>>; // normalized, post-lock only
  };
}

export interface SandboxOption {
  id: string;
  label: string;
  hypothesis_ids: string[];
}

export interface SandboxQuestion {
  decision_point: DecisionPoint;
  stem: string;
  target_cohort: string; // DP1 → gate_event_no_attempt, DP2 → no_gate_event
  options: SandboxOption[]; // "other" is always last
}

export interface SandboxHypothesis {
  id: string;
  statement: string;
  class_id: string | null;
}

export type SandboxPhase =
  "pre_lock" | "investigating" | "draft_ready" | "locked";

/** GET /api/sandbox/{id}/state (public). Poll it every 2–3 s while investigating. */
export interface SandboxState {
  sandbox_id: string;
  mode: "sandbox";
  phase: SandboxPhase;
  created_at: string;
  expires_at: string;
  limits: SandboxLimits;
  sessions_total: number;
  batches: TrafficResult[];
  rpc_error_rate: number; // 0.1: first connect attempt of a session only
  banner: string; // SANDBOX_BANNER
  investigate: {
    status: "idle" | "running" | "done" | "failed";
    runs_used: number; // runs that reached the LLM; cache hits do not count
    runs_left: number;
    global_runs_left: number; // shared budget across all sandboxes
    min_sessions: number; // sessions needed before Investigate (422 below it)
    error: string | null;
    started_at: string | null;
    finished_at: string | null;
    snapshot_sessions: number | null; // sessions the AI saw
    cached: boolean | null; // true when no LLM call was needed
  };
  // The AI draft, before approval. Null until an investigation finishes.
  draft: {
    hypotheses: SandboxHypothesis[];
    questions: SandboxQuestion[]; // proposed DP1/DP2 questions
    rejected: Record<string, string[]>; // what the guards dropped
  } | null;
  // Set once v1 is locked; questions are what the exits now ask.
  locked: {
    source: "ai" | "prepared"; // prepared = the judging run's approved investigation
    digest: string; // sha256 of v1
    data_cutoff: string;
    ends_at: string; // collection closes then
    questions: SandboxQuestion[];
    hypotheses: SandboxHypothesis[];
  } | null;
}

/**
 * POST /api/sandbox/{id}/investigate (owner) → 202 { status: "running" }.
 * Stage B on the current snapshot, over the prepared Workflow Map (Stage A reused:
 * the code is the same for every sandbox; refs that no longer match are dropped and
 * listed in draft.rejected.stage_a_stale_ref). Usually 5–30 s. 409 when locked or
 * already running; 422 below min_sessions; 429 when the sandbox or global LLM
 * budget is used up (detail says which); 503 when the server has no API key.
 */
export interface InvestigateStarted {
  status: "running";
}

/**
 * POST /api/sandbox/{id}/lock (owner). `ai` approves the draft's class mappings and
 * questions as proposed; `prepared` uses the judging run's approved investigation
 * and never calls the LLM. 409 when already locked or when `ai` has no draft.
 */
export interface LockRequest {
  source: "ai" | "prepared";
  target_n?: number; // per question, default 60
  budget?: number; // exposures per question, default 200
}

export interface LockResult {
  digest: string;
  data_cutoff: string;
  ends_at: string;
  source: "ai" | "prepared";
}

/** GET /api/sandbox/{id}/reveal (public). available=false before post-lock traffic. */
export interface Reveal {
  available: boolean;
  questions: {
    decision_point: DecisionPoint;
    stem: string;
    target_cohort: string;
    // What the generator did (hidden from the engine) vs what the report counted.
    generated: {
      shown: number;
      answered: number;
      skipped: number;
      no_response: number;
    };
    counted: {
      respondents: number; // n in the report's "k of n respondents"
      not_counted_unknown_coverage: number; // answers from sessions with lost events
      not_counted_pending: number;
    };
    options: {
      id: string;
      label: string;
      hypothesis_ids: string[];
      set_share: number; // 0–1, the mix you set, weighted by answers per batch
      generated_answers: number;
      counted_answers: number;
    }[];
    hypotheses: {
      hypothesis_id: string;
      statement: string;
      expected_share: number; // sum of set_share over options that map to it
      selected: number; // k
      respondents: number; // n
      self_report: string; // as in the report
      observation: string; // as in the report (R2 result)
    }[];
  }[];
}
