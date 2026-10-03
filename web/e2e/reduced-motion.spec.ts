import { expect, test, type Page } from "@playwright/test";
import { apiSession, register, typeDigits, uniqueEmail } from "./helpers";

type Hero = { hero: string[]; canvases: number };

/**
 * Signs up with $30,000 income, records every text the hero amount renders (from before the app boots), then logs a
 * $5,000 expense through the quick add so Available changes while the dashboard is open (the count-up only runs on a change).
 */
async function changeAvailable(page: Page): Promise<Hero> {
  await register(page, uniqueEmail("hero"));
  const api = await apiSession(page);
  await api.post("/income-sources", { name: "Salario", amount: 3000000, day_of_month: 1, start_month: api.month });

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

  await page.getByRole("button", { name: "Agregar gasto" }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "¿Cuánto?" })).toBeFocused();
  await typeDigits(page, "500000");
  await sheet.getByRole("button", { name: "Continuar" }).click();
  await sheet.getByRole("radio").first().click();
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByLabel("$25,000.00")).toBeVisible();
  await page.waitForTimeout(1000); // longer than the 0.6 s count-up

  return page.evaluate(() => {
    const w = window as unknown as { __hero: string[]; __canvas: number };
    return { hero: w.__hero, canvases: w.__canvas };
  });
}

test("reduced motion: the dashboard shows the final Available at once, with no confetti or running animations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-reduced", "only meaningful with prefers-reduced-motion: reduce");
  const { hero, canvases } = await changeAvailable(page);
  expect(hero, "the hero amount must never show an intermediate count-up value").toEqual(["$30,000.00", "$25,000.00"]);
  expect(canvases, "no confetti canvas").toBe(0);

  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => a instanceof CSSAnimation && a.playState === "running").map((a) => (a as CSSAnimation).animationName),
  );
  expect(running, "no CSS animation (shimmer, pulse) may be running").toEqual([]);
});

// Negative control: the same observer and selector, under normal motion, must see the count-up. If this ever shows
// only two values, the reduced-motion test above would pass vacuously.
test("normal motion (control): the hero counts up through intermediate values", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the control runs with normal motion");
  const { hero } = await changeAvailable(page);
  expect(hero.length, `hero values: ${hero.join(", ")}`).toBeGreaterThan(2);
  expect(hero[0]).toBe("$30,000.00");
  expect(hero[hero.length - 1]).toBe("$25,000.00");
});
