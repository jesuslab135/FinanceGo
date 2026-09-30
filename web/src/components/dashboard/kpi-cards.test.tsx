import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Summary } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { KpiCards } from "./kpi-cards";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

const base: Summary = {
  month: "2026-03", currency: "MXN", income: 100000, fixed_committed: 80000, fixed_paid: 30000,
  installments: 30000, spent: 10000, available: -20000, budgets: [],
};

describe("KpiCards", () => {
  it("marks negative Available with icon + label, not color alone", () => {
    renderWithProviders(<KpiCards summary={base} spent={10000} period="month" />);
    const label = screen.getByText("Sobregirado");
    expect(label).toBeInTheDocument();
    expect(label.closest("[data-kpi='available']")?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("-$200.00")).toHaveClass("text-critical");
  });

  it("shows safe-to-spend for the current month", () => {
    renderWithProviders(
      <KpiCards summary={{ ...base, available: 170000, safe_to_spend_per_day: 10000, days_remaining: 17 }} spent={500} period="week" />,
    );
    expect(screen.getByText("Puedes gastar $100.00 por día (17 días restantes)")).toBeInTheDocument();
    expect(screen.getByText("Gastado esta semana")).toBeInTheDocument();
    expect(screen.queryByText("Sobregirado")).toBeNull();
  });

  it("uses the singular on the last day, in both languages", () => {
    const summary = { ...base, available: 10000, safe_to_spend_per_day: 10000, days_remaining: 1 };
    renderWithProviders(<KpiCards summary={summary} spent={0} period="month" />);
    expect(screen.getByText("Puedes gastar $100.00 por día (1 día restante)")).toBeInTheDocument();
    renderWithProviders(<KpiCards summary={summary} spent={0} period="month" />, { locale: "en" });
    expect(screen.getByText("You can spend MX$100.00 per day (1 day left)")).toBeInTheDocument();
  });

  it("shows committed fixed payments with paid/pending detail", () => {
    renderWithProviders(<KpiCards summary={base} spent={0} period="month" />);
    expect(screen.getByText("$300.00 pagado · $500.00 pendiente")).toBeInTheDocument();
  });
});
