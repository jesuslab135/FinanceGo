import { expect, test, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

type Probe = { started: number; pseudo: string[] };

/** Counts document.startViewTransition calls and records every ::view-transition* animation seen while navigating. */
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: Probe = { started: 0, pseudo: [] };
    (window as unknown as { __vt: Probe }).__vt = probe;
    const original = document.startViewTransition?.bind(document);
    if (original) {
      document.startViewTransition = ((...args: Parameters<Document["startViewTransition"]>) => {
        probe.started++;
        return original(...args);
      }) as Document["startViewTransition"];
    }
    const sample = () => {
      for (const a of document.documentElement.getAnimations({ subtree: true })) {
        const pe = (a.effect as KeyframeEffect | null)?.pseudoElement;
        if (pe && pe.startsWith("::view-transition") && a.playState === "running") probe.pseudo.push(`${pe}:${(a as CSSAnimation).animationName ?? ""}`);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

const probeOf = (page: Page) => page.evaluate(() => (window as unknown as { __vt: Probe }).__vt);

test("view transition: Inicio to Mes runs one, and none animate under reduced motion", async ({ page }, testInfo) => {
  const reduced = testInfo.project.name === "desktop-reduced";
  await installProbe(page);
  await register(page, uniqueEmail("vt"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(reduced);

  const before = await probeOf(page);
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Mes" }).click();
  await expect(page).toHaveURL(/\/es\/month\//, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(800);
  const after = await probeOf(page);

  const animations = after.pseudo.slice(before.pseudo.length);
  if (reduced) {
    expect(animations, "no ::view-transition animation may run under reduced motion").toEqual([]);
  } else {
    expect(after.started - before.started, "Inicio to Mes should start a view transition").toBeGreaterThanOrEqual(1);
    expect(animations.length, "the transition should animate its pseudo-elements").toBeGreaterThan(0);
    expect(animations.some((a) => a.includes("hero-amount")), "the hero amount should morph between the two pages").toBe(true);
  }
});
