import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Summary } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { MonthSummary } from "./month-summary";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));
vi.mock("motion/react", async (o) => ({ ...(await o<typeof import("motion/react")>()), useReducedMotion: () => true }));

const base: Summary = {
  month: "2026-03", currency: "MXN", income: 100000, fixed_committed: 90000, fixed_paid: 0, installments: 0,
  spent: 20000, available: -10000, budgets: [],
};

describe("MonthSummary", () => {
  it("labels a negative Available as overspent", () => {
    renderWithProviders(<MonthSummary s={base} />);
    expect(screen.getByText("Sobregirado")).toBeInTheDocument();
  });

  it("shows the hero amount and recap chips when there is money left", () => {
    renderWithProviders(<MonthSummary s={{ ...base, fixed_committed: 0, spent: 0, available: 100000 }} />);
    expect(screen.queryByText("Sobregirado")).not.toBeInTheDocument();
    expect(screen.getByLabelText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("Ingresos del mes")).toBeInTheDocument();
  });
});
