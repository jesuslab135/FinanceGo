import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toISODate } from "@/lib/dates";
import { renderWithProviders } from "@/test/render";
import { QuickAdd } from "@/components/expenses/quick-add";
import { QuickAddFlow } from "./quick-add-flow";

const media = vi.hoisted(() => ({ desktop: true }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => media.desktop }));

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ api: { GET: h.get } }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/lib/query/hooks", () => ({
  useCategories: () => ({
    data: [
      { id: 1, name: "Comida", kind: "expense", color: "#d9602f", icon: "utensils" },
      { id: 2, name: "Transporte", kind: "expense", color: "#0a8a74", icon: "car" },
    ],
  }),
  usePaymentMethods: () => ({ data: [{ id: 7, nickname: "BBVA", type: "credit", last4: "1234", active: true }] }),
  useCreateExpense: () => ({ mutateAsync: h.mutateAsync }),
  useDeleteExpense: () => ({ mutate: h.del }),
  useMe: () => ({ data: { currency: "MXN" } }),
}));

describe("QuickAddFlow", () => {
  beforeEach(() => {
    localStorage.clear();
    h.mutateAsync.mockReset().mockResolvedValue({ id: 50 });
    h.get.mockReset().mockResolvedValue({ data: { items: [] } });
  });

  it("types an amount, picks category and card, and saves integer cents", async () => {
    const onDone = vi.fn();
    renderWithProviders(<QuickAddFlow onDone={onDone} />);
    await userEvent.keyboard("12345");
    expect(screen.getByRole("status")).toHaveTextContent("$123.45");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(await screen.findByRole("radio", { name: "Comida" }));
    await userEvent.click(await screen.findByRole("radio", { name: /BBVA/ }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(h.mutateAsync).toHaveBeenCalledWith({ amount: 12345, category_id: 1, payment_method_id: 7, description: "", spent_on: toISODate(new Date()) }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("keeps Continuar disabled at zero, and Enter continues once there is an amount", async () => {
    renderWithProviders(<QuickAddFlow onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    await userEvent.keyboard("5{Backspace}7{Enter}");
    expect(await screen.findByRole("radio", { name: "Comida" })).toBeInTheDocument();
  });

  it("opens on step 3 with a prefill and saves its amount", async () => {
    renderWithProviders(<QuickAddFlow prefill={{ amount: 500, category_id: 2 }} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, category_id: 2 })));
  });

  it("suggests the category of a matching past expense", async () => {
    h.get.mockResolvedValue({ data: { items: [{ id: 9, category_id: 1 }] } });
    renderWithProviders(<QuickAddFlow prefill={{ amount: 500, category_id: 2 }} onDone={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Descripción"), "tacos");
    await userEvent.click(await screen.findByRole("button", { name: "¿Categoría: Comida?" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ category_id: 1, description: "tacos" })));
  });

  it("shows a back arrow on details even with a prefill, and it leads to the category step", async () => {
    renderWithProviders(<QuickAddFlow prefill={{ amount: 500, category_id: 2 }} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect(await screen.findByRole("radiogroup", { name: "Categoría" })).toBeInTheDocument();
  });

  it("drops a remembered card that no longer exists", async () => {
    localStorage.setItem("fin:recents:1", JSON.stringify({ categories: [1], cardByCategory: { "1": 99 }, lastCard: 99 }));
    renderWithProviders(<QuickAddFlow onDone={vi.fn()} />);
    await userEvent.keyboard("5{Enter}");
    await userEvent.click(await screen.findByRole("radio", { name: "Comida" }));
    await userEvent.click(await screen.findByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ payment_method_id: null })));
  });

  it("ignores malformed stored recents", async () => {
    localStorage.setItem("fin:recents:1", JSON.stringify({ categories: "x" }));
    renderWithProviders(<QuickAddFlow onDone={vi.fn()} />);
    await userEvent.keyboard("5{Enter}");
    expect(await screen.findByRole("radio", { name: "Comida" })).toBeInTheDocument();
  });

  for (const desktop of [true, false]) {
    it(`inside the real dialog (${desktop ? "dialog" : "drawer"}): focus starts on the heading, Enter continues, and the next heading gets focus`, async () => {
      media.desktop = desktop;
      renderWithProviders(<QuickAdd variant="none" open onOpenChange={vi.fn()} />);
      const heading = await screen.findByRole("heading", { name: "¿Cuánto?" });
      await waitFor(() => expect(heading).toHaveFocus());
      await userEvent.keyboard("5{Enter}");
      const next = await screen.findByRole("heading", { name: "¿En qué?" });
      expect(screen.queryByRole("heading", { name: "¿Cuánto?" })).not.toBeInTheDocument();
      await waitFor(() => expect(next).toHaveFocus());
    });
  }

  it("Enter on a focused keypad key continues instead of pressing the key", async () => {
    renderWithProviders(<QuickAddFlow onDone={vi.fn()} />);
    await userEvent.keyboard("5");
    screen.getByRole("button", { name: "1" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("radiogroup", { name: "Categoría" })).toBeInTheDocument();
  });
});
