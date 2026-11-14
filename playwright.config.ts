import { defineConfig, devices } from "@playwright/test";

// Load .env so tests can tell whether a database is configured.
try {
  process.loadEnvFile();
} catch {}

// PLAYWRIGHT_BASE_URL runs the suite against a server you started (e.g. `next start -p 3191`); otherwise `npm run dev`.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: "npm run dev", url: baseURL, reuseExistingServer: true },
});
