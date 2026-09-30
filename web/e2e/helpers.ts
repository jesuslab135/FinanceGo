import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** Fills the register form and submits; a brand-new account lands on /welcome (onboarding). */
export async function registerOnly(page: Page, email: string) {
  await page.goto("/es/register");
  await page.getByLabel("Nombre").fill("E2E");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("password123");
  await page.getByLabel("Zona horaria").fill("America/Tijuana");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
}

/** Clicks "Saltar" on /welcome and waits for the dashboard. */
export async function skipOnboarding(page: Page) {
  // A new account first renders the dashboard briefly before the gate redirects it, so allow for the hop under load.
  await page.getByRole("button", { name: "Saltar" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/es\/dashboard/);
}

/** Registers a new account and skips onboarding so the spec starts on the dashboard. */
export async function register(page: Page, email: string) {
  await registerOnly(page, email);
  // A brand-new account is sent to onboarding after a brief dashboard render; skipOnboarding waits for that hop.
  await skipOnboarding(page);
}

/** Picks an option from a shadcn (Radix) Select identified by its label. */
export async function pick(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option }).click();
}

/** Types an amount on the physical keyboard; the keypad is cents-first ("5","0","0","0","0" is $500.00). */
export async function typeDigits(page: Page, digits: string) {
  for (const d of digits) await page.keyboard.press(d);
}

/** Authenticated API access for the page's signed-in session, plus today's date in the test timezone. */
export async function apiSession(page: Page) {
  const refreshed = await page.request.post("/api/v1/auth/refresh");
  expect(refreshed.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await refreshed.json()).access_token}` };
  const send = async (method: "post" | "put", path: string, data: object) => {
    const res = await page.request[method](`/api/v1${path}`, { headers, data });
    expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    return (body.data ?? body) as { id: number };
  };
  const cats = await (await page.request.get("/api/v1/categories", { headers })).json();
  const list: { id: number; kind: string; name: string }[] = cats.data ?? cats.items ?? cats;
  const today = new Date().toLocaleDateString("sv", { timeZone: "America/Tijuana" });
  return {
    post: (path: string, data: object) => send("post", path, data),
    put: (path: string, data: object) => send("put", path, data),
    categories: list,
    expenseCat: list.find((c) => c.kind === "expense")!.id,
    today,
    month: today.slice(0, 7),
  };
}
