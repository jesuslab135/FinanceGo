import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { ExpenseList } from "./expense-list";

vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  useExpenses: () => ({ isPending: false, isError: true, error: new ApiError(500, "internal", "pq: connection refused"), data: undefined }),
  useCategories: () => ({ data: [] }),
  usePaymentMethods: () => ({ data: [] }),
  useUpdateExpense: () => ({ mutateAsync: vi.fn() }),
  useDeleteExpense: () => ({ mutate: vi.fn() }),
}));

describe("ExpenseList", () => {
  it("shows a localized load error instead of the empty state", () => {
    renderWithProviders(<ExpenseList filters={{}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal en el servidor");
    expect(screen.queryByText("No hay gastos en este rango")).not.toBeInTheDocument();
    expect(screen.queryByText(/connection refused/)).not.toBeInTheDocument();
  });
});
