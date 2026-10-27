import { defineConfig, devices } from "@playwright/test";

// End-to-end suite: drives the real dashboard against the real API, so the whole stack has to
// be up first (`../infra/scripts/dev-up.sh`). Kept out of `npm test` on purpose — unit tests
// never touch the network (CLAUDE.md), these always do.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  // Specs share the dev database; serial keeps one spec's fixtures from racing another's.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "pt-BR",
    // Campina Grande: dates and times on screen read as the campus wall clock.
    timezoneId: "America/Fortaleza",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Prepare sweeps leftovers and opens the run's window before anyone signs in; setup signs
    // in; setup's teardown sweeps everything the run created once every spec is done.
    { name: "prepare", testMatch: /cleanup\.setup\.ts/ },
    { name: "setup", testMatch: /auth\.setup\.ts/, dependencies: ["prepare"], teardown: "cleanup" },
    { name: "cleanup", testMatch: /cleanup\.teardown\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
    },
  ],
});
