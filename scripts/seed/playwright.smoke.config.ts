import config from "./playwright.config";
import { defineConfig } from "@playwright/test";

// Same browser setup as the seed; runs smoke.spec.ts (npm run smoke).
export default defineConfig({ ...config, testMatch: "smoke.spec.ts", timeout: 30_000 });
