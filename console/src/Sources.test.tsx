import { expect, it } from "vitest";
import sample from "../../fixtures/report.sample.json";
import { findingText } from "./format";
import { sessionSource } from "./Sources";
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

it("does not infer a missing source from the session ID", () => {
  const report = structuredClone(sample) as Report;
  const session = {
    ...report.current.sessions[0],
    session_id: "seed-unclassified",
  };
  expect(sessionSource(report, session)).toBe("Source unavailable");
});
