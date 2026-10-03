import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { BudgetField } from "./budget-field";

const put = vi.fn();
const del = vi.fn();
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  usePutBudget: () => ({ mutate: put }),
  useDeleteBudget: () => ({ mutate: del }),
}));

const cat = { id: 4, name: "Comida", kind: "expense", color: "#000", icon: "tag" } as never;

describe("BudgetField", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the limit it is given", () => {
    renderWithProviders(<BudgetField category={cat} limit={150000} />);
    expect(screen.getByLabelText("Límite mensual de Comida")).toHaveValue("1500.00");
  });

  it("deletes the budget when cleared and blurred", async () => {
    renderWithProviders(<BudgetField category={cat} limit={150000} />);
    await userEvent.clear(screen.getByLabelText("Límite mensual de Comida"));
    await userEvent.tab();
    expect(del).toHaveBeenCalledWith(4, expect.anything());
    expect(put).not.toHaveBeenCalled();
  });

  it("does not put when the value is unchanged", async () => {
    renderWithProviders(<BudgetField category={cat} limit={150000} />);
    await userEvent.click(screen.getByLabelText("Límite mensual de Comida"));
    await userEvent.tab();
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("rejects invalid text with a toast", async () => {
    renderWithProviders(<BudgetField category={cat} />);
    await userEvent.type(screen.getByLabelText("Límite mensual de Comida"), "abc");
    await userEvent.tab();
    expect(toast.error).toHaveBeenCalledWith("Escribe un monto válido, p. ej. 1,234.50");
    expect(put).not.toHaveBeenCalled();
  });

  it("puts a new limit in cents", async () => {
    renderWithProviders(<BudgetField category={cat} />);
    await userEvent.type(screen.getByLabelText("Límite mensual de Comida"), "200");
    await userEvent.tab();
    expect(put).toHaveBeenCalledWith({ categoryId: 4, limit: 20000 }, expect.anything());
  });
});
