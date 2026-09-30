import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { register, uniqueEmail } from "./helpers";

test("performance: canvas-confetti is not part of the dashboard's first-load JS", async ({ page, browser }, testInfo) => {
  await register(page, uniqueEmail("perf"));
  // A fresh context that reuses the session but has an empty HTTP cache, so every chunk the dashboard needs is fetched.
  const context = await browser.newContext({ storageState: await page.context().storageState(), locale: "es-MX", timezoneId: "America/Tijuana" });
  const cold = await context.newPage();
  const scripts: { url: string; gz: number; confetti: boolean }[] = [];
  cold.on("response", async (res) => {
    if (res.request().resourceType() !== "script") return;
    const body = await res.body().catch(() => null);
    if (!body) return;
    // canvas-confetti's bundle is the only one that creates OffscreenCanvas workers for particles.
    scripts.push({ url: res.url(), gz: gzipSync(body, { level: 9 }).length, confetti: body.includes("OffscreenCanvasRenderingContext2D") });
  });
  await cold.goto("/es/dashboard");
  await expect(cold.getByRole("heading", { level: 1 })).toBeVisible();
  await cold.waitForLoadState("networkidle");

  const total = scripts.reduce((a, s) => a + s.gz, 0);
  testInfo.annotations.push({ type: "dashboard first-load JS (gzip)", description: `${(total / 1024).toFixed(1)} KB in ${scripts.length} scripts` });
  console.log(`dashboard first-load JS: ${(total / 1024).toFixed(1)} KB gzip in ${scripts.length} scripts`);
  expect(scripts.length).toBeGreaterThan(5);
  expect(scripts.filter((s) => s.confetti).map((s) => s.url), "canvas-confetti must load on demand").toEqual([]);
  await context.close();
});
