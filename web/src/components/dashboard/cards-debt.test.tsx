import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { CardsDebt } from "./cards-debt";

vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  useCardsOverview: () => ({ data: undefined, error: new TypeError("Failed to fetch") }),
}));

describe("CardsDebt", () => {
  it("shows a localized error line when the overview fails", () => {
    renderWithProviders(<CardsDebt />);
    expect(screen.getByRole("alert")).toHaveTextContent("No hay conexión con el servidor");
    expect(screen.queryByText("Sin movimientos en este periodo")).not.toBeInTheDocument();
  });
});
