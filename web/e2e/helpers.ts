import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

export async function register(page: Page, email: string) {
  await page.goto("/es/register");
  await page.getByLabel("Nombre").fill("E2E");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("password123");
  await page.getByLabel("Zona horaria").fill("America/Tijuana");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  // A brand-new account is sent to onboarding (after a brief dashboard render); skip it so specs start on the dashboard.
  await page.getByRole("button", { name: "Saltar" }).click();
  await expect(page).toHaveURL(/\/es\/dashboard/);
}

/** Picks an option from a shadcn (Radix) Select identified by its label. */
export async function pick(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option }).click();
}
