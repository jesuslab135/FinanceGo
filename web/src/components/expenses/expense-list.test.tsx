import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { ExpenseList } from "./expense-list";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: Object.assign(toastMock, { error: vi.fn(), success: vi.fn() }) }));

const state = vi.hoisted(() => ({ expenses: { isPending: false, isError: false, error: null, data: undefined, hasNextPage: false } as Record<string, unknown> }));
const removeAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  useExpenses: () => state.expenses,
  useCategories: () => ({ data: [{ id: 1, name: "Comida", color: "#d9602f", icon: "utensils" }] }),
  usePaymentMethods: () => ({ data: [] }),
  useUpdateExpense: () => ({ mutateAsync: vi.fn() }),
  useDeleteExpense: () => ({ mutateAsync: removeAsync }),
}));

const expense = (id: number, spent_on: string, amount: number, description: string) => ({ id, spent_on, amount, description, category_id: 1 });

describe("ExpenseList", () => {
  beforeEach(() => {
    toastMock.mockReset();
    removeAsync.mockClear();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });

  it("shows a localized load error instead of the empty state", () => {
    state.expenses = { isPending: false, isError: true, error: new ApiError(500, "internal", "pq: connection refused"), data: undefined };
    renderWithProviders(<ExpenseList filters={{}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal en el servidor");
    expect(screen.queryByText("No hay gastos en este rango")).not.toBeInTheDocument();
    expect(screen.queryByText(/connection refused/)).not.toBeInTheDocument();
  });

  it("groups rows by day with a day total, and deletes through the row menu with undo", async () => {
    state.expenses = {
      isPending: false, isError: false, error: null, hasNextPage: false,
      data: { pages: [{ items: [expense(1, "2026-09-29", 10000, "Tacos"), expense(2, "2026-09-29", 5000, "Café"), expense(3, "2026-09-28", 2000, "Pan")] }] },
    };
    renderWithProviders(<ExpenseList filters={{}} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: /martes 29 de septiembre/i })).toHaveTextContent("Total del día");
    expect(screen.getByRole("heading", { name: /martes 29 de septiembre/i })).toHaveTextContent("150.00");

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Más acciones" })[0]);
    await user.click(await screen.findByRole("menuitem", { name: "Eliminar" }));
    expect(toastMock).toHaveBeenCalledWith("Eliminado", expect.objectContaining({ action: expect.objectContaining({ label: "Deshacer" }) }));
    await waitFor(() => expect(screen.queryByText("Tacos")).not.toBeInTheDocument());
    expect(removeAsync).not.toHaveBeenCalled();
    // undo brings the row back without touching the API
    toastMock.mock.calls[0][1].action.onClick();
    expect(await screen.findByText("Tacos")).toBeInTheDocument();
    expect(removeAsync).not.toHaveBeenCalled();
  });
});
