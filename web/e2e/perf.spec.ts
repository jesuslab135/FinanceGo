import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { register, typeDigits, uniqueEmail } from "./helpers";

test("performance: canvas-confetti stays out of the dashboard's first-load JS and loads on the first-expense celebration", async ({ page, browser }, testInfo) => {
  await register(page, uniqueEmail("perf"));
  // A fresh context that reuses the session but has an empty HTTP cache, so every chunk the dashboard needs is fetched.
  const context = await browser.newContext({ storageState: await page.context().storageState(), locale: "es-MX", timezoneId: "America/Tijuana" });
  const cold = await context.newPage();
  const scripts: { url: string; gz: number; confetti: boolean }[] = [];
  const pending: Promise<void>[] = [];
  cold.on("response", (res) => {
    if (res.request().resourceType() !== "script") return;
    pending.push(
      res.body().then(
        (body) => {
          // The confetti bundle is identified by the OffscreenCanvas rendering context it feature-detects.
          scripts.push({ url: res.url(), gz: gzipSync(body, { level: 9 }).length, confetti: body.includes("OffscreenCanvasRenderingContext2D") });
        },
        () => undefined,
      ),
    );
  });
  await cold.goto("/es/dashboard");
  await expect(cold.getByRole("heading", { level: 1 })).toBeVisible();
  await cold.waitForLoadState("networkidle");
  await Promise.all(pending); // every body has been read before asserting

  const total = scripts.reduce((a, s) => a + s.gz, 0);
  testInfo.annotations.push({ type: "dashboard first-load JS (gzip)", description: `${(total / 1024).toFixed(1)} KB in ${scripts.length} scripts` });
  console.log(`dashboard first-load JS: ${(total / 1024).toFixed(1)} KB gzip in ${scripts.length} scripts`);
  expect(scripts.length).toBeGreaterThan(5);
  expect(scripts.filter((s) => s.confetti).map((s) => s.url), "canvas-confetti must not be in the first load").toEqual([]);

  // Positive control: the marker really identifies the confetti bundle, which loads when the first expense is saved.
  await cold.getByRole("button", { name: "Agregar gasto" }).first().click();
  const sheet = cold.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "¿Cuánto?" })).toBeFocused();
  await typeDigits(cold, "1000");
  await sheet.getByRole("button", { name: "Continuar" }).click();
  await sheet.getByRole("radio").first().click();
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(cold.getByText("¡Primer gasto registrado!")).toBeVisible();
  await expect
    .poll(async () => {
      await Promise.all(pending);
      return scripts.filter((s) => s.confetti).length;
    }, { message: "the confetti chunk should load on demand after the celebration" })
    .toBeGreaterThan(0);
  await context.close();
});
