import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { BreakdownBars } from "./breakdown-bars";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

describe("BreakdownBars", () => {
  it("shows a loading state, not 'no activity', while items are undefined", () => {
    renderWithProviders(<BreakdownBars title="Por categoría" items={undefined} fallbackName="—" />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByText("Sin movimientos en este periodo")).not.toBeInTheDocument();
  });

  it("shows 'no activity' for an empty loaded list", () => {
    renderWithProviders(<BreakdownBars title="Por categoría" items={[]} fallbackName="—" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Sin movimientos en este periodo")).toBeInTheDocument();
  });
});
