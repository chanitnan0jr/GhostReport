import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { saveSandboxToken } from "../../../shared/sandbox";
import { RevealPanel } from "./RevealPanel";
import { SandboxPanel } from "./SandboxPanel";
import { fetchState } from "./sandboxApi";
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
      if (url.endsWith("/reset")) {
        current = {
          ...current,
          phase: "pre_lock",
          sessions_total: 0,
          sessions_used: 20,
          batches: [],
          locked: null,
          draft: null,
        };
        return json({ sandbox_id: ID, sessions_used: 20, resets: 1 });
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
    screen.getByRole("button", { name: "Next: generate journeys" }),
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
      screen.getByRole("button", { name: /Step 5:\s*Traffic after the lock/ }),
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

it("reopens the journeys step while journey generation is running", async () => {
  server(
    state({
      phase: "investigating",
      sessions_total: 20,
      journeys: { status: "running", approved_digest: null },
    }),
  );
  render(<SandboxPanel sandboxId={ID} report={null} refresh={refresh()} />);
  expect(
    await screen.findByRole("button", { name: /Step 2:\s*Generate journeys/ }),
  ).toHaveAttribute("aria-current", "step");
  expect(screen.queryByText(/Reading the snapshot/)).not.toBeInTheDocument();
});

it("shows an initial API failure and lets the user retry", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ detail: "Sandbox temporarily unavailable" }),
          { status: 503 },
        ),
    ),
  );
  render(<SandboxPanel sandboxId={ID} report={null} refresh={refresh()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Sandbox temporarily unavailable",
  );
  server(state());
  fireEvent.click(
    screen.getByRole("button", { name: "Retry loading sandbox" }),
  );
  expect(
    await screen.findByRole("button", { name: /Generate \d+ sessions/ }),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it.each(["caller", "deadline"])(
  "aborts sandbox requests from the %s signal",
  async (source) => {
    const caller = new AbortController();
    const deadline = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValueOnce(deadline.signal);
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(state())),
    );
    vi.stubGlobal("fetch", fetch);
    await fetchState(ID, caller.signal);
    expect(timeout).toHaveBeenCalledWith(20_000);
    const requestSignal = fetch.mock.calls[0][1]?.signal;
    (source === "caller" ? caller : deadline).abort();
    expect(requestSignal?.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(source === "caller");
  },
);

it("warns when polling fails and clears that warning on recovery", async () => {
  vi.useFakeTimers();
  let unavailable = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            unavailable ? { detail: "Temporarily offline" } : state(),
          ),
          { status: unavailable ? 503 : 200 },
        ),
    ),
  );
  await act(async () => {
    render(<SandboxPanel sandboxId={ID} report={null} refresh={refresh()} />);
  });
  unavailable = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Displaying the last loaded state",
  );
  unavailable = false;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

it("resets the sandbox after a second click and keeps the session limit", async () => {
  saveSandboxToken(ID, "owner-token");
  const calls = server(state({ sessions_total: 20, batches: [batch] }));
  const reload = refresh();
  render(<SandboxPanel sandboxId={ID} report={null} refresh={reload} />);
  fireEvent.click(await screen.findByRole("button", { name: "Reset" }));
  expect(screen.getByText("Remove all 20 sessions?")).toBeVisible();
  // The first click only asks; nothing is sent until the confirm.
  expect(calls.some((c) => c.url.endsWith("/reset"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Reset sandbox" }));
  expect(await screen.findByText(/^Sandbox reset\./)).toBeVisible();
  const post = calls.find((c) => c.url.endsWith("/reset"));
  expect(post).toMatchObject({ method: "POST", auth: "Bearer owner-token" });
  expect(reload).toHaveBeenCalled();
  expect(screen.getByText(/280 more sessions allowed/)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(FORBIDDEN);
});

it("offers Reset only to the browser that started the sandbox", async () => {
  server(state({ sessions_total: 20, batches: [batch] }));
  render(
    <SandboxPanel
      sandboxId="sbx-ffffffffffffffff"
      report={null}
      refresh={refresh()}
    />,
  );
  await screen.findByText(/20 simulated sessions/);
  expect(
    screen.queryByRole("button", { name: "Reset" }),
  ).not.toBeInTheDocument();
});
