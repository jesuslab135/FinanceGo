import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import RecurringPage from "./page";

const state = vi.hoisted(() => ({ incomes: {} as Record<string, unknown> }));
const mut = vi.hoisted(() => () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }));
vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  useCategories: () => ({ data: [] }),
  useIncomeSources: () => state.incomes,
  useFixedPayments: () => ({ data: [], error: null, isPending: false }),
  useCreateIncomeSource: mut, useUpdateIncomeSource: mut, useDeactivateIncomeSource: mut,
  useCreateFixedPayment: mut, useUpdateFixedPayment: mut, useDeactivateFixedPayment: mut,
}));

describe("RecurringPage", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });

  it("shows a loading state, not the empty state and its CTA, while pending", () => {
    state.incomes = { data: undefined, error: null, isPending: true };
    renderWithProviders(<RecurringPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByText("Aún no hay nada aquí")).not.toBeInTheDocument();
  });

  it("shows the load error instead of the empty state", () => {
    state.incomes = { data: undefined, error: new ApiError(500, "internal", "boom"), isPending: false };
    renderWithProviders(<RecurringPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal en el servidor");
    expect(screen.queryByText("Aún no hay nada aquí")).not.toBeInTheDocument();
  });

  it("shows the empty state after an empty successful load", () => {
    state.incomes = { data: [], error: null, isPending: false };
    renderWithProviders(<RecurringPage />);
    expect(screen.getByText("Aún no hay nada aquí")).toBeInTheDocument();
  });
});
