import { expect, test } from "@playwright/test";
import { apiSession, register, uniqueEmail } from "./helpers";

// A new user with one $20,000 income and nothing else: Available starts at $20,000 (same hero check as happy-path.spec.ts).
const hero = (page: import("@playwright/test").Page) => page.locator("[data-tone='brand']");

test("savings: a goal's plan and deposits lower Available; a value update shows the gain", async ({ page }) => {
  await register(page, uniqueEmail("savings"));
  const api = await apiSession(page);
  await api.post("/income-sources", { name: "Sueldo", amount: 2_000_000, day_of_month: 1, start_month: api.month });

  await page.goto("/es/dashboard");
  await expect(hero(page)).toContainText("$20,000");

  // Account + goal through the UI.
  await page.goto("/es/savings");
  await page.getByRole("button", { name: "Agregar cuenta" }).first().click();
  await page.getByLabel("Nombre").fill("Cajita Japón");
  await page.getByLabel("Institución").fill("Nu");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Cajita Japón")).toBeVisible();

  await page.getByRole("button", { name: "Nueva meta" }).click();
  await page.getByLabel("Nombre").fill("Japón");
  await page.getByLabel("¿Cuánto quieres juntar?").fill("40000");
  await page.getByLabel(/Apartar al mes/).fill("2000");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Japón", { exact: true })).toBeVisible();

  await page.goto("/es/dashboard");
  await expect(hero(page)).toContainText("$18,000"); // the $2,000 plan is set aside

  // Deposit $2,500 tagged to the goal: Saved = max(2000, 2500).
  await page.goto("/es/savings");
  await page.getByRole("button", { name: "Abonar" }).click();
  await page.getByLabel("Monto").fill("2500");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("$2,500.00 de $40,000.00")).toBeVisible();

  await page.goto("/es/dashboard");
  await expect(hero(page)).toContainText("$17,500"); // Saved = max($2,000 planned, $2,500 deposited)

  // Update the value: the account shows a gain.
  await page.goto("/es/savings");
  await page.getByRole("link", { name: "Cajita Japón" }).click();
  await page.getByRole("button", { name: "Actualizar valor" }).click();
  await page.getByLabel("Valor actual").fill("2600");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("$100.00")).toBeVisible(); // gain = 2600 − 2500
});
