import { defineConfig } from "@playwright/test";

/**
 * Smoke suite — read-only by design. It must be safe to run against any
 * database, including the shared one, until the Neon dev branch exists.
 * Point at another host with SMOKE_BASE_URL (e.g. the live site).
 */
const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  retries: 1,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  webServer: process.env.SMOKE_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3100",
        url: "http://localhost:3100",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
