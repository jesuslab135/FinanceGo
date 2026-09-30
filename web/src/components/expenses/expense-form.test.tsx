import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { ExpenseForm } from "./expense-form";

vi.mock("@/lib/query/hooks", () => ({
  useCategories: () => ({ data: [{ id: 1, name: "Comida", kind: "expense", color: "#f97316", icon: "tag" }] }),
  usePaymentMethods: () => ({ data: [] }),
  useMe: () => ({ data: { currency: "MXN" } }),
}));

const initial = { id: 0, category_id: 1, amount: 0, description: "", spent_on: "2026-03-10", created_at: "" };

describe("ExpenseForm", () => {
  it("rejects an unparseable amount without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<ExpenseForm initial={initial} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Monto"), "1.2.3");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/Escribe un monto válido/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends integer cents parsed from localized input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<ExpenseForm initial={initial} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Monto"), "1,234.50");
    await userEvent.type(screen.getByLabelText("Descripción"), "  Súper  ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        amount: 123450, category_id: 1, payment_method_id: null, description: "Súper", spent_on: "2026-03-10",
      }),
    );
  });

  it("shows server field errors under the matching field", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(422, "invalid_reference", "x", { category_id: "does not exist" }));
    renderWithProviders(<ExpenseForm initial={initial} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Monto"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const msg = await screen.findByText("does not exist");
    expect(msg).toHaveAttribute("id", "expense-category-error");
  });
});
