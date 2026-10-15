import { expect, test } from "@playwright/test";
import type { Report } from "../src/types";

test("real pilot API: lost exposure beacon is recovered from the answer and the console polls the change within 3 seconds", async ({
  page,
  context,
}) => {
  const initialResponse = await context.request.get(
    "http://127.0.0.1:5184/api/report",
  );
  expect(initialResponse.ok()).toBe(true);
  const initial = (await initialResponse.json()) as Report;
  expect(initial.run.mode, "Use an isolated pilot run for this test").toBe(
    "pilot",
  );
  await page.goto("/");
  await page.getByRole("heading", { name: "Hypothesis Matrix" }).waitFor();
  if (!initial.locked)
    await page.getByRole("button", { name: "Lock v1", exact: true }).click();
  await expect(page.getByLabel("v1 digest")).toBeVisible();
  await expect(page.getByLabel("Digest held outside the system")).toHaveValue(
    "",
  );

  const app = await context.newPage();
  const sessionId = `ui-${Date.now()}`;
  await app.goto(`http://127.0.0.1:5183/?sid=${sessionId}`);
  await app
    .getByRole("button", { name: "Continue with optional feedback" })
    .click();
  const planResponses = [
    app.waitForResponse((r) => r.url().includes("decision_point=DP1")),
    app.waitForResponse((r) => r.url().includes("decision_point=DP2")),
  ];
  await app.getByRole("button", { name: /Open Source Commons/ }).click();
  for (const pending of planResponses)
    expect(await (await pending).json()).not.toBeNull();
  await app.getByRole("button", { name: "Apply", exact: true }).click();
  // Emulate a beacon accepted by the browser but lost before reaching the API.
  await app.evaluate(() => {
    navigator.sendBeacon = () => true;
  });
  await app.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(app.getByRole("dialog")).toHaveCount(0);
  await app.getByLabel("Just browsing", { exact: true }).check();
  const priorResponse = await context.request.get(
    "http://127.0.0.1:5184/api/report",
  );
  const prior = (await priorResponse.json()) as Report;
  const priorFinding = prior.current.findings.find(
    (f) => f.hypothesis_id === "H3" && f.decision_point === "DP1",
  )!;
  const expectedText = `${priorFinding.selected + 1} of ${priorFinding.respondents + 1} respondents`;
  const answerPromise = app.waitForResponse((r) =>
    r.url().endsWith("/api/probe/response"),
  );
  await app.getByRole("button", { name: "Send answer" }).click();
  const answer = await answerPromise;
  expect(answer.ok()).toBe(true);
  expect((await answer.json()).status).toBe("recorded_inferred");
  const submitted = answer.request().postDataJSON();
  expect(submitted.event_seq_at_shown).toBe(4);
  expect(submitted.session_id).toBe(sessionId);
  const started = Date.now();
  const liveGroup = page
    .locator("#findings .finding-group")
    .filter({ has: page.getByRole("heading", { name: /^DP1/ }) });
  await expect(liveGroup.getByText(expectedText, { exact: true })).toBeVisible({
    timeout: 3000,
  });
  const latency = Date.now() - started;
  expect(latency).toBeLessThan(3000);
  console.log(`Live response → console update: ${latency} ms`);
  const final = (await (
    await context.request.get("http://127.0.0.1:5184/api/report")
  ).json()) as Report;
  const counts = final.current.probes.find(
    (p) => p.decision_point === "DP1",
  )!.counts;
  expect(counts.inferred_from_response).toBe(
    prior.current.probes.find((p) => p.decision_point === "DP1")!.counts
      .inferred_from_response + 1,
  );
  expect(final.current.errors).toEqual([]);
  await page.screenshot({ path: "/tmp/ghostreport-console-live.png" });
  await app.screenshot({ path: "/tmp/ghostreport-app-live.png" });
});
