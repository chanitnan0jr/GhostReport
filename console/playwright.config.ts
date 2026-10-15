import { defineConfig, devices } from "@playwright/test";

const live = process.env.GHOST_LIVE === "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: live ? "live.spec.ts" : "report.spec.ts",
  workers: live ? 1 : 2,
  reporter: "list",
  use: {
    baseURL: live ? "http://127.0.0.1:5184" : "http://127.0.0.1:18174/report/",
    channel: "chromium",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "projector",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 375, height: 812 },
        defaultBrowserType: "chromium",
      },
    },
  ],
  webServer: live
    ? [
        {
          command: "VITE_MOCK=0 npm run dev -- --port 5184",
          url: "http://127.0.0.1:5184/report/",
          reuseExistingServer: true,
        },
        {
          command:
            "VITE_MOCK=0 npm --prefix ../app run dev -- --port 5183 --strictPort",
          url: "http://127.0.0.1:5183/app/",
          reuseExistingServer: true,
        },
      ]
    : {
        command: "VITE_MOCK=1 npm run dev -- --port 18174",
        url: "http://127.0.0.1:18174/report/",
        reuseExistingServer: false,
      },
});
