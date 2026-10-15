import { expect, test, type Page } from "@playwright/test";

// Release smoke: every public page and API of one origin (docker compose or Railway).
//   BASE_URL=http://localhost npm run smoke
// Read-only except /app/, which is opened as an e2e-* session (reported as "test").
const PERSONAS = ["connect", "reject", "error-retry", "not-now-answer"];
const TABS = [
  "Home", "Demo", "Try the App", "Segments", "Workflow Map", "Report", "ENS", "Install", "About",
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("api", () => {
  test("health, run and roles", async ({ request }) => {
    const health = await (await request.get("/api/health")).json();
    expect(health.ok).toBe(true);
    const verified = health.run.verifications?.find(
      (v: { event: string }) => v.event === "wallet_gate_shown",
    );
    expect(verified, "build must carry the gate instrumentation test (set GIT_SHA)").toBeTruthy();
    expect((await request.get("/roles/health")).ok()).toBe(true);
  });

  test("report: locked, seeded, split by source, narrative checked", async ({ request }) => {
    const report = await (await request.get("/api/report")).json();
    expect(report.locked, "v1 must be locked").toBe(true);
    expect(report.v1.digest).toMatch(/^[0-9a-f]{64}$/);
    const current = report.current;
    expect(current.errors).toEqual([]);
    expect(current.population).toMatch(/^seed \d+ \+ (test \d+ \+ )?visitors \d+$/);
    expect(current.sources.seed, "run the Playwright seed first").toBeGreaterThan(0);
    expect(["llm", "template"]).toContain(report.narrative.source);
    expect(report.narrative.text).toContain(current.population);
    expect(report.narrative.text.toLowerCase()).not.toMatch(/\bcaus/);
  });

  test("journeys: three segments partition the sessions", async ({ request }) => {
    const graph = await (await request.get("/api/journeys")).json();
    expect(graph.segments.map((s: { segment: string }) => s.segment)).toEqual([
      "browsers", "stalled_at_wallet", "connected",
    ]);
    const total = graph.segments.reduce((n: number, s: { sessions: number }) => n + s.sessions, 0);
    expect(total).toBe(graph.sessions);
    expect((await request.get("/api/journeys?format=mermaid")).ok()).toBe(true);
  });

  test("evidence, workflow and Part B", async ({ request }) => {
    const evidence = await (await request.get("/api/evidence")).json();
    expect(Object.keys(evidence.highlight).length).toBeGreaterThan(2);
    for (const target of ["app", "ens"]) {
      const map = await (await request.get(`/api/workflow?target=${target}`)).json();
      expect(map.nodes.length, `${target} workflow map`).toBeGreaterThan(5);
    }
    const partb = await (await request.get("/api/partb")).json();
    expect(partb.ref_check).toMatchObject({ checked: 22, correct: 19, wrong: 2, partial: 1 });
  });

  test("recorded demo clips", async ({ request }) => {
    for (const persona of PERSONAS) {
      const log = await request.get(`/demo/${persona}.json`);
      expect(log.ok(), `${persona}.json`).toBe(true);
      expect((await log.json()).events.length).toBeGreaterThan(2);
      const video = await request.head(`/demo/${persona}.webm`);
      expect(video.ok(), `${persona}.webm`).toBe(true);
    }
  });
});

test.describe("pages", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const [path, text] of [
    ["/", "Your users stop at the wallet step."],
    ["/try/", "Try the app as a real user"],
    ["/report/", "seed"],
    ["/ens/", "Pricing.tsx"],
    ["/about/", "GhostReport"],
    ["/install/", "Add GhostReport to your repo"],
  ] as const) {
    test(`${path} renders with the header`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.getByText(text).first()).toBeVisible();
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      for (const tab of TABS) await expect(nav.getByRole("link", { name: tab })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("/seed/ plays the four clips with their logs", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/seed/");
    await page.getByRole("button", { name: /Play all four/ }).click();
    await expect(page.locator(".clip-log li:not(.clip-waiting)").first()).toBeVisible({
      timeout: 10_000,
    });
    expect(errors).toEqual([]);
  });

  test("/app/ opens as a test session", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/app/?sid=e2e-smoke-${Date.now()}`);
    const consent = page.getByRole("button", { name: "Continue with optional feedback" });
    await expect(consent.or(page.locator(".project-row").first()).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
