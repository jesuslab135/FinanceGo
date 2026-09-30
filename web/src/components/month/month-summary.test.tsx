import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { MonthSummary } from "./month-summary";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

describe("MonthSummary", () => {
  it("labels a negative Available as overspent", () => {
    renderWithProviders(<MonthSummary s={{ income: 100000, fixed_committed: 90000, installments: 0, spent: 20000, available: -10000 }} />);
    expect(screen.getByText("Sobregirado")).toBeInTheDocument();
  });

  it("shows no label when there is money left", () => {
    renderWithProviders(<MonthSummary s={{ income: 100000, fixed_committed: 0, installments: 0, spent: 0, available: 100000 }} />);
    expect(screen.queryByText("Sobregirado")).not.toBeInTheDocument();
  });
});
