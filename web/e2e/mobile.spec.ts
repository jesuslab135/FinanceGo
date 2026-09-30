import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

test("mobile: bottom navigation, quick add sheet, no horizontal scroll", async ({ page }) => {
  await register(page, uniqueEmail("mobile"));
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link", { name: "Gastos" })).toBeVisible();
  await nav.getByRole("button", { name: "Agregar gasto" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  for (const path of ["/es/dashboard", "/es/expenses", "/es/cards", "/es/recurring", "/es/settings"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});
