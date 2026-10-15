import { expect, test } from "@playwright/test";
import sample from "../../fixtures/report.sample.json" with { type: "json" };

test("renders the shared sample with all panels and keeps the seed banner visible when scrolling", async ({
  page,
}) => {
  await page.goto("/report/");
  await expect(page.locator("[data-panel]")).toHaveCount(9);
  await expect(page.getByText("SEED DATA", { exact: true })).toBeVisible();
  await expect(
    page.locator(".matrix .hypothesis-id").filter({ hasText: "H_other" }),
  ).toBeVisible();
  await expect(
    page.locator(".matrix").getByText("2 of 3 respondents", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Digest held outside the system")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Write v2 snapshot" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `/tmp/ghostreport-console-${test.info().project.name}.png`,
  });
  await page.locator("#hypotheses").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `/tmp/ghostreport-console-matrix-${test.info().project.name}.png`,
  });
  await page.locator("#limitations").scrollIntoViewIfNeeded();
  await expect(page.getByText("SEED DATA", { exact: true })).toBeInViewport();
  expect(await page.locator("#limitations details").count()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("does not auto-fill the digest; a mismatch shows 409 and an operator-supplied digest writes a snapshot", async ({
  page,
}) => {
  await page.goto("/report/?operator=1");
  await page.getByLabel("Operator token").fill("mock-operator-token");
  await page.getByRole("button", { name: "Unlock operator tools" }).click();
  const input = page.getByLabel("Digest held outside the system");
  await expect(input).toHaveValue("");
  const write = page.getByRole("button", { name: "Write v2 snapshot" });
  await expect(write).toBeDisabled();
  await input.fill("0".repeat(64));
  await write.click();
  await expect(page.getByRole("alert")).toContainText("409");
  await input.fill(sample.v1.digest);
  await write.click();
  await expect(page.getByText(/Snapshot v2 written/)).toBeVisible();
  await expect(input).toHaveValue("");
});

test("switches the matrix population without pooling cohorts", async ({
  page,
}) => {
  await page.goto("/report/");
  await page
    .getByLabel("Evidence population")
    .selectOption("DP2|no_gate_event|dp2.v1");
  await expect(
    page.locator(".matrix").getByText("2 of 3 respondents"),
  ).toHaveCount(0);
  await expect(
    page.locator(".matrix").getByText("0 of 0 respondents"),
  ).toHaveCount(8);
});
