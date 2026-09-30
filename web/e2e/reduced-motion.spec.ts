import { expect, test } from "@playwright/test";
import { apiSession, register, typeDigits, uniqueEmail } from "./helpers";

test("reduced motion: the dashboard shows the final Available at once, with no confetti or running animations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-reduced", "only meaningful with prefers-reduced-motion: reduce");
  await register(page, uniqueEmail("reduced"));
  const api = await apiSession(page);
  await api.post("/income-sources", { name: "Salario", amount: 3000000, day_of_month: 1, start_month: api.month });

  // Record every text the hero amount ever renders, from before the app boots.
  await page.addInitScript(() => {
    const seen: string[] = [];
    const w = window as unknown as { __hero: string[]; __canvas: number };
    w.__hero = seen;
    w.__canvas = 0;
    new MutationObserver(() => {
      const el = document.querySelector("[data-tone] [aria-label]");
      const text = el?.textContent?.trim();
      if (text && seen[seen.length - 1] !== text) seen.push(text);
      w.__canvas = Math.max(w.__canvas, document.querySelectorAll("canvas").length);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto("/es/dashboard");
  await expect(page.getByLabel("$30,000.00")).toBeVisible();
  await page.waitForTimeout(1200); // longer than the entrance stagger

  // Change Available while the dashboard is open (the count-up only runs on a change): log a $5,000 expense.
  await page.getByRole("button", { name: "Agregar gasto" }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "¿Cuánto?" })).toBeFocused();
  await typeDigits(page, "500000");
  await sheet.getByRole("button", { name: "Continuar" }).click();
  await sheet.getByRole("radio").first().click();
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByLabel("$25,000.00")).toBeVisible();
  await page.waitForTimeout(1000); // longer than the 0.6 s count-up

  const { hero, canvases } = await page.evaluate(() => {
    const w = window as unknown as { __hero: string[]; __canvas: number };
    return { hero: w.__hero, canvases: w.__canvas };
  });
  expect(hero, "the hero amount must never show an intermediate count-up value").toEqual(["$30,000.00", "$25,000.00"]);
  expect(canvases, "no confetti canvas").toBe(0);

  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => a instanceof CSSAnimation && a.playState === "running").map((a) => (a as CSSAnimation).animationName),
  );
  expect(running, "no CSS animation (shimmer, pulse) may be running").toEqual([]);
});
