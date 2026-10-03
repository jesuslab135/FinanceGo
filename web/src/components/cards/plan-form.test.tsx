import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InstallmentPlan } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { PlanForm } from "./plan-form";

vi.mock("@/lib/query/hooks", () => ({
  useCategories: () => ({ data: [{ id: 5, name: "Hogar", kind: "expense", color: "#8b5cf6", icon: "home" }] }),
  useMe: () => ({ data: { currency: "MXN" } }),
}));

const plan = {
  id: 1, payment_method_id: 3, category_id: 5, description: "Refri", total_amount: 1200000, installments: 12,
  installment_amount: 100000, purchased_on: "2026-05-02", billed_count: 2, remaining_amount: 1000000,
} as InstallmentPlan;

describe("PlanForm", () => {
  it("locks amount, installments and purchase date once installments were billed", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<PlanForm cardId={3} initial={plan} onSubmit={onSubmit} />);
    expect(screen.getByText(/solo puedes cambiar la descripción y la categoría/)).toBeInTheDocument();
    for (const label of ["Total", "Mensualidades", "Fecha de compra"]) expect(screen.getByLabelText(label)).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Descripción")).not.toHaveAttribute("readonly");
    await userEvent.clear(screen.getByLabelText("Descripción"));
    await userEvent.type(screen.getByLabelText("Descripción"), "Refrigerador");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        payment_method_id: 3, category_id: 5, description: "Refrigerador", total_amount: 1200000, installments: 12, purchased_on: "2026-05-02",
      }),
    );
  });

  it("keeps everything editable before the first installment", () => {
    renderWithProviders(<PlanForm cardId={3} initial={{ ...plan, billed_count: 0 }} onSubmit={vi.fn()} />);
    expect(screen.queryByText(/solo puedes cambiar/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Total")).not.toHaveAttribute("readonly");
  });
});
