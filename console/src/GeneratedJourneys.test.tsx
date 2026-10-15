import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GeneratedJourneys } from "./GeneratedJourneys";
import { saveSandboxToken } from "../../shared/sandbox";
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
