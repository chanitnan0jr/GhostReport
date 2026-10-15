import { expect, test } from "@playwright/test";
import sample from "../../fixtures/report.sample.json" with { type: "json" };

test("renders the investigation document, opens a citation and keeps the seed label in view", async ({
  page,
}) => {
  await page.goto("/report/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Investigating wallet onboarding drop-off",
    }),
  ).toBeVisible();
  await expect(page.getByText("SEED DATA", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Digest held outside the system")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Write v2 snapshot" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `/tmp/ghostreport-console-${test.info().project.name}.png`,
  });
  const contents = page.getByRole("navigation", { name: "Report contents" });
  await contents.getByRole("link", { name: "3. Hypothesis Findings" }).click();
  await expect(page.getByRole("heading", { name: "H_other" })).toBeVisible();
  await page
    .getByRole("button", { name: /^Evidence \d+: H1 at DP1$/ })
    .first()
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Evidence inspector",
  });
  await expect(inspector).toContainText("2 of 3 respondents");
  await page.screenshot({
    path: `/tmp/ghostreport-console-matrix-${test.info().project.name}.png`,
  });
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
  await contents.getByRole("link", { name: "6. Limitations" }).click();
  await expect(page.getByText("SEED DATA", { exact: true })).toBeInViewport();
  await expect(
    page.getByRole("complementary", { name: "Limitations" }),
  ).toContainText("Commit: uncommitted.");
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

test("keeps each decision point's population separate under a hypothesis", async ({
  page,
}) => {
  await page.goto("/report/#findings");
  const items = page.locator("#h1 + p + ul > li");
  // One line per question population: DP1 and DP2 are never pooled.
  await expect(items.filter({ hasText: /^Self-reported at/ })).toHaveText([
    /^Self-reported at DP1\. 2 of 3 respondents selected this answer \(seed 2 of 3\)\./,
  ]);
});
