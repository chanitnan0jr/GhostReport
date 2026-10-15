import { defineConfig, devices } from "@playwright/test";

const deployedUrl = process.env.BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  testMatch: deployedUrl ? "site.spec.ts" : "landing.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: deployedUrl ?? "http://127.0.0.1:18175",
    channel: "chromium",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: deployedUrl
    ? undefined
    : {
        command: "VITE_MOCK=0 npm run dev -- --port 18175",
        url: "http://127.0.0.1:18175",
        reuseExistingServer: false,
      },
});
