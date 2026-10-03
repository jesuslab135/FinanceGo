import { expect, test } from "@playwright/test";
import { registerOnly, skipOnboarding, typeDigits, uniqueEmail } from "./helpers";

test("onboarding: income on the keypad, a fixed payment, then the dashboard shows the real Available", async ({ page }) => {
  await registerOnly(page, uniqueEmail("welcome"));
  await expect(page).toHaveURL(/\/es\/welcome/);

  // Step 1a: how often. Quincenal is preselected; this user is paid monthly on the 1st.
  await expect(page.getByRole("heading", { level: 1, name: "¿Cada cuándo te pagan?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quincenal" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mensual" }).click();
  const payday = page.getByRole("group", { name: "Día de pago" });
  await payday.getByRole("button", { name: "1", exact: true }).click();
  await expect(payday.getByRole("button", { name: "1", exact: true })).toHaveAttribute("aria-pressed", "true");
  // The schedule screen fits a phone without scrolling: the action is in view.
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Continuar" })).toBeInViewport();
  await page.setViewportSize(desktop);
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 1b: how much. 3,0,0,0,0,0,0 is $30,000.00 (the keypad is cents-first).
  await expect(page.getByRole("heading", { level: 1, name: "¿Cuánto recibes al mes?" })).toBeVisible();
  await typeDigits(page, "3000000");
  await expect(page.getByRole("status", { name: "¿Cuánto?" })).toHaveText("$30,000.00");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 2: rent, $10,000 on day 1.
  await expect(page.getByRole("heading", { level: 1, name: "Tus pagos fijos" })).toBeVisible();
  await page.getByRole("button", { name: "Renta" }).click();
  await page.getByLabel("Renta: Monto").fill("10000");
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 3: cards are optional.
  await expect(page.getByRole("heading", { level: 1, name: /Tus tarjetas/ })).toBeVisible();
  await page.getByRole("button", { name: "Terminar" }).click();

  await expect(page).toHaveURL(/\/es\/dashboard/);
  await expect(page.getByText("¡Todo listo! Estos son tus números")).toBeVisible();
  // The count-up runs for 0.6 s; the amount's aria-label always carries the final value, so poll it.
  const hero = page.locator("[data-tone='brand']");
  await expect(hero.getByLabel("$20,000.00")).toBeVisible();
  // A user who finished onboarding is never sent back.
  await page.goto("/es/welcome");
  await expect(page).toHaveURL(/\/es\/dashboard/);
});

test("onboarding: Saltar never traps the user, and the dashboard offers to finish setup", async ({ page }) => {
  await registerOnly(page, uniqueEmail("skip"));
  await expect(page).toHaveURL(/\/es\/welcome/);
  await skipOnboarding(page);
  await expect(page.getByText("Completa tu configuración para ver tus números reales")).toBeVisible();

  // Reload and deep links stay out of /welcome. The gate redirects only once the income query has answered, so wait
  // for page-specific content and an idle network before asserting we were not sent back.
  await page.reload();
  await expect(page.getByText("Completa tu configuración para ver tus números reales")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/welcome/);
  await expect(page).toHaveURL(/\/es\/dashboard/);

  await page.goto("/es/expenses");
  await expect(page.getByRole("heading", { level: 1, name: "Gastos" })).toBeVisible();
  await expect(page.getByText("No hay gastos en este rango")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/welcome/);
  await expect(page).toHaveURL(/\/es\/expenses/);
  // Opening /welcome by hand is allowed, and Saltar still leads out of it.
  await page.goto("/es/welcome");
  await skipOnboarding(page);
});
