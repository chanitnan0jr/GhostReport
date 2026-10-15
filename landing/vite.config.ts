import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const target =
    process.env.GHOST_API_TARGET ??
    loadEnv(mode, process.cwd(), "GHOST_").GHOST_API_TARGET ??
    "http://127.0.0.1:18000";
  const rolesTarget =
    process.env.GHOST_ROLES_TARGET ??
    loadEnv(mode, process.cwd(), "GHOST_").GHOST_ROLES_TARGET ??
    "http://127.0.0.1:18100";
  return {
    base: "/",
    plugins: [react()],
    resolve: { dedupe: ["react", "react-dom"] },
    build: {
      rollupOptions: {
        input: {
          main: "index.html",
          ens: "ens/index.html",
          about: "about/index.html",
          install: "install/index.html",
          try: "try/index.html",
        },
      },
    },
    server: {
      port: 5175,
      strictPort: true,
      proxy: {
        "/api": { target, changeOrigin: true },
        "/roles": { target: rolesTarget, changeOrigin: true },
        "/app": { target: "http://127.0.0.1:5173", ws: true },
        "/report": { target: "http://127.0.0.1:5174", ws: true },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      restoreMocks: true,
    },
  };
});
