import { expect, test } from "@playwright/test";
import { ROLE_CARDS } from "../src/content";

test("landing, grant app and public report share an automated test session", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const generate = crypto.randomUUID.bind(crypto);
    Object.defineProperty(crypto, "randomUUID", {
      value: () => `e2e-${generate()}`,
    });
  });
  const apiPayloads: unknown[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/") && r.postData())
      apiPayloads.push(r.postDataJSON());
  });
  if (process.env.GHOST_MOCK_ROLES === "1")
    await page.route("**/roles/assign", (route) =>
      route.fulfill({ json: { role: "B" } }),
    );

  await page.goto("/try/");
  const assignmentPromise = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/roles/assign",
  );
  await page.getByRole("button", { name: "Try the app as a user" }).click();
  const assignment = await assignmentPromise;
  expect(assignment.ok()).toBe(true);
  const body = assignment.request().postDataJSON();
  expect(Object.keys(body)).toEqual(["session_id"]);
  const { role } = (await assignment.json()) as { role: "A" | "B" };
  await expect(page.locator(".role-text")).toHaveText(ROLE_CARDS[role]);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/\\?sid=${body.session_id}$`));
  await page
    .getByRole("button", { name: "Continue with optional feedback" })
    .click();
  const planPromise = page.waitForResponse((r) =>
    r.url().includes("decision_point=DP1"),
  );
  await page.getByRole("button", { name: /Open Source Commons/ }).click();
  expect(await (await planPromise).json()).not.toBeNull();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Something else", { exact: true }).check();
  const answerPromise = page.waitForResponse((r) =>
    r.url().endsWith("/api/probe/response"),
  );
  await page.getByRole("button", { name: "Send answer" }).click();
  expect((await answerPromise).ok()).toBe(true);
  await page.goto("/report/");
  const own = page.getByRole("complementary", { name: "Your session" });
  await expect(own).toContainText("Gate shown, no attempt");
  await expect(page.locator("[data-panel]")).toHaveCount(9);
  await expect(page.getByLabel("Operator token")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Write v2 snapshot" }),
  ).toHaveCount(0);
  const response = await request.get("/api/report");
  expect(response.ok()).toBe(true);
  const report = await response.json();
  expect(report.current.errors).toEqual([]);
  expect(report.current.session_sources[body.session_id]).toBe("test");
  expect(
    report.current.sessions.find(
      (s: { session_id: string }) => s.session_id === body.session_id,
    ).cohort,
  ).toBe("gate_event_no_attempt");
  expect(apiPayloads.length).toBeGreaterThan(0);
  const hasRole = (value: unknown): boolean =>
    value !== null &&
    typeof value === "object" &&
    (Object.hasOwn(value, "role") || Object.values(value).some(hasRole));
  expect(apiPayloads.some(hasRole)).toBe(false);
  await page.getByRole("link", { name: /Tested on ENS/ }).click();
  await expect(
    page.getByRole("heading", { name: "Tested on a real repo: ENS" }),
  ).toBeVisible();
  await expect(
    page.getByText("19 correct · 2 wrong · 1 partial (checked by hand)"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Cannot check R2: needs wallet_gate_shown",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
