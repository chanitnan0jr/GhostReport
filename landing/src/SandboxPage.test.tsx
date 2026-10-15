import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SandboxPage } from "./SandboxPage";

const ID = "sbx-0123456789abcdef";

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("starts a sandbox, keeps its token in this browser and opens Segments", async () => {
  history.replaceState(null, "", "/sandbox/");
  const fetchMock = respond(201, {
    sandbox_id: ID,
    token: "owner-token",
    expires_at: "2026-10-16T04:00:00+00:00",
    limits: {
      sessions_per_batch: 100,
      sessions_total: 300,
      investigate_runs: 3,
    },
  });
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  render(<SandboxPage />);
  expect(
    screen.getByText(/answers come from the mix you set/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start a sandbox" }));
  await vi.waitFor(() => expect(assign).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/sandbox",
    expect.objectContaining({ method: "POST" }),
  );
  expect(assign).toHaveBeenCalledWith(`/report/?sandbox=${ID}#segments`);
  expect(localStorage.getItem(`ghostreport.sandbox.${ID}`)).toBe("owner-token");
  // The token never goes into the URL.
  expect(assign.mock.calls[0][0]).not.toContain("owner-token");
});

it("shows the server's reason when every sandbox is in use", async () => {
  respond(503, {
    detail: "Every sandbox is in use. Try again in a few minutes.",
  });
  render(<SandboxPage />);
  fireEvent.click(screen.getByRole("button", { name: "Start a sandbox" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Every sandbox is in use. Try again in a few minutes.",
  );
  expect(screen.getByRole("button", { name: "Start a sandbox" })).toBeEnabled();
});
