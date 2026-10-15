import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { saveSandboxToken } from "../../../shared/sandbox";
import { RevealPanel } from "./RevealPanel";
import { SandboxPanel } from "./SandboxPanel";
import type { Reveal, SandboxState, TrafficResult } from "./types";

const ID = "sbx-0123456789abcdef";
const FORBIDDEN = /\b(?:confirmed|root cause|cause|proved)\b/i;
const QUESTIONS = [
  {
    decision_point: "DP1" as const,
    stem: "What best describes your decision not to connect right now?",
    target_cohort: "gate_event_no_attempt",
    options: [
      {
        id: "o1",
        label: "Didn't know I needed a wallet",
        hypothesis_ids: ["H1"],
      },
      {
        id: "requester",
        label: "Not sure who is asking",
        hypothesis_ids: ["H3"],
      },
      { id: "other", label: "Something else", hypothesis_ids: ["H_other"] },
    ],
  },
];

function state(patch: Partial<SandboxState> = {}): SandboxState {
  return {
    sandbox_id: ID,
    mode: "sandbox",
    phase: "pre_lock",
    created_at: "2026-10-16T01:00:00+00:00",
    expires_at: "2026-10-16T04:00:00+00:00",
    limits: {
      sessions_per_batch: 100,
      sessions_total: 300,
      investigate_runs: 3,
    },
    sessions_total: 0,
    batches: [],
    rpc_error_rate: 0.1,
    banner: "Simulation",
    investigate: {
      status: "idle",
      runs_used: 0,
      runs_left: 3,
      global_runs_left: 30,
      min_sessions: 10,
      error: null,
      started_at: null,
      finished_at: null,
      snapshot_sessions: null,
      cached: null,
    },
    draft: null,
    locked: null,
    ...patch,
  };
}

const batch: TrafficResult = {
  batch: 1,
  phase: "pre_lock",
  seed: 42,
  generated: 20,
  sessions_total: 20,
  events_sent: 50,
  events_dropped: 0,
  exits: { back: 7, not_now: 4, idle: 8, connected: 1 },
  probes: { shown: 0, answered: 0, skipped: 0, no_response: 0 },
  params: {
    n: 20,
    drop_pct: 0,
    answer_rate: 0.7,
    skip_rate: 0.15,
    branches: {
      project: { back: 1, apply: 1, idle: 1 },
      gate: { not_now: 1, connect: 1, idle: 1 },
      wallet: { approve: 1, reject: 1 },
      after_failure: { retry: 1, not_now: 1, idle: 1 },
    },
    mix: {},
  },
};

/** A tiny sandbox server: state changes as the panel acts on it. */
function server(initial: SandboxState) {
  let current = initial;
  const calls: {
    url: string;
    method: string;
    body: unknown;
    auth: string | null;
  }[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
        auth: headers.get("Authorization"),
      });
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status });
      if (url.endsWith("/state")) return json(current);
      if (url.endsWith("/reveal"))
        return json({ available: false, questions: [] });
      if (url.endsWith("/traffic")) {
        current = { ...current, sessions_total: 20, batches: [batch] };
        return json(batch);
      }
      if (url.endsWith("/lock")) {
        current = {
          ...current,
          phase: "locked",
          draft: null,
          locked: {
            source: "ai",
            digest: "a".repeat(64),
            data_cutoff: "2026-10-16T01:10:00+00:00",
            ends_at: "2026-10-16T03:10:00+00:00",
            questions: QUESTIONS,
            hypotheses: [],
          },
        };
        return json({
          digest: "a".repeat(64),
          data_cutoff: "2026-10-16T01:10:00+00:00",
          ends_at: "2026-10-16T03:10:00+00:00",
          source: "ai",
        });
      }
      return json({ detail: "not found" }, 404);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const refresh = () => vi.fn(async () => {});

it("generates traffic with the owner's token and stays on that step", async () => {
  saveSandboxToken(ID, "owner-token");
  const calls = server(state());
  render(<SandboxPanel sandboxId={ID} report={null} refresh={refresh()} />);
  const step = await screen.findByRole("button", {
    name: /Step 1:\s*Traffic before the lock/,
  });
  expect(step).toHaveAttribute("aria-current", "step");
  fireEvent.change(screen.getByRole("spinbutton", { name: "Sessions" }), {
    target: { value: "20" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Generate 20 sessions" }));
  expect(await screen.findByText(/Batch 1/)).toBeInTheDocument();
  const post = calls.find((c) => c.url.endsWith("/traffic"));
  expect(post?.auth).toBe("Bearer owner-token");
  expect(post?.body).toMatchObject({ n: 20, drop_pct: 0 });
  expect(post?.url).toBe(`/api/sandbox/${ID}/traffic`);
  // The result stays in view, with the next step offered.
  expect(
    screen.getByRole("button", { name: "Next: investigate" }),
  ).toBeVisible();
  expect(document.body.textContent).not.toMatch(FORBIDDEN);
});

it("reviews the AI draft and locks it, then shows the full digest", async () => {
  saveSandboxToken(ID, "owner-token");
  const calls = server(
    state({
      phase: "draft_ready",
      sessions_total: 20,
      batches: [batch],
      investigate: {
        ...state().investigate,
        status: "done",
        runs_used: 1,
        runs_left: 2,
        snapshot_sessions: 20,
        cached: false,
      },
      draft: {
        hypotheses: [
          {
            id: "H1",
            statement: "Did not expect a wallet",
            class_id: "HC-unaware-requirement",
          },
          {
            id: "H_other",
            statement: "A reason not yet proposed",
            class_id: null,
          },
        ],
        questions: QUESTIONS,
        rejected: { option: [] },
      },
    }),
  );
  render(<SandboxPanel sandboxId={ID} report={null} refresh={refresh()} />);
  expect(
    await screen.findByText("Did not expect a wallet"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Did not know a wallet was needed"),
  ).toBeInTheDocument();
  expect(screen.getByText("Not sure who is asking")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Approve and lock v1" }));
  expect(await screen.findByText("a".repeat(64))).toBeInTheDocument();
  expect(calls.find((c) => c.url.endsWith("/lock"))?.body).toEqual({
    source: "ai",
  });
  // After the lock the panel moves on to traffic with the approved questions.
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /Step 4:\s*Traffic after the lock/ }),
    ).toHaveAttribute("aria-current", "step"),
  );
  expect(screen.getByText(/The hidden answers/)).toBeInTheDocument();
});

it("lets anyone watch but only the owner change a sandbox", async () => {
  server(state());
  render(<SandboxPanel sandboxId={ID} report={null} refresh={refresh()} />);
  expect(
    await screen.findByText(/only the browser that started it can change it/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Generate \d+ sessions/ }),
  ).toBeDisabled();
  expect(
    screen.getByRole("link", { name: "Start your own sandbox" }),
  ).toHaveAttribute("href", "/sandbox/");
});

it("says when a sandbox has expired", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: "gone" }), { status: 404 }),
    ),
  );
  render(<SandboxPanel sandboxId={ID} report={null} refresh={refresh()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This sandbox has expired or does not exist.",
  );
  expect(
    screen.getByRole("link", { name: "Start a new sandbox" }),
  ).toHaveAttribute("href", "/sandbox/");
});

it("reveals the mix that was set beside what the report counted", () => {
  const reveal: Reveal = {
    available: true,
    questions: [
      {
        decision_point: "DP1",
        stem: QUESTIONS[0].stem,
        target_cohort: "gate_event_no_attempt",
        generated: { shown: 12, answered: 10, skipped: 1, no_response: 1 },
        counted: {
          respondents: 8,
          not_counted_unknown_coverage: 2,
          not_counted_pending: 0,
        },
        options: [
          {
            id: "o1",
            label: "Didn't know I needed a wallet",
            hypothesis_ids: ["H1"],
            set_share: 0.6,
            generated_answers: 6,
            counted_answers: 5,
          },
          {
            id: "other",
            label: "Something else",
            hypothesis_ids: ["H_other"],
            set_share: 0.4,
            generated_answers: 4,
            counted_answers: 3,
          },
        ],
        hypotheses: [
          {
            hypothesis_id: "H1",
            statement: "Did not expect a wallet",
            expected_share: 0.6,
            selected: 5,
            respondents: 8,
            self_report: "Selected by ≥ 50%",
            observation: "No contradiction",
          },
        ],
      },
    ],
  };
  render(<RevealPanel reveal={reveal} />);
  expect(screen.getByText(/2 not counted \(lost events\)/)).toBeInTheDocument();
  const row = screen.getByRole("row", {
    name: /Didn't know I needed a wallet/,
  });
  expect(row).toHaveTextContent("60%");
  expect(row).toHaveTextContent("6");
  expect(row).toHaveTextContent("5");
  expect(screen.getByRole("row", { name: /H1/ })).toHaveTextContent(
    "5 of 8 respondents",
  );
  expect(document.body.textContent).not.toMatch(FORBIDDEN);
});
