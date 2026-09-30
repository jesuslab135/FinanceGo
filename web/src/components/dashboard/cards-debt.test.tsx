import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { CardsDebt } from "./cards-debt";

vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
let result: { data?: unknown; error?: unknown; isPending: boolean };
vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  useCardsOverview: () => result,
}));

describe("CardsDebt", () => {
  beforeEach(() => { result = { data: undefined, error: null, isPending: true }; });

  it("shows a localized error line when the overview fails", () => {
    result = { data: undefined, error: new TypeError("Failed to fetch"), isPending: false };
    renderWithProviders(<CardsDebt />);
    expect(screen.getByRole("alert")).toHaveTextContent("No hay conexión con el servidor");
    expect(screen.queryByText("Sin movimientos en este periodo")).not.toBeInTheDocument();
  });

  it("shows a loading state instead of 'no activity' while pending", () => {
    renderWithProviders(<CardsDebt />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByText("Sin movimientos en este periodo")).not.toBeInTheDocument();
  });

  it("shows 'no activity' after an empty successful load", () => {
    result = { data: [], error: null, isPending: false };
    renderWithProviders(<CardsDebt />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Sin movimientos en este periodo")).toBeInTheDocument();
  });
});
