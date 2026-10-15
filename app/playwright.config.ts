import { defineConfig, devices } from "@playwright/test";

const deployedUrl = process.env.BASE_URL;
const realApi = Boolean(deployedUrl) || process.env.GHOST_E2E_REAL === "1";
const port = process.env.GHOST_E2E_PORT ?? "18176";
const localUrl = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: realApi ? "full-loop.spec.ts" : "flow.spec.ts",
  fullyParallel: !realApi,
  workers: realApi ? 1 : 2,
  reporter: "list",
  use: {
    baseURL: deployedUrl ?? localUrl,
    trace: "retain-on-failure",
    channel: "chromium",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 375, height: 812 },
        defaultBrowserType: "chromium",
      },
    },
  ],
  webServer: deployedUrl
    ? undefined
    : {
        command: `VITE_MOCK=${realApi ? "0" : "1"} VITE_RPC_ERROR_RATE=0 npm run dev -- --port ${port} --strictPort`,
        url: `${localUrl}/app/`,
        reuseExistingServer: false,
      },
});
