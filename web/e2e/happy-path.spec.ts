import { expect, test } from "@playwright/test";
import { pick, register, uniqueEmail } from "./helpers";

test("register → income + card fixed payment → card expense → Available → card payment → English", async ({ page }) => {
  await register(page, uniqueEmail("happy"));
  const month = new Date().toLocaleDateString("sv", { timeZone: "America/Tijuana" }).slice(0, 7);

  // Credit card
  await page.goto("/es/cards");
  await page.getByRole("button", { name: "Nuevo método de pago" }).click();
  await page.getByLabel("Alias").fill("Visa Oro");
  await page.getByLabel("Tipo").selectOption("credit");
  await page.getByLabel("Últimos 4 dígitos").fill("4242");
  await page.getByLabel("Día de corte").fill("15");
  await page.getByLabel("Día límite de pago").fill("5");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Visa Oro")).toBeVisible();

  // Income and a fixed payment charged to the card
  await page.goto("/es/recurring");
  await page.getByRole("button", { name: "Nueva fuente de ingreso" }).click();
  await page.getByLabel("Nombre").fill("Salario");
  await page.getByLabel("Monto").fill("30,000");
  await page.getByLabel("Día del mes").fill("1");
  await page.getByLabel("Mes de inicio").fill(month);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator("p", { hasText: "Salario" }).first()).toBeVisible();

  await page.getByRole("tab", { name: "Pagos fijos" }).click();
  await page.getByRole("button", { name: "Nuevo pago fijo" }).click();
  await page.getByLabel("Nombre").fill("Renta");
  await page.getByLabel("Monto").fill("10000");
  await page.getByLabel("Día del mes").fill("5");
  await pick(page, "Categoría", "Vivienda");
  await pick(page, "Método de pago", /Visa Oro/);
  await page.getByLabel("Mes de inicio").fill(month);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator("p", { hasText: "Renta" }).first()).toBeVisible();

  // Card expense via quick add
  await page.getByRole("button", { name: "Agregar gasto" }).first().click();
  await page.getByLabel("Monto").fill("500");
  await pick(page, "Categoría", "Comida");
  await pick(page, "Método de pago", /Visa Oro/);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Available = 30,000 − 10,000 − 500
  await page.goto("/es/dashboard");
  await expect(page.locator("[data-kpi='available']")).toContainText("$19,500.00");

  // Card: current balance 500, then pay it off
  await page.goto("/es/cards");
  await page.getByRole("link", { name: /Visa Oro/ }).click();
  await expect(page.getByText("Saldo actual").locator("..")).toContainText("$500.00");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Monto").fill("500");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Saldo actual").locator("..")).toContainText("$0.00");

  // Switch to English through the user menu
  await page.goto("/es/dashboard");
  await page.getByRole("button", { name: "E2E" }).click();
  await page.getByRole("menuitem", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("cards: a card with records can't be deleted, an unused one can", async ({ page }) => {
  await register(page, uniqueEmail("delete"));
  const today = new Date().toLocaleDateString("sv", { timeZone: "America/Tijuana" });
  const refreshed = await page.request.post("/api/v1/auth/refresh");
  const headers = { Authorization: `Bearer ${(await refreshed.json()).access_token}` };
  const post = async (path: string, data: object) => {
    const res = await page.request.post(`/api/v1${path}`, { headers, data });
    expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    return (body.data ?? body) as { id: number };
  };
  const card = { type: "credit", color: "#2a78d6", opening_balance: 0, statement_day: 15, payment_due_day: 5 };
  const used = await post("/payment-methods", { ...card, nickname: "Usada" });
  const unused = await post("/payment-methods", { ...card, nickname: "Sin uso" });
  const cats: { id: number; kind: string }[] = await (await page.request.get("/api/v1/categories", { headers })).json().then((b) => b.data ?? b);
  await post("/expenses", { amount: 1000, category_id: cats.find((c) => c.kind === "expense")!.id, payment_method_id: used.id, spent_on: today });

  await page.goto(`/es/cards/${used.id}`);
  await page.getByRole("button", { name: "Eliminar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByText("Desactívalo en su lugar")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/es/cards/${used.id}$`));

  await page.goto(`/es/cards/${unused.id}`);
  await page.getByRole("button", { name: "Eliminar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
  await expect(page).toHaveURL(/\/es\/cards$/);
  await expect(page.getByText("Usada")).toBeVisible();
  await expect(page.getByText("Sin uso")).toHaveCount(0);
});
