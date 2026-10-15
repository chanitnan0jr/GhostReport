import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import sample from "../../fixtures/report.sample.json";
import App from "./App";
import { findingText } from "./format";
import { Population, sessionSource } from "./Sources";
import type { Finding, Report } from "./types";

function mixedFinding(): Finding {
  return {
    ...structuredClone(sample.current.findings[0]),
    selected: 3,
    respondents: 5,
    by_source: {
      seed: { selected: 2, respondents: 3 },
      visitor: { selected: 1, respondents: 2 },
    },
    text: "3 of 5 respondents (seed 2 of 3 · visitors 1 of 2)",
  } as Finding;
}

it("accepts exact source-aware finding text and rejects inconsistent or misleading splits", () => {
  const value = mixedFinding();
  expect(findingText(value)).toBe(value.text);
  expect(
    findingText({ ...value, text: "3 of 5 respondents (visitors 3 of 5)" }),
  ).toBeNull();
  expect(
    findingText({
      ...value,
      by_source: { seed: { selected: 2, respondents: 5 } },
    }),
  ).toBeNull();
  expect(
    findingText({
      ...value,
      by_source: { visitor: { selected: -1, respondents: 5 } },
    }),
  ).toBeNull();
});

it("shows source totals, per-source respondent counts and the current session source", async () => {
  const report = structuredClone(sample) as Report;
  report.run.mode = "demo";
  report.current.population = "seed 3 + test 1 + visitors 2";
  report.current.sources = { seed: 3, test: 1, visitor: 2 };
  report.current.session_sources = Object.fromEntries(
    report.current.sessions.map((s, i) => [
      s.session_id,
      i < 3 ? "seed" : i === 3 ? "test" : "visitor",
    ]),
  );
  localStorage.setItem(
    "ghost:judge_sid",
    report.current.sessions[0].session_id,
  );
  report.current.findings[0] = mixedFinding();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(report))),
  );
  render(<App />);
  const population = await screen.findByRole("complementary", {
    name: "Session sources",
  });
  expect(population).toHaveTextContent("seed 3 + test 1 + visitors 2");
  expect(population).toHaveTextContent("3 of 6 sessions");
  expect(population).toHaveTextContent("1 of 6 sessions");
  expect(population).toHaveTextContent("2 of 6 sessions");
  expect(screen.getByText("Recorded sessions", { exact: true })).toBeVisible();
  expect(
    screen.queryByText("Visitors", { selector: ".funnel-step > span" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getAllByText(mixedFinding().text).length).toBeGreaterThan(0);
  expect(
    screen.getAllByLabelText("Respondents by source")[0],
  ).toHaveTextContent("Visitors · 1 of 2 respondents");
  expect(
    screen.getByRole("complementary", { name: "Your session" }),
  ).toHaveTextContent("Source: Simulated users (Playwright) — seed");
});

it("does not infer a missing source from the session ID or relabel combined counts as visitors", () => {
  const report = structuredClone(sample) as Report;
  const session = {
    ...report.current.sessions[0],
    session_id: "seed-unclassified",
  };
  expect(sessionSource(report, session)).toBe("Source unavailable");
  render(<Population report={report} />);
  expect(screen.getByText(/Source breakdown is unavailable/)).toBeVisible();
  expect(screen.queryByText("Visitors")).not.toBeInTheDocument();
});
