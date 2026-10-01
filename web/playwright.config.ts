import { defineConfig, devices } from "@playwright/test";

// The suite registers ~15 accounts a minute, but the API's auth rate limit defaults to 10 per minute per IP.
// Bring the stack up with the e2e override (README, "End-to-end tests"):
//   docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
const reduced = { contextOptions: { reducedMotion: "reduce" as const } };

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", locale: "es-MX", timezoneId: "America/Tijuana" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /happy-path|onboarding|quick-add|view-transition|perf|reduced-motion|savings/ },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } }, testMatch: /mobile|gestures/ },
    { name: "desktop-reduced", use: { ...devices["Desktop Chrome"], ...reduced }, testMatch: /happy-path|onboarding|view-transition|reduced-motion/ },
    { name: "visual", use: { ...devices["Desktop Chrome"], ...reduced }, testMatch: /visual/ },
  ],
});
