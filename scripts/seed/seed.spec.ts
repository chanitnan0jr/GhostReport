import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// 20 simulated users (session IDs seed-NN-*, reported as "seed", never as visitors).
// The four role-card personas are recorded to videos/ for the /demo page.
type Answer = number[] | "requester" | "skip" | "leave";
type Path = "browse" | "not-now" | "connect" | "error-retry" | "reject" | "inactive";
interface Visit {
  path: Path;
  answer?: Answer; // option positions among the non-fixed options
  video?: string;
}

const VISITS: Visit[] = [
  { path: "connect", video: "connect" },
  { path: "reject", video: "reject" },
  { path: "error-retry", video: "error-retry" },
  { path: "not-now", answer: [1], video: "not-now-answer" },
  ...([[1], [0], "requester", [2], [1, 2], "skip"] as Answer[]).map(
    (answer): Visit => ({ path: "not-now", answer }),
  ),
  ...([[0], [0], [1], "skip", [0], "leave"] as Answer[]).map(
    (answer): Visit => ({ path: "browse", answer }),
  ),
  { path: "connect" },
  { path: "connect" },
  { path: "inactive" },
  { path: "inactive" },
];
const FIXED = ["Something else", "Not sure who is asking"];
const VIDEO_DIR = new URL("./videos/", import.meta.url).pathname;
const pause = (page: Page, ms = 700) => page.waitForTimeout(ms);

let skipReason = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const report = await (await request.get("/api/report")).json();
  if (!report.locked) skipReason = "lock v1 before seeding";
  else if ((report.current.sources?.seed ?? report.current.seeded_sessions) > 0)
    skipReason = "this run is already seeded";
});

/** Every tracked event has left the browser (the tracker flushes after 250 ms). */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    [sessionStorage, localStorage].every((store) =>
      Object.keys(store)
        .filter((key) => key.endsWith(":tracking-v1"))
        .every((key) => JSON.parse(store.getItem(key) ?? "{}").pending?.length === 0),
    ),
  );
}

async function enter(page: Page, sid: string, project: number): Promise<void> {
  await page.goto(`/app/?sid=${sid}`);
  const consent = page.getByRole("button", { name: "Continue with optional feedback" });
  const rows = page.locator(".project-row");
  await consent.or(rows.first()).first().waitFor();
  if (await consent.isVisible()) {
    await pause(page);
    await consent.click();
  }
  await pause(page);
  await rows.nth(project % (await rows.count())).click();
  await pause(page, 1200);
}

async function openGate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect wallet to apply" })).toBeVisible();
  await pause(page, 1500);
}

async function connect(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await pause(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
}

async function answerProbe(page: Page, answer: Answer): Promise<void> {
  const card = page.locator('[aria-labelledby="probe-title"]');
  try {
    await card.waitFor({ timeout: 5_000 });
  } catch {
    return; // not offered (budget, cohort or plan closed): the app decides, not the bot
  }
  await pause(page, 1200);
  if (answer === "leave") return;
  if (answer === "skip") {
    await card.getByRole("button", { name: "Skip", exact: true }).click();
    return;
  }
  const labels = (await card.locator(".probe-option").allInnerTexts()).map((t) => t.trim());
  const choices = labels.filter((label) => !FIXED.includes(label));
  const picks =
    answer === "requester"
      ? ["Not sure who is asking"]
      : answer.map((i) => choices[i]).filter((label) => label !== undefined);
  for (const label of picks.length ? picks : ["Something else"]) {
    await card.getByLabel(label, { exact: true }).check();
    await pause(page, 500);
  }
  const sent = page.waitForResponse((r) => r.url().includes("/api/probe/response"));
  await card.getByRole("button", { name: "Send answer" }).click();
  expect((await sent).ok()).toBe(true);
}

async function run(page: Page, visit: Visit, sid: string, project: number): Promise<void> {
  // The first connection errors 10% of the time; pin it so each persona is deterministic.
  const first = visit.path === "error-retry" ? 0 : 0.999;
  await page.addInitScript((value) => {
    Math.random = () => value;
  }, first);
  await enter(page, sid, project);
  switch (visit.path) {
    case "browse":
      await page.getByRole("button", { name: "Back to projects", exact: true }).click();
      await answerProbe(page, visit.answer ?? "leave");
      break;
    case "not-now":
      await openGate(page);
      await page.getByRole("button", { name: "Not now", exact: true }).click();
      await answerProbe(page, visit.answer ?? "leave");
      break;
    case "connect":
    case "error-retry":
      await openGate(page);
      await connect(page);
      if (visit.path === "error-retry") {
        await expect(page.getByText(/Simulated network error/)).toBeVisible();
        await pause(page, 1500);
        await connect(page); // retrying always succeeds
      }
      await page.getByPlaceholder("A name for your idea").fill("Neighbourhood seed library");
      await page
        .getByPlaceholder("A few sentences is a good start.")
        .fill("A shared shelf of seeds anyone can borrow and return after harvest.");
      await pause(page);
      await page.getByRole("button", { name: "Finish demo application" }).click();
      await pause(page, 1200);
      break;
    case "reject":
      await openGate(page);
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      await pause(page);
      await page.getByRole("button", { name: "Reject", exact: true }).click();
      await pause(page, 1500);
      await page.getByRole("button", { name: "Not now", exact: true }).click();
      await answerProbe(page, "leave");
      break;
    case "inactive":
      break; // looked, then went quiet; DP0 marks the session inactive later
  }
  await settle(page);
  await pause(page, 1000);
}

const ms = (iso: string) => new Date(iso).getTime();

/** The session as the server received it, timed against the clip.

The offset to the first server-received event is measured on this machine (clip start →
first /api/events acknowledgement); later offsets use server receive times only, so clock
skew between this machine and the server never enters the timeline.
*/
async function clipLog(
  request: APIRequestContext, sid: string, persona: string, firstAckMs: number,
): Promise<object> {
  const response = await request.get(`/api/seed-sessions/${sid}`);
  expect(response.ok(), `the server must hold ${sid}`).toBe(true);
  const body = await response.json();
  const base = ms(body.events[0].received_at);
  const at = (iso: string | null) => (iso ? firstAckMs + ms(iso) - base : null);
  // The probe beacon leaves at once while events flush after 250 ms, so the server can
  // receive the exposure first; never show it before the event it followed.
  const exit = body.probe
    ? at(body.events.find((e: { seq: number }) => e.seq === body.probe.after_seq)?.received_at ?? null)
    : null;
  const notBefore = (t: number | null) => (t === null || exit === null ? t : Math.max(t, exit));
  return {
    session_id: sid,
    persona,
    label: "Simulated users (Playwright) — seed",
    video_url: `${persona}.webm`,
    events: body.events.map((e: { seq: number; event: string; received_at: string }) => ({
      t_ms: at(e.received_at), event: e.event, seq: e.seq,
    })),
    cohort: body.cohort,
    exit_type: body.exit_type,
    after_retry: body.after_retry,
    probe: body.probe && {
      decision_point: body.probe.decision_point,
      status: body.probe.status,
      selected: body.probe.selected,
      shown_t_ms: notBefore(at(body.probe.shown_received_at)),
      responded_t_ms: notBefore(at(body.probe.responded_received_at)),
    },
  };
}

VISITS.forEach((visit, index) => {
  const sid = `seed-${String(index + 1).padStart(2, "0")}-${visit.path}`;
  test(sid, async ({ browser, baseURL, request }) => {
    test.skip(skipReason !== "", skipReason);
    const size = { width: 390, height: 780 };
    const context = await browser.newContext({
      baseURL,
      viewport: size,
      recordVideo: visit.video ? { dir: test.info().outputPath("video"), size } : undefined,
    });
    const page = await context.newPage();
    const clipStart = Date.now();
    let firstAckMs = -1;
    page.on("response", (r) => {
      if (firstAckMs < 0 && r.url().includes("/api/events") && r.ok())
        firstAckMs = Date.now() - clipStart;
    });
    await run(page, visit, sid, index);
    const video = page.video();
    await context.close();
    if (video && visit.video) {
      mkdirSync(VIDEO_DIR, { recursive: true });
      await video.saveAs(`${VIDEO_DIR}${visit.video}.webm`);
      const log = await clipLog(request, sid, visit.video, Math.max(firstAckMs, 0));
      writeFileSync(`${VIDEO_DIR}${visit.video}.json`, JSON.stringify(log, null, 2) + "\n");
    }
  });
});
