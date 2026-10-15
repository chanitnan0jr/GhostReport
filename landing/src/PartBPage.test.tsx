import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PartBPage } from "./PartBPage";
import { mockPartB } from "./mockPartB";
import { sourceLink } from "./partb";

it("shows the reviewed ENS result, all corrections and scoped limitations without behavioral findings", async () => {
  history.replaceState(null, "", "/ens/");
  const report = mockPartB();
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(report)));
  vi.stubGlobal("fetch", fetchMock);
  const { container } = render(<PartBPage />);
  await screen.findByRole("heading", { name: "Registration flow map" });
  expect(
    screen.getByText("19 correct · 2 wrong · 1 partial (checked by hand)"),
  ).toBeVisible();
  expect(screen.getByText(report.finding.title)).toBeVisible();
  expect(screen.getByText(report.finding.text)).toBeVisible();
  for (const limit of report.limits)
    expect(screen.getByText(limit)).toBeVisible();
  expect(screen.queryByText("Recommendation")).not.toBeInTheDocument();
  expect(container.querySelectorAll(".partb-table tbody tr")).toHaveLength(22);
  expect(
    screen.getByText(
      "The commit stage is complete and the commitment is [restricted wording].",
    ),
  ).toBeVisible();
  const wrong = container.querySelectorAll(".review-wrong");
  expect(wrong).toHaveLength(2);
  expect(wrong[0]).toHaveTextContent("commitComplete branch, not commitReady");
  expect(container.querySelectorAll(".review-partial")).toHaveLength(1);
  expect(
    screen.getByRole("heading", {
      name: "Cannot check R2: needs wallet_gate_shown",
    }),
  ).toBeVisible();
  expect(screen.getByText(/30,000 token cap/)).toHaveTextContent(
    "16 searched files",
  );
  expect(screen.getByText(/No ENS user sessions were collected/)).toBeVisible();
  expect(screen.getByRole("link", { name: /Pricing.tsx:185/ })).toHaveAttribute(
    "href",
    expect.stringContaining(`/blob/${report.target.commit}/`),
  );
  expect(container.textContent).not.toMatch(
    /\bH[1-4]\b|did not intend to apply|\b(?:confirmed|cause|proved)\b/i,
  );
  expect(
    screen.queryByRole("heading", { name: "Hypothesis Matrix" }),
  ).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.every(([path]) => path === "/api/partb")).toBe(
    true,
  );
});

it("offers retry when the code-only API is unavailable", async () => {
  history.replaceState(null, "", "/ens/");
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(mockPartB())));
  vi.stubGlobal("fetch", fetchMock);
  render(<PartBPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("503");
  fireEvent.click(
    within(screen.getByRole("alert")).getByRole("button", {
      name: "Try again",
    }),
  );
  await screen.findByRole("heading", { name: "Registration flow map" });
});

it("only links to the pinned ENS source on GitHub", () => {
  const report = mockPartB();
  expect(
    sourceLink(report.finding.refs[0].permalink, report.target.commit),
  ).toContain("https://github.com/ensdomains/ens-app-v3/blob/");
  expect(sourceLink("javascript:alert(1)", report.target.commit)).toBeNull();
  expect(
    sourceLink(report.finding.refs[0].permalink, "a".repeat(40)),
  ).toBeNull();
});
