import { expect, test } from "@playwright/test";
import type { Report } from "../src/types";

test("a real answer reaches the public report within three seconds", async ({
  page,
  context,
}) => {
  const getReport = async (): Promise<Report> => {
    const response = await context.request.get(
      "http://127.0.0.1:5184/api/report",
    );
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const initial = await getReport();
  expect(initial.locked, "Use an isolated, prelocked E2E run").toBe(true);
  expect(["pilot", "demo"]).toContain(initial.run.mode);
  const sessionId = `e2e-console-${crypto.randomUUID()}`;
  await context.addInitScript(
    (sid) => localStorage.setItem("ghost:judge_sid", sid),
    sessionId,
  );
  await page.goto("/report/#findings");
  await page.getByRole("heading", { name: "H_other", exact: true }).waitFor();
  await expect(
    page.getByRole("button", { name: "Write v2 snapshot" }),
  ).toHaveCount(0);
  const app = await context.newPage();
  await app.goto(`http://127.0.0.1:5183/app/?sid=${sessionId}`);
  await app
    .getByRole("button", { name: "Continue with optional feedback" })
    .click();
  const planPromise = app.waitForResponse((r) =>
    r.url().includes("decision_point=DP1"),
  );
  await app.getByRole("button", { name: /Open Source Commons/ }).click();
  const plan = await (await planPromise).json();
  expect(plan).not.toBeNull();
  await app.getByRole("button", { name: "Apply", exact: true }).click();
  await app.evaluate(() => {
    navigator.sendBeacon = () => true;
  });
  await app.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(app.getByRole("dialog")).toHaveCount(0);
  const option = plan.options.find(
    (o: { label: string }) => o.label === "Something else",
  );
  expect(option).toBeDefined();
  await app.getByLabel(option.label, { exact: true }).check();
  const prior = await getReport();
  const hypothesis = prior.hypotheses.find((h) => h.id === "H_other")!;
  expect(hypothesis).toBeDefined();
  const previous = prior.current.findings.find(
    (f) =>
      f.hypothesis_id === hypothesis.id &&
      f.decision_point === "DP1" &&
      f.question_version === plan.question_version &&
      f.cohort === plan.target_cohort,
  )!;
  expect(previous).toBeDefined();
  const expectedText = `${previous.selected + 1} of ${previous.respondents + 1} respondents`;
  const answerPromise = app.waitForResponse((r) =>
    r.url().endsWith("/api/probe/response"),
  );
  await app.getByRole("button", { name: "Send answer" }).click();
  const answer = await answerPromise;
  expect(answer.ok()).toBe(true);
  expect((await answer.json()).status).toBe("recorded_inferred");
  expect(answer.request().postDataJSON()).toMatchObject({
    session_id: sessionId,
    event_seq_at_shown: 4,
  });
  const started = Date.now();
  // The document is re-read when the evidence snapshot changes.
  const liveGroup = page
    .locator("#h-other + p + ul > li")
    .filter({ hasText: /^Self-reported at DP1\./ });
  await expect(liveGroup).toContainText(`${expectedText} selected`, {
    timeout: 3000,
  });
  const latency = Date.now() - started;
  expect(latency).toBeLessThan(3000);
  console.log(`Response → public report: ${latency} ms`);
  await page.goto("/report/#coverage");
  await expect(
    page.getByRole("complementary", { name: "Your session" }),
  ).toContainText("Gate shown, no attempt");
  const final = await getReport();
  expect(final.current.errors).toEqual([]);
  expect(
    final.current.probes.find((p) => p.plan_id === plan.plan_id)!.counts
      .inferred_from_response,
  ).toBe(
    prior.current.probes.find((p) => p.plan_id === plan.plan_id)!.counts
      .inferred_from_response + 1,
  );
  await page.screenshot({
    path: `/tmp/ghostreport-console-live-${test.info().project.name}.png`,
  });
  await app.screenshot({
    path: `/tmp/ghostreport-app-live-${test.info().project.name}.png`,
  });
});
