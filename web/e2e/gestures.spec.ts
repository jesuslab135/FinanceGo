import { expect, test, type Page } from "@playwright/test";
import { apiSession, register, settled, uniqueEmail } from "./helpers";

/** A real touch swipe (CDP touch events) from the centre of `box` horizontally by `dx` pixels. */
async function swipe(page: Page, box: { x: number; y: number; width: number; height: number }, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const startX = box.x + box.width / 2 + (dx < 0 ? 60 : -60);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX + (dx * i) / steps, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  // Chromium swallows the first tap that follows a synthetic CDP drag (it is consumed stopping the fling), so
  // spend it on a neutral target; the next tap is delivered as a normal click.
  await page.getByRole("heading", { level: 1 }).tap();
}

async function seedExpense(page: Page, description: string) {
  const api = await apiSession(page);
  await api.post("/expenses", { amount: 4200, category_id: api.expenseCat, description, spent_on: api.today });
}

const rowOf = (page: Page, description: string) => page.getByText(description, { exact: true });
/** Resolves when the API has answered the DELETE for an expense (the undo window closed and the delete committed). */
const deleteCommitted = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === "DELETE" && /\/api\/v1\/expenses\/\d+$/.test(r.url()), { timeout: 15_000 });
const revealedDelete = (page: Page) => page.locator("button", { hasText: "Eliminar" }).first();

test("gestures: swipe a row left, Eliminar, Deshacer brings it back; without undo the delete commits", async ({ page }) => {
  await register(page, uniqueEmail("gestures"));
  await seedExpense(page, "Tacos gesto");
  await page.goto("/es/expenses");
  await expect(rowOf(page, "Tacos gesto")).toBeVisible();

  // Swipe left, tap the revealed Eliminar: the row disappears and an undo toast appears.
  await swipe(page, (await rowOf(page, "Tacos gesto").boundingBox())!, -160);
  await expect(revealedDelete(page)).toBeInViewport();
  await revealedDelete(page).tap();
  await expect(rowOf(page, "Tacos gesto")).toHaveCount(0);
  const undo = page.getByRole("button", { name: "Deshacer" });
  await expect(undo).toBeVisible();
  await undo.tap();
  await expect(rowOf(page, "Tacos gesto")).toBeVisible();
  await settled(rowOf(page, "Tacos gesto")); // the row has snapped back before it is swiped again

  // Same again without undo: once the undo window closes the DELETE reaches the API, so a reload keeps it gone.
  await swipe(page, (await rowOf(page, "Tacos gesto").boundingBox())!, -160);
  const committed = deleteCommitted(page);
  await revealedDelete(page).tap();
  await expect(rowOf(page, "Tacos gesto")).toHaveCount(0);
  expect((await committed).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Cargando")).toHaveCount(0);
  await expect(rowOf(page, "Tacos gesto")).toHaveCount(0);
});

test("gestures: the menu path (Más → Eliminar) has the same undo and commit behaviour", async ({ page }) => {
  await register(page, uniqueEmail("gestures-menu"));
  await seedExpense(page, "Cena menú");
  await page.goto("/es/expenses");
  await expect(rowOf(page, "Cena menú")).toBeVisible();

  const row = page.locator("li, div", { has: rowOf(page, "Cena menú") }).filter({ has: page.getByRole("button", { name: "Más" }) }).last();
  await row.getByRole("button", { name: "Más" }).tap();
  await page.getByRole("menuitem", { name: "Eliminar" }).tap();
  await expect(rowOf(page, "Cena menú")).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer" }).tap();
  await expect(rowOf(page, "Cena menú")).toBeVisible();
  await settled(rowOf(page, "Cena menú"));

  await row.getByRole("button", { name: "Más" }).tap();
  const committed = deleteCommitted(page);
  await page.getByRole("menuitem", { name: "Eliminar" }).tap();
  await expect(rowOf(page, "Cena menú")).toHaveCount(0);
  expect((await committed).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText("Cargando")).toHaveCount(0);
  await expect(rowOf(page, "Cena menú")).toHaveCount(0);
});
