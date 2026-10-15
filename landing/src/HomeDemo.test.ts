import { describe, expect, it } from "vitest";
import connect from "../public/demo/connect.json";
import errorRetry from "../public/demo/error-retry.json";
import notNow from "../public/demo/not-now-answer.json";
import reject from "../public/demo/reject.json";
import type { Clip } from "./DemoClips";
import { steps } from "./HomeDemo";

const labels = (clip: unknown) => steps(clip as Clip).map((s) => s.label);

describe("session checklist", () => {
  it("lists only recorded events, in order", () => {
    expect(labels(connect)).toEqual([
      "Viewed a project",
      "Clicked Apply",
      "Saw the wallet gate",
      "Started connecting",
      "Wallet connected",
    ]);
  });

  it("marks an attempt with no outcome event, and nothing else", () => {
    expect(labels(reject)).toEqual([
      "Viewed a project",
      "Clicked Apply",
      "Saw the wallet gate",
      "Started connecting",
      "No result recorded",
      "Chose “Not now”",
    ]);
    expect(labels(errorRetry)).not.toContain("No result recorded");
    expect(labels(errorRetry)).toContain("Network error");
    expect(labels(notNow)).not.toContain("No result recorded");
  });

  it("adds the exit answer from the probe record", () => {
    const last = steps(notNow as unknown as Clip).at(-1)!;
    expect(last).toMatchObject({
      label: "Answered the exit question",
      kind: "answer",
    });
  });
});
