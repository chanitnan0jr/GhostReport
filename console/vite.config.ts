import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [".."] },
    proxy: {
      "/api": {
        target:
          process.env.GHOST_API_TARGET ??
          loadEnv(mode, process.cwd(), "GHOST_").GHOST_API_TARGET ??
          "http://127.0.0.1:18000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
}));
