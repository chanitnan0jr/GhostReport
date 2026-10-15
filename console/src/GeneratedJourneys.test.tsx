import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GeneratedJourneys } from "./GeneratedJourneys";
import { saveSandboxToken } from "../../shared/sandbox";
import ensDraft from "../../fixtures/partb/journeys.ens.draft.json";

vi.mock("./GeneratedJourneyGraph", () => ({
  default: ({ value }: { value: { code_only: boolean } }) => (
    <div
      role="img"
      aria-label={value.code_only ? "Code-only graph" : "Session graph"}
    />
  ),
}));
const record = {
  digest: "a".repeat(64),
  spec: {
    project: "app",
    version: 1,
    columns: [],
    segments: [],
    rules: [
      {
        id: "r",
        label: "A connection was recorded",
        rationale: "Recorded events group this session.",
        predicate: { op: "has", events: ["wallet_connected"] },
        evidence: [
          {
            node_id: "connected",
            file: "src/wallet.ts",
            lines: [1, 2],
            quote: "track('wallet_connected')",
          },
        ],
      },
    ],
  },
};
const view = {
  project: "app",
  status: "ready",
  validation: [],
  stale: false,
  draft: record,
  approved: null,
  comparison: null,
  template: null,
};
function mock() {
  return vi.fn(
    async (_url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify(init?.method === "POST" ? { status: "running" } : view),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
}
it("shows validated draft evidence but hides generate and approval from visitors", async () => {
  const fetch = mock();
  vi.stubGlobal("fetch", fetch);
  render(<GeneratedJourneys />);
  await screen.findByText("Validated draft · review required");
  expect(
    screen.getByRole("heading", { name: "A connection was recorded" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Generate user journeys" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Approve reviewed definitions" }),
  ).not.toBeInTheDocument();
});
it("shows the generated ENS draft and graph as pending approval without counts or controls", async () => {
  history.replaceState(null, "", "/report/?project=ens#segments");
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        ...view,
        project: "ens",
        draft: ensDraft,
        comparison: {
          code_only: true,
          nodes: [],
          edges: [],
          segments: ensDraft.spec.segments,
        },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<GeneratedJourneys project="ens" />);
  await screen.findByText("LLM-generated draft · awaiting operator approval");
  expect(
    await screen.findByRole("img", { name: "Code-only graph" }),
  ).toBeVisible();
  expect(screen.getByText(ensDraft.digest)).toBeInTheDocument();
  expect(
    screen.getByText(
      /This draft passed the definition and code-reference checks/,
    ),
  ).toBeVisible();
  expect(screen.queryByText("Approved definitions")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/\d+ of \d+ (sessions|respondents)/),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Operator token")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Review and approve this draft →" }),
  ).toHaveAttribute("href", "/report/?project=ens&operator=1#segments");
  expect(
    screen.queryByRole("button", { name: "Generate user journeys" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Approve reviewed definitions" }),
  ).not.toBeInTheDocument();
  expect(
    fetch.mock.calls.every(([url]) => url === "/api/journeys/spec?project=ens"),
  ).toBe(true);
});
it("lets the ENS operator approve the displayed digest without offering generation", async () => {
  history.replaceState(null, "", "/report/?project=ens&operator=1#segments");
  let approved: object | null = null;
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      approved = {
        ...ensDraft,
        kind: "approved",
        approved_by: "ENS reviewer",
        approved_at: "2026-10-16T06:00:00Z",
      };
      return new Response(JSON.stringify(approved));
    }
    return new Response(
      JSON.stringify({ ...view, project: "ens", draft: ensDraft, approved }),
    );
  });
  vi.stubGlobal("fetch", fetch);
  render(<GeneratedJourneys project="ens" />);
  await screen.findByLabelText("Operator token");
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "operator-secret" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Unlock operator tools" }),
  );
  const button = screen.getByRole("button", {
    name: "Approve reviewed definitions",
  });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reviewer name"), {
    target: { value: "ENS reviewer" },
  });
  fireEvent.click(button);
  await screen.findByText("Approved definitions");
  expect(screen.getByText(/Approved by ENS reviewer/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Download approved fixture" }),
  ).toBeVisible();
  expect(
    fetch.mock.calls.some(
      ([url, init]) =>
        url === "/api/journeys/approve?project=ens" &&
        new Headers(init?.headers).get("Authorization") ===
          "Bearer operator-secret" &&
        init?.body ===
          JSON.stringify({
            digest: ensDraft.digest,
            approved_by: "ENS reviewer",
          }),
    ),
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Generate user journeys" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Approve reviewed definitions" }),
  ).not.toBeInTheDocument();
});
it("requires an operator token and submits the reviewed digest with the reviewer", async () => {
  history.replaceState(null, "", "/report/?operator=1#segments");
  const fetch = mock();
  vi.stubGlobal("fetch", fetch);
  render(<GeneratedJourneys />);
  await screen.findByText("Validated draft · review required");
  fireEvent.change(screen.getByLabelText("Operator token"), {
    target: { value: "operator-secret" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Unlock operator tools" }),
  );
  fireEvent.change(screen.getByLabelText("Reviewer name"), {
    target: { value: "Reviewer" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Approve reviewed definitions" }),
  );
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url, init]) =>
          url === "/api/journeys/approve?project=app" &&
          new Headers(init?.headers).get("Authorization") ===
            "Bearer operator-secret" &&
          init?.body ===
            JSON.stringify({ digest: record.digest, approved_by: "Reviewer" }),
      ),
    ).toBe(true),
  );
});
it("sends only the sandbox owner token through the isolated API URL", async () => {
  const id = "sbx-aaaaaaaaaaaaaaaa";
  saveSandboxToken(id, "owner-secret");
  history.replaceState(null, "", `/report/?sandbox=${id}#segments`);
  const fetch = mock();
  vi.stubGlobal("fetch", fetch);
  render(<GeneratedJourneys />);
  await screen.findByText("Validated draft · review required");
  fireEvent.click(
    screen.getByRole("button", { name: "Generate user journeys" }),
  );
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url, init]) =>
          url === `/api/sandbox/${id}/journeys/generate?project=app` &&
          new Headers(init?.headers).get("Authorization") ===
            "Bearer owner-secret",
      ),
    ).toBe(true),
  );
});
