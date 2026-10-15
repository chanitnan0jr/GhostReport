import { expect, test, type Page } from "@playwright/test";

async function enter(page: Page, query = "") {
  await page.goto(`/?sid=e2e${query}`);
  await page
    .getByRole("button", { name: "Continue with optional feedback" })
    .click();
  await page.getByRole("button", { name: /Open Source Commons/ }).click();
}

test("Not now exits immediately and optional answers reach the mock backend", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connect wallet to apply" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /What best describes/ }),
  ).toBeVisible();
  await page.getByLabel("Just browsing", { exact: true }).check();
  await page.getByLabel("Not sure who is asking", { exact: true }).check();
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(
    page.getByRole("heading", { name: /What best describes/ }),
  ).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__GHOST_MOCK__?.responses.length))
    .toBe(1);
  const data = await page.evaluate(() => window.__GHOST_MOCK__!);
  expect(data.planRequests).toEqual(expect.arrayContaining(["DP1", "DP2"]));
  expect(data.exposures).toHaveLength(1);
  expect(data.responses[0].exposure_id).toBe(data.exposures[0].exposure_id);
  expect(data.exposures[0].options_shown.at(-1)).toBe("other");
  expect(data.exposures[0].client_cohort_at_shown).toBe(
    "gate_event_no_attempt",
  );
  expect(data.exposures[0].event_seq_at_shown).toBe(4);
  expect(data.responses[0].option_ids).toHaveLength(2);
  expect(data.responses[0]).toMatchObject({
    plan_id: data.exposures[0].plan_id,
    session_id: data.exposures[0].session_id,
    shown_at: data.exposures[0].shown_at,
    event_seq_at_shown: data.exposures[0].event_seq_at_shown,
    options_shown: data.exposures[0].options_shown,
  });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /What best describes/ }),
  ).toHaveCount(0);
});

test("reject and retry preserve the deliberate gap; approve reaches the application form", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Connection rejected");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Connected · Mock wallet")).toBeVisible();
  await page.getByLabel("Project name").fill("PRIVATE DEMO TEXT");
  await page
    .getByLabel("What would you like to build?")
    .fill("NEVER SEND THIS");
  await page.getByRole("button", { name: "Finish demo application" }).click();
  await expect(
    page.getByRole("heading", { name: "Your idea has a beginning." }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__GHOST_MOCK__?.events.filter(
            (e) => e.event === "wallet_connected",
          ).length,
      ),
    )
    .toBe(1);
  const events = await page.evaluate(() => window.__GHOST_MOCK__!.events);
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  expect(events.filter((e) => e.event === "wallet_gate_shown")).toHaveLength(1);
  const attempts = events.filter((e) => e.event === "wallet_attempted");
  expect(attempts).toHaveLength(2);
  expect(attempts[0].attempt_id).not.toBe(attempts[1].attempt_id);
  expect(events.find((e) => e.event === "wallet_connected")?.attempt_id).toBe(
    attempts[1].attempt_id,
  );
  expect(
    events.some(
      (e) => e.event === "wallet_rejected" || e.event === "wallet_errored",
    ),
  ).toBe(false);
  expect(JSON.stringify(events)).not.toContain("PRIVATE");
  expect(JSON.stringify(events)).not.toContain("NEVER SEND");
});

test("browser Back returns to list and offers the DP2 question without wallet wording", async ({
  page,
}) => {
  await enter(page, "&probe=DP2");
  await page.goBack();
  await expect(page.getByRole("heading", { name: /Good ideas/ })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "What were you hoping to do on this page?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__GHOST_MOCK__?.responses.length))
    .toBe(1);
  expect(
    await page.evaluate(() => window.__GHOST_MOCK__?.responses[0].skipped),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("visible Back works and an attempted session receives no no-attempt probe", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /What best describes/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to projects" }).click();
  await expect(page.getByRole("heading", { name: /Good ideas/ })).toBeVisible();
});

test("Not now and Back remain usable when optional probe delivery never completes", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.evaluate(() => {
    const realFetch = window.fetch;
    window.fetch = (input, init) =>
      input.toString().startsWith("/api/probe/")
        ? new Promise<Response>(() => {})
        : realFetch(input, init);
    navigator.sendBeacon = () => false;
  });
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /What best describes/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /What best describes/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to projects" }).click();
  await expect(page.getByRole("heading", { name: /Good ideas/ })).toBeVisible();
});

test("declining optional feedback keeps the app usable and never shows a probe", async ({
  page,
}) => {
  await page.goto("/?sid=no-feedback");
  await page.getByRole("button", { name: "Continue without feedback" }).click();
  await page.getByRole("button", { name: /Open Source Commons/ }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /What best describes/ }),
  ).toHaveCount(0);
});
