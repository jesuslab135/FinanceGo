import { expect, test, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

/** Seeds one card, income, fixed payment and expense through the API so pages render real rows. */
async function seed(page: Page) {
  const refreshed = await page.request.post("/api/v1/auth/refresh");
  expect(refreshed.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await refreshed.json()).access_token}` };
  const post = async (path: string, data: object) => {
    const res = await page.request.post(`/api/v1${path}`, { headers, data });
    expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
    return res.json();
  };
  const cats = await (await page.request.get("/api/v1/categories", { headers })).json();
  const list: { id: number; kind: string }[] = cats.data ?? cats.items ?? cats;
  const expenseCat = list.find((c) => c.kind === "expense")!.id;
  const today = new Date().toLocaleDateString("sv", { timeZone: "America/Tijuana" });
  const month = today.slice(0, 7);
  const card = await post("/payment-methods", {
    nickname: "Visa Oro", type: "credit", last4: "4242", color: "#2a78d6", opening_balance: 0,
    statement_day: 15, payment_due_day: 5, credit_limit: 5000000,
  });
  const cardId = (card.data ?? card).id;
  await post("/income-sources", { name: "Salario", amount: 3000000, day_of_month: 1, start_month: month });
  await post("/fixed-payments", { name: "Renta", amount: 1000000, day_of_month: 5, category_id: expenseCat, payment_method_id: cardId, start_month: month });
  await post("/expenses", { amount: 50000, category_id: expenseCat, description: "Comida", payment_method_id: cardId, spent_on: today });
}

test("mobile: bottom navigation, quick add sheet, no horizontal scroll", async ({ page }) => {
  await register(page, uniqueEmail("mobile"));
  await seed(page);
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link", { name: "Gastos" })).toBeVisible();
  await nav.getByRole("button", { name: "Agregar gasto" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  for (const path of ["/es/dashboard", "/es/expenses", "/es/cards", "/es/recurring", "/es/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Cargando")).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});
