import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // 0.0.0.0 para o container publicar a porta no host (Task 8).
    host: "0.0.0.0",
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // e2e/ is the Playwright suite (`npm run test:e2e`); its *.spec.ts would otherwise match
    // Vitest's default include and run without a browser.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // No .env file exists for tests (infra/docker-compose.yml injects the real value at
    // build time — Task 8). Without this, apiBaseUrl is undefined and openapi-fetch's
    // Request construction throws "Failed to parse URL from /auth/login" before the
    // mocked fetch ever runs, making any test that hits the API client fail for the
    // wrong reason regardless of the mocked response.
    env: { VITE_API_BASE_URL: "http://localhost:8000" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/test/**"],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
});
