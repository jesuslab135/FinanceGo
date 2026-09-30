import { expect, test, type Page } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

const LONG_CARD = "Tarjeta de crédito departamental con nombre larguísimo";
const LONG_CATEGORY = "Entretenimiento, suscripciones y salidas";
const LONG_NOTE = "Pago parcial registrado desde la aplicación del banco después de revisar el estado de cuenta completo";

/** Seeds cards, income, fixed payment, expenses, a budget, a card payment and an MSI plan through the API. */
async function seed(page: Page) {
  const refreshed = await page.request.post("/api/v1/auth/refresh");
  expect(refreshed.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await refreshed.json()).access_token}` };
  const send = async (method: "post" | "put", path: string, data: object) => {
    const res = await page.request[method](`/api/v1${path}`, { headers, data });
    expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    return body.data ?? body;
  };
  const post = (path: string, data: object) => send("post", path, data);
  const cats = await (await page.request.get("/api/v1/categories", { headers })).json();
  const list: { id: number; kind: string }[] = cats.data ?? cats.items ?? cats;
  const expenseCat = list.find((c) => c.kind === "expense")!.id;
  const today = new Date().toLocaleDateString("sv", { timeZone: "America/Tijuana" });
  const month = today.slice(0, 7);
  const card = await post("/payment-methods", {
    nickname: "Visa Oro", type: "credit", last4: "4242", color: "#2a78d6", opening_balance: 0,
    statement_day: 15, payment_due_day: 5, credit_limit: 5000000,
  });
  const longCard = await post("/payment-methods", {
    nickname: LONG_CARD, bank: "Banco Nacional de Crédito Departamental", type: "credit", last4: "1881", color: "#c2410c",
    opening_balance: 123456789, statement_day: 20, payment_due_day: 10, credit_limit: 9999999999,
  });
  await post("/income-sources", { name: "Salario", amount: 3000000, day_of_month: 1, start_month: month });
  await post("/fixed-payments", { name: "Renta", amount: 1000000, day_of_month: 5, category_id: expenseCat, payment_method_id: card.id, start_month: month });
  await post("/expenses", { amount: 50000, category_id: expenseCat, description: "Comida", payment_method_id: card.id, spent_on: today });
  const longCat = await post("/categories", { name: LONG_CATEGORY, kind: "expense", color: "#8b5cf6", icon: "tag" });
  await send("put", `/category-budgets/${longCat.id}`, { monthly_limit: 150000000 });
  await post("/expenses", { amount: 123456789, category_id: longCat.id, description: LONG_NOTE, payment_method_id: longCard.id, spent_on: today });
  await post("/card-payments", { payment_method_id: longCard.id, amount: 98765432, paid_on: today, note: LONG_NOTE });
  await post("/installment-plans", {
    payment_method_id: longCard.id, description: `Refrigerador ${LONG_NOTE}`.slice(0, 120), total_amount: 4800000,
    installments: 12, purchased_on: today, category_id: expenseCat,
  });
  return { month, longCardId: longCard.id as number };
}

test("mobile: bottom navigation, quick add sheet, no horizontal scroll", async ({ page }) => {
  await register(page, uniqueEmail("mobile"));
  const { month, longCardId } = await seed(page);
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link", { name: "Gastos" })).toBeVisible();
  await nav.getByRole("button", { name: "Agregar gasto" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Cerrar" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  for (const path of [
    "/es/dashboard", "/es/expenses", `/es/month/${month}`, "/es/cards", `/es/cards/${longCardId}`,
    "/es/recurring", "/es/categories", "/es/settings",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Cargando")).toHaveCount(0);
    // Mobile emulation widens the layout viewport to fit wide content, so compare against the device width.
    const overflow = (await page.evaluate(() => document.documentElement.scrollWidth)) - page.viewportSize()!.width;
    expect.soft(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});
