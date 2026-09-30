import { expect, test } from "@playwright/test";
import { apiSession, register, typeDigits, uniqueEmail } from "./helpers";

test("quick add: keypad + physical keyboard, category, save, then Repetir from the row menu", async ({ page }) => {
  // One clock for the app and for the expected day header, so the test can't straddle midnight.
  const now = new Date();
  await page.clock.setFixedTime(now);
  await register(page, uniqueEmail("quickadd"));
  const api = await apiSession(page, now);
  await api.post("/income-sources", { name: "Salario", amount: 3000000, day_of_month: 1, start_month: api.month });
  await page.goto("/es/dashboard");

  await page.getByRole("button", { name: "Agregar gasto" }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "¿Cuánto?" })).toBeFocused();

  // Cents-first: 1,2,5,0 is $12.50; Backspace drops the last digit (12.5 -> $1.25) and a retype restores it.
  await typeDigits(page, "1250");
  await expect(sheet.getByRole("status", { name: "¿Cuánto?" })).toHaveText("$12.50");
  await page.keyboard.press("Backspace");
  await expect(sheet.getByRole("status", { name: "¿Cuánto?" })).toHaveText("$1.25");
  await typeDigits(page, "0");
  await expect(sheet.getByRole("status", { name: "¿Cuánto?" })).toHaveText("$12.50");
  await sheet.getByRole("button", { name: "Continuar" }).click();

  await sheet.getByRole("radio", { name: "Comida" }).click();
  await sheet.getByRole("button", { name: "Guardar" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Guardado")).toBeVisible();

  // The expense is listed under today's day header with the right amount.
  await page.goto("/es/expenses");
  const todayLabel = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Tijuana", weekday: "long", day: "numeric", month: "long" })
    .format(now)
    .replace(",", "");
  const day = page.locator("section", { has: page.getByRole("heading", { level: 3 }) }).first();
  await expect(day.getByRole("heading", { level: 3 })).toContainText(new RegExp(todayLabel, "i"));
  await expect(day.getByText("$12.50")).toHaveCount(2); // the row and the day total
  const menus = day.getByRole("button", { name: "Más" });
  await expect(menus).toHaveCount(1);

  // Repetir opens the flow on the details step, pre-filled; saving adds a second row.
  await menus.first().click();
  await page.getByRole("menuitem", { name: "Repetir" }).click();
  const repeat = page.getByRole("dialog");
  await expect(repeat.getByRole("heading", { name: "Detalles" })).toBeVisible();
  await repeat.getByRole("button", { name: "Guardar" }).click();
  await expect(repeat).toBeHidden();
  await expect(day.getByRole("button", { name: "Más" })).toHaveCount(2);
  await expect(day.getByText("$25.00")).toBeVisible(); // day total
});
