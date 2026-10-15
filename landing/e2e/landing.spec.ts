import { expect, test } from "@playwright/test";
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
  await page.goto("/");
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
