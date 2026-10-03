import { expect, test, type Page } from "@playwright/test";
import { apiSession, pageHeader, register, settled, typeDigits, uniqueEmail } from "./helpers";

const LONG_CARD = "Tarjeta de crédito departamental con nombre larguísimo";
const LONG_CATEGORY = "Entretenimiento, suscripciones y salidas";
const LONG_NOTE = "Pago parcial registrado desde la aplicación del banco después de revisar el estado de cuenta completo";

/** Seeds cards, income, fixed payment, expenses, a budget, a card payment and an MSI plan through the API. */
async function seed(page: Page) {
  const { post, put, expenseCat, today, month } = await apiSession(page);
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
  await put(`/category-budgets/${longCat.id}`, { monthly_limit: 150000000 });
  await post("/expenses", { amount: 123456789, category_id: longCat.id, description: LONG_NOTE, payment_method_id: longCard.id, spent_on: today });
  await post("/card-payments", { payment_method_id: longCard.id, amount: 98765432, paid_on: today, note: LONG_NOTE });
  await post("/installment-plans", {
    payment_method_id: longCard.id, description: `Refrigerador ${LONG_NOTE}`.slice(0, 120), total_amount: 4800000,
    installments: 12, purchased_on: today, category_id: expenseCat,
  });
  return { month, longCardId: longCard.id };
}

/** Walks the quick-add sheet step by step; it must never overflow sideways and its primary action stays in view. */
async function expectQuickAddFits(page: Page) {
  const width = page.viewportSize()!.width;
  const overflow = async (label: string) => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth) - width;
    expect.soft(over, `quick-add ${label} overflows by ${over}px`).toBeLessThanOrEqual(0);
    const dialog = page.getByRole("dialog");
    const inner = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect.soft(inner, `quick-add ${label}: sheet scrolls sideways by ${inner}px`).toBeLessThanOrEqual(0);
  };
  await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("button", { name: "Agregar gasto" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "¿Cuánto?" })).toBeVisible();
  await typeDigits(page, "1250");
  await overflow("keypad");
  await expect(sheet.getByRole("button", { name: "Continuar" })).toBeInViewport({ ratio: 1 });
  await sheet.getByRole("button", { name: "Continuar" }).click();
  await expect(sheet.getByRole("radiogroup", { name: "Categoría" })).toBeVisible();
  await overflow("categories");
  await sheet.getByRole("radio").first().click();
  const save = sheet.getByRole("button", { name: "Guardar" });
  await expect(save).toBeVisible();
  await overflow("details");
  // Sticky footer: Guardar is on screen without scrolling the sheet.
  await expect(save).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
}

test("mobile: bottom navigation, quick add sheet, no horizontal scroll", async ({ page }) => {
  await register(page, uniqueEmail("mobile"));
  const { month, longCardId } = await seed(page);
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link", { name: "Gastos" })).toBeVisible();
  await nav.getByRole("button", { name: "Agregar gasto" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByTestId("drawer-handle")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expectQuickAddFits(page);
  for (const path of [
    "/es/dashboard", "/es/expenses", `/es/month/${month}`, "/es/cards", `/es/cards/${longCardId}`,
    "/es/recurring", "/es/categories", "/es/settings", "/es/welcome",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Cargando")).toHaveCount(0);
    // Mobile emulation widens the layout viewport to fit wide content, so compare against the device width.
    const overflow = (await page.evaluate(() => document.documentElement.scrollWidth)) - page.viewportSize()!.width;
    expect.soft(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test("mobile: a tall form in the bottom sheet can reach and click its submit button", async ({ page }) => {
  await register(page, uniqueEmail("mobile-sheet"));
  await page.goto("/es/cards");
  // The empty state repeats the header's call to action, so scope to the page header.
  await pageHeader(page).getByRole("button", { name: "Nuevo método de pago" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo método de pago" });
  await expect(dialog.getByTestId("drawer-handle")).toBeVisible();
  await dialog.getByLabel("Alias").fill("Tarjeta móvil");
  const save = dialog.getByRole("button", { name: "Guardar" });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await save.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Tarjeta móvil")).toBeVisible();
});

test.describe("short phone (360x640)", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("the quick-add sheet keeps Continuar and Guardar visible", async ({ page }) => {
    await register(page, uniqueEmail("short-qa"));
    await expectQuickAddFits(page);
  });

  test("the tall card form in the bottom sheet scrolls to its submit button, which can be clicked", async ({ page }) => {
    await register(page, uniqueEmail("short-card"));
    await page.goto("/es/cards");
    // The empty state repeats the header's call to action, so scope to the page header.
    await pageHeader(page).getByRole("button", { name: "Nuevo método de pago" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo método de pago" });
    await expect(dialog.getByTestId("drawer-handle")).toBeVisible();
    await expect(dialog.getByLabel("Alias")).toBeVisible();
    // A credit card adds the statement, due-day and limit fields, which makes the form taller than a 640px sheet.
    await dialog.getByLabel("Tipo").selectOption("credit");
    await expect(dialog.getByLabel("Día de corte")).toBeAttached();
    await dialog.evaluate((el) => { for (const n of el.querySelectorAll<HTMLElement>("*")) n.scrollTop = 0; });
    await settled(dialog); // the sheet has finished sliding in
    const save = dialog.getByRole("button", { name: "Guardar" });
    // At 640px the form is taller than the sheet: the button starts below the fold and only scrolling reaches it.
    await expect(save).not.toBeInViewport({ ratio: 1 });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport({ ratio: 1 });
    await dialog.getByLabel("Alias").fill("Tarjeta corta");
    await dialog.getByLabel("Día de corte").fill("15");
    await dialog.getByLabel("Día límite de pago").fill("5");
    await save.scrollIntoViewIfNeeded();
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Tarjeta corta")).toBeVisible();
  });
});
