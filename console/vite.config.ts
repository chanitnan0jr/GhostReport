import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  base: "/report/",
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
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
      "/roles": {
        target:
          process.env.GHOST_ROLES_TARGET ??
          loadEnv(mode, process.cwd(), "GHOST_").GHOST_ROLES_TARGET ??
          "http://127.0.0.1:18100",
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
