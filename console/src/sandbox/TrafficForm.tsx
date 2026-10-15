import { useState } from "react";
import type {
  BranchWeights,
  SandboxQuestion,
  TrafficRequest,
  TrafficResult,
} from "./types";

type Group = keyof BranchWeights;

// What each branch means at that step of the app's flow (engine/sandbox.py walk()).
const GROUPS: { id: Group; title: string; branches: [string, string][] }[] = [
  {
    id: "project",
    title: "On the project page",
    branches: [
      ["back", "Go back"],
      ["apply", "Apply"],
      ["idle", "Leave without a click"],
    ],
  },
  {
    id: "gate",
    title: "At the wallet gate",
    branches: [
      ["not_now", "Not now"],
      ["connect", "Connect"],
      ["idle", "Leave without a click"],
    ],
  },
  {
    id: "wallet",
    title: "In the wallet",
    branches: [
      ["approve", "Approve"],
      ["reject", "Reject (records no event)"],
    ],
  },
  {
    id: "after_failure",
    title: "After a failed attempt",
    branches: [
      ["retry", "Try again"],
      ["not_now", "Not now"],
      ["idle", "Leave without a click"],
    ],
  },
];

const EQUAL: BranchWeights = {
  project: { back: 1, apply: 1, idle: 1 },
  gate: { not_now: 1, connect: 1, idle: 1 },
  wallet: { approve: 1, reject: 1 },
  after_failure: { retry: 1, not_now: 1, idle: 1 },
};

const QUESTION_WHEN: Record<string, string> = {
  DP1: "Shown when a session chooses Not now after the wallet gate.",
  DP2: "Shown when a session goes back from the project page.",
};

function share(weights: Record<string, number>, key: string): string {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  return total > 0 ? `${Math.round((weights[key] / total) * 100)}%` : "0%";
}

function clamp(value: number, low: number, high: number): number {
  return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low;
}

export function TrafficForm({
  phase,
  questions,
  remaining,
  disabled,
  busy,
  onSubmit,
}: {
  phase: "pre_lock" | "post_lock";
  questions: SandboxQuestion[];
  remaining: number;
  disabled: boolean;
  busy: boolean;
  onSubmit: (body: TrafficRequest) => void;
}) {
  const [n, setN] = useState(30);
  const [drop, setDrop] = useState(0);
  const [seed, setSeed] = useState("");
  const [branches, setBranches] = useState<BranchWeights>(EQUAL);
  const [answer, setAnswer] = useState(70);
  const [skip, setSkip] = useState(15);
  const [mix, setMix] = useState<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(
      questions.map((q) => [
        q.decision_point,
        Object.fromEntries(q.options.map((o) => [o.id, 1])),
      ]),
    ),
  );
  const count = clamp(Math.round(n), 1, Math.max(1, Math.min(100, remaining)));
  const after = phase === "post_lock";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const body: TrafficRequest = {
      n: count,
      drop_pct: clamp(drop, 0, 50),
      branches,
    };
    if (seed.trim() !== "")
      body.seed = clamp(Math.round(Number(seed)), 0, 2 ** 31 - 1);
    if (after) {
      body.mix = mix;
      body.answer_rate = answer / 100;
      body.skip_rate = Math.min(skip, 100 - answer) / 100;
    }
    onSubmit(body);
  }

  return (
    <form className="sbx-form" onSubmit={submit}>
      <div className="sbx-fields">
        <label className="sbx-field">
          <span>Sessions</span>
          <input
            type="number"
            min={1}
            max={Math.min(100, remaining)}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
          />
        </label>
        <label className="sbx-field">
          <span>Events lost in transit</span>
          <span className="sbx-unit">
            <input
              type="number"
              min={0}
              max={50}
              value={drop}
              onChange={(e) => setDrop(Number(e.target.value))}
            />
            %
          </span>
        </label>
        <label className="sbx-field">
          <span>Random seed</span>
          <input
            type="number"
            min={0}
            placeholder="Random"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
        {after && (
          <>
            <label className="sbx-field sbx-range">
              <span>
                Answer the question <strong>{answer}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={answer}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setAnswer(value);
                  setSkip((current) => Math.min(current, 100 - value));
                }}
              />
            </label>
            <label className="sbx-field sbx-range">
              <span>
                Press Skip <strong>{Math.min(skip, 100 - answer)}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={100 - answer}
                step={5}
                value={Math.min(skip, 100 - answer)}
                onChange={(e) => setSkip(Number(e.target.value))}
              />
            </label>
            <p className="sbx-field sbx-derived">
              <span>Close without a reply</span>
              <strong>{100 - answer - Math.min(skip, 100 - answer)}%</strong>
            </p>
          </>
        )}
      </div>

      {after && questions.length > 0 && (
        <fieldset className="sbx-mix">
          <legend>The hidden answers: what simulated people pick</legend>
          <div className="sbx-mix-grid">
            {questions.map((question) => (
              <div className="sbx-question" key={question.decision_point}>
                <p className="sbx-question-stem">
                  <span>{question.decision_point}</span> {question.stem}
                </p>
                <p className="sbx-hint">
                  {QUESTION_WHEN[question.decision_point]}
                </p>
                {question.options.map((option) => {
                  const weights = mix[question.decision_point] ?? {};
                  const value = weights[option.id] ?? 0;
                  return (
                    <label className="sbx-weight" key={option.id}>
                      <span className="sbx-weight-label">{option.label}</span>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={value}
                        aria-label={`${question.decision_point}: weight for “${option.label}”`}
                        onChange={(e) =>
                          setMix((current) => ({
                            ...current,
                            [question.decision_point]: {
                              ...current[question.decision_point],
                              [option.id]: Number(e.target.value),
                            },
                          }))
                        }
                      />
                      <output>{share(weights, option.id)}</output>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <details className="sbx-advanced">
        <summary>Path weights (equal by default)</summary>
        <div className="sbx-branch-grid">
          {GROUPS.map((group) => (
            <fieldset key={group.id}>
              <legend>{group.title}</legend>
              {group.branches.map(([branch, label]) => {
                const weights = branches[group.id] as Record<string, number>;
                return (
                  <label className="sbx-weight" key={branch}>
                    <span className="sbx-weight-label">{label}</span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={weights[branch]}
                      aria-label={`${group.title}: weight for ${label}`}
                      onChange={(e) =>
                        setBranches((current) => ({
                          ...current,
                          [group.id]: {
                            ...current[group.id],
                            [branch]: Number(e.target.value),
                          },
                        }))
                      }
                    />
                    <output>{share(weights, branch)}</output>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
        <p className="sbx-hint">
          Each session walks the app’s flow one step at a time, so no impossible
          path is generated. A first connect attempt fails with a simulated
          network error 10% of the time, as in the app.
        </p>
      </details>

      <div className="sbx-actions">
        <button
          type="submit"
          className="primary"
          disabled={disabled || busy || remaining < 1}
        >
          {busy ? "Generating…" : `Generate ${count} sessions`}
        </button>
        <span className="sbx-hint">
          {remaining < 1
            ? "This sandbox has reached its 300-session limit."
            : `${remaining} more sessions allowed in this sandbox.`}
        </span>
      </div>
    </form>
  );
}

export function BatchSummary({ batch }: { batch: TrafficResult }) {
  const { exits, probes } = batch;
  return (
    <p className="sbx-batch" role="status">
      <strong>Batch {batch.batch}</strong> · seed {batch.seed} ·{" "}
      {batch.generated} sessions: {exits.back} went back, {exits.not_now} chose
      Not now, {exits.idle} left without a click, {exits.connected} connected ·{" "}
      {batch.events_sent} events received, {batch.events_dropped} lost
      {batch.phase === "post_lock" &&
        ` · question shown ${probes.shown}: ${probes.answered} answered, ${probes.skipped} skipped, ${probes.no_response} no reply`}
    </p>
  );
}
