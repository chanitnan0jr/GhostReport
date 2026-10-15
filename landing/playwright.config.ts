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
  // Laptop only for now (responsive layout is out of scope for the demo).
  projects: [
    {
      name: "laptop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
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
