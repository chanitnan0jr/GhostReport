import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

interface Finding {
  hypothesis_id: string;
  decision_point: string;
  cohort: string;
  question_version: string;
  selected: number;
  respondents: number;
  text: string;
}
interface Report {
  locked: boolean;
  current: {
    sessions: { session_id: string; cohort: string }[];
    probes: {
      plan_id: string;
      decision_point: string;
      counts: { answered: number; skipped: number };
    }[];
    findings: Finding[];
    errors: unknown[];
  };
}
interface Plan {
  plan_id: string;
  decision_point: string;
  question_version: string;
  target_cohort: string;
  stem: string;
  options: { id: string; label: string }[];
}

test.describe.configure({ mode: "serial" });

async function report(
  request: APIRequestContext,
  baseURL: string,
): Promise<Report> {
  const response = await request.get(new URL("/api/report", baseURL).href);
  expect(response.ok(), "The public report endpoint must be available").toBe(
    true,
  );
  return (await response.json()) as Report;
}

async function enter(
  page: Page,
  baseURL: string,
  point: "DP1" | "DP2",
): Promise<{ sid: string; plan: Plan }> {
  const sid = `e2e-${point.toLowerCase()}-${crypto.randomUUID()}`;
  await page.goto(new URL(`/app/?sid=${sid}`, baseURL).href);
  const consent = page.getByRole("button", {
    name: "Continue with optional feedback",
  });
  const project = page.getByRole("button", { name: /Open Source Commons/ });
  await consent.or(project).first().waitFor();
  if (await consent.isVisible()) await consent.click();
  const planPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/probe-plan") &&
      new URL(response.url()).searchParams.get("decision_point") === point,
  );
  await project.click();
  const response = await planPromise;
  expect(response.ok()).toBe(true);
  const plan = (await response.json()) as Plan | null;
  expect(
    plan,
    "Start a backend with an approved, locked investigation and an open probe plan",
  ).not.toBeNull();
  return { sid, plan: plan! };
}

function groupFinding(
  value: Report,
  point: string,
  cohort: string,
  version: string,
  id: string,
): Finding {
  const finding = value.current.findings.find(
    (f) =>
      f.decision_point === point &&
      f.cohort === cohort &&
      f.question_version === version &&
      f.hypothesis_id === id,
  );
  expect(
    finding,
    "The report must include findings for the approved question population",
  ).toBeDefined();
  return finding!;
}

for (const point of ["DP1", "DP2"] as const) {
  test(`${point}: the real app records an exit and an answer in the correct report population`, async ({
    page,
    request,
    baseURL,
  }) => {
    const origin = baseURL!;
    expect(
      (await report(request, origin)).locked,
      "Lock the investigation before running the suite",
    ).toBe(true);
    const { sid, plan } = await enter(page, origin, point);
    if (point === "DP1") {
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Connect wallet to apply" }),
      ).toBeVisible();
    }
    // Optional delivery never holds the exit, even if a beacon is lost.
    await page.evaluate(() => {
      navigator.sendBeacon = () => true;
    });
    await page
      .getByRole("button", {
        name: point === "DP1" ? "Not now" : "Back to projects",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: plan.stem, exact: true }),
    ).toBeVisible();
    const option = plan.options.find((o) => o.label === "Something else");
    expect(
      option,
      "The reviewed plan must include the required Other option",
    ).toBeDefined();
    await page.getByLabel(option!.label, { exact: true }).check();
    const before = await report(request, origin);
    const hypothesisId = "H_other";
    const previous = groupFinding(
      before,
      point,
      plan.target_cohort,
      plan.question_version,
      hypothesisId!,
    );
    const previousCount = before.current.probes.find(
      (p) => p.plan_id === plan.plan_id,
    )!.counts.answered;
    const responsePromise = page.waitForResponse((r) =>
      r.url().endsWith("/api/probe/response"),
    );
    await page.getByRole("button", { name: "Send answer" }).click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({
      session_id: sid,
      plan_id: plan.plan_id,
      event_seq_at_shown: point === "DP1" ? 4 : 2,
    });
    await expect
      .poll(
        async () =>
          (await report(request, origin)).current.probes.find(
            (p) => p.plan_id === plan.plan_id,
          )!.counts.answered,
      )
      .toBe(previousCount + 1);
    const after = await report(request, origin);
    expect(
      after.current.sessions.find((s) => s.session_id === sid)?.cohort,
    ).toBe(point === "DP1" ? "gate_event_no_attempt" : "no_gate_event");
    const finding = groupFinding(
      after,
      point,
      plan.target_cohort,
      plan.question_version,
      hypothesisId!,
    );
    expect(finding.respondents).toBe(previous.respondents + 1);
    expect(finding.selected).toBe(previous.selected + 1);
    expect(finding.text).toBe(
      `${finding.selected} of ${finding.respondents} respondents`,
    );
    expect(after.current.errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("Skip is counted separately and leaves self-report findings unchanged", async ({
  page,
  request,
  baseURL,
}) => {
  const origin = baseURL!;
  const { sid, plan } = await enter(page, origin, "DP1");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: plan.stem, exact: true }),
  ).toBeVisible();
  const before = await report(request, origin);
  const previous = before.current.probes.find(
    (p) => p.plan_id === plan.plan_id,
  )!.counts;
  const unchanged = before.current.findings
    .filter(
      (f) =>
        f.decision_point === "DP1" &&
        f.question_version === plan.question_version,
    )
    .map((f) => ({
      id: f.hypothesis_id,
      selected: f.selected,
      respondents: f.respondents,
      text: f.text,
    }));
  const responsePromise = page.waitForResponse((r) =>
    r.url().endsWith("/api/probe/response"),
  );
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: plan.stem, exact: true }),
  ).toHaveCount(0);
  expect((await responsePromise).ok()).toBe(true);
  await expect
    .poll(
      async () =>
        (await report(request, origin)).current.probes.find(
          (p) => p.plan_id === plan.plan_id,
        )!.counts.skipped,
    )
    .toBe(previous.skipped + 1);
  const after = await report(request, origin);
  expect(
    after.current.probes.find((p) => p.plan_id === plan.plan_id)!.counts
      .answered,
  ).toBe(previous.answered);
  expect(
    after.current.findings
      .filter(
        (f) =>
          f.decision_point === "DP1" &&
          f.question_version === plan.question_version,
      )
      .map((f) => ({
        id: f.hypothesis_id,
        selected: f.selected,
        respondents: f.respondents,
        text: f.text,
      })),
  ).toEqual(unchanged);
  expect(after.current.sessions.find((s) => s.session_id === sid)?.cohort).toBe(
    "gate_event_no_attempt",
  );
  expect(after.current.errors).toEqual([]);
});
