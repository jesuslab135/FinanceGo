import { expect, test, type Page } from "@playwright/test";
import { apiSession, register, typeDigits, uniqueEmail } from "./helpers";

// Every screenshot comes from the same frozen clock and the same seeded data, so pixels only move when the UI does.
// 2026-09-15 12:00 in Tijuana (UTC-7): "Buenas tardes", day 15 of September.
const FROZEN = new Date("2026-09-15T19:00:00Z");
const MONTH = "2026-09";

test.describe.configure({ mode: "serial" });

async function seededSession(page: Page) {
  await page.clock.setFixedTime(FROZEN);
  await register(page, uniqueEmail("visual"));
  const api = await apiSession(page);
  const expense = api.categories.filter((c) => c.kind === "expense");
  const byName = (n: string) => expense.find((c) => c.name === n)?.id ?? expense[0].id;
  await api.post("/payment-methods", { nickname: "Visa Oro", type: "credit", last4: "4242", color: "#2a78d6", opening_balance: 0, statement_day: 20, payment_due_day: 10, credit_limit: 5000000 });
  await api.post("/payment-methods", { nickname: "Nómina", type: "debit", last4: "9001", color: "#0a8a74" });
  await api.post("/income-sources", { name: "Salario", amount: 3000000, day_of_month: 1, start_month: MONTH });
  const spend = [["Vivienda", 1000000, "2026-09-05"], ["Comida", 35000, "2026-09-14"], ["Comida", 52000, "2026-09-12"], ["Transporte", 18000, "2026-09-13"], ["Entretenimiento", 94000, "2026-09-10"], ["Salud", 61000, "2026-09-08"], ["Comida", 41000, "2026-09-03"]] as const;
  for (const [cat, amount, spent_on] of spend) {
    await api.post("/expenses", { amount, category_id: byName(cat), description: cat, spent_on });
  }
  await api.put(`/category-budgets/${byName("Comida")}`, { monthly_limit: 300000 });
  return api;
}

/** Waits for network and data to settle, then lets chart/bar entrances finish (reduced motion makes them instant). */
async function settle(page: Page) {
  await expect(page.getByText("Cargando")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

/** Text that depends on the server's real date (statement cycles, due dates), which the frozen browser clock cannot pin. */
const serverDated = (page: Page) => [page.locator("[data-dynamic]"), page.getByText(/^Pago \$/), page.getByText(/Fecha límite/)];

const shot = { animations: "disabled" as const, caret: "hide" as const };

test("dashboard, light", async ({ page }) => {
  await seededSession(page);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/es/dashboard");
  await settle(page);
  await expect(page).toHaveScreenshot("dashboard-light.png", { ...shot, fullPage: true, mask: serverDated(page) });
});

test("dashboard, dark", async ({ page }) => {
  await seededSession(page);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/es/dashboard");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await settle(page);
  await expect(page).toHaveScreenshot("dashboard-dark.png", { ...shot, fullPage: true, mask: serverDated(page) });
});

test("cards page", async ({ page }) => {
  await seededSession(page);
  await page.goto("/es/cards");
  await expect(page.getByText("Visa Oro")).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("cards.png", { ...shot, fullPage: true, mask: serverDated(page) });
});

test("quick-add sheet at 375x812", async ({ page }) => {
  await seededSession(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/es/dashboard");
  await settle(page);
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name: "Agregar gasto" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "¿Cuánto?" })).toBeVisible();
  await typeDigits(page, "125050");
  await expect(sheet.getByRole("status", { name: "¿Cuánto?" })).toHaveText("$1,250.50");
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot("quick-add-sheet.png", { ...shot, mask: serverDated(page) });
});
