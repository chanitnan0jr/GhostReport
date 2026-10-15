import { expect, test } from "@playwright/test";
import { mockPartB } from "../src/mockPartB";
import { ROLE_CARDS } from "../src/content";

test("the exact role card leads to the app with only a session ID, on a 375 px-compatible page", async ({
  page,
}, info) => {
  let submittedSid = "";
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.route("**/roles/assign", async (route) => {
    const body = route.request().postDataJSON();
    expect(Object.keys(body)).toEqual(["session_id"]);
    submittedSid = body.session_id;
    await route.fulfill({ json: { role: "A" } });
  });
  await page.route("**/app/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Grant app</h1>" }),
  );
  await page.goto("/about/");
  await expect(
    page.getByRole("heading", { name: "Add it to your repo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/ghostreport-landing-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try the app as a user" }).click();
  await expect(page.locator(".role-text")).toHaveText(ROLE_CARDS.A);
  await expect(page.getByRole("button")).toHaveCount(1);
  await page.screenshot({
    path: `/tmp/ghostreport-role-${info.project.name}.png`,
  });
  expect(
    await page.evaluate(() => localStorage.getItem("ghost:judge_sid")),
  ).toBe(submittedSid);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/\\?sid=${submittedSid}$`));
  expect(apiRequests).toEqual([]);
});

test("ENS code-only page shows the pinned sources, review corrections and scope", async ({
  page,
}) => {
  await page.route("**/api/partb", (route) =>
    route.fulfill({ json: mockPartB() }),
  );
  await page.goto("/");
  await page.getByRole("link", { name: "Tested on a real repo: ENS" }).click();
  await expect(
    page.getByRole("heading", { name: "Tested on a real repo: ENS" }),
  ).toBeVisible();
  await expect(page.locator(".partb-table tbody tr")).toHaveCount(22);
  await expect(page.locator(".review-wrong")).toHaveCount(2);
  await expect(
    page.getByText("19 correct · 2 wrong · 1 partial (checked by hand)"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Pricing.tsx:185/ }),
  ).toHaveAttribute("href", /3c10925fa042568d4affd6897d34e42159abd7a3.*#L185/);
  await expect(
    page.getByRole("heading", {
      name: "Cannot check R2: needs wallet_gate_shown",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hypothesis Matrix" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `/tmp/ghostreport-ens-${test.info().project.name}.png`,
  });
});
