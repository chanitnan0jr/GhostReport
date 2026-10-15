import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Seeds a locked run by driving the real app, so every seed event comes from track().
//   BASE_URL=https://<api domain> npm run seed     (default: the compose demo on :80)
// Runs once per run: it skips itself if the report already has seed sessions.
const sharedBrowsers = "/tmp/ghostreport-browsers";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(sharedBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = sharedBrowsers;
}

export default defineConfig({
  testDir: ".",
  testMatch: "seed.spec.ts",
  fullyParallel: false,
  workers: 1, // one simulated user at a time, gentle on a 1 GB service
  retries: 0,
  timeout: 90_000,
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost",
    channel: "chromium",
    viewport: { width: 390, height: 780 },
    video: "off",
  },
});
