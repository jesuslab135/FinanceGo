import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Summary } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { KpiChips } from "./kpi-cards";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

const base: Summary = {
  month: "2026-03", currency: "MXN", income: 100000, fixed_committed: 80000, fixed_paid: 30000, saved: 0, saved_planned: 0, saved_deposited: 0, saved_withdrawn: 0,
  installments: 30000, spent: 10000, available: -20000, budgets: [],
};

describe("KpiChips", () => {
  it("shows income, committed and spent; Available lives in the hero", () => {
    renderWithProviders(<KpiChips summary={base} spent={500} period="week" />);
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText("$1,100.00")).toBeInTheDocument();
    expect(screen.getByText("Gastado esta semana")).toBeInTheDocument();
    expect(screen.queryByText("Sobregirado")).toBeNull();
  });

  it("shows committed fixed payments with paid/pending detail", () => {
    renderWithProviders(<KpiChips summary={base} spent={0} period="month" />);
    expect(screen.getByText("$300.00 pagado · $500.00 pendiente")).toBeInTheDocument();
  });
});
