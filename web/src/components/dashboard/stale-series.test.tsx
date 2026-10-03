import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Summary } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { KpiChips } from "./kpi-cards";
import { SpendingChart } from "./spending-chart";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

const s: Summary = { month: "2026-03", currency: "MXN", income: 0, fixed_committed: 0, fixed_paid: 0, saved: 0, saved_planned: 0, saved_deposited: 0, saved_withdrawn: 0, installments: 0, spent: 0, available: 0, budgets: [] };
const points = [{ start: "2026-03-01", expenses: 100, committed: 0 }];

describe("placeholder (stale) series", () => {
  it("marks the spent chip busy", () => {
    const { container } = renderWithProviders(<KpiChips summary={s} spent={500} period="week" spentStale />);
    expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(1);
    expect(screen.getByText("$5.00").closest("[aria-busy='true']")).not.toBeNull();
  });

  it("keeps the old period's label format and is busy until data settles", () => {
    const { container, rerender } = renderWithProviders(<SpendingChart points={points} period="month" />);
    const ui = (period: "month" | "day", stale: boolean) => <SpendingChart points={points} period={period} stale={stale} />;
    rerender(ui("day", true));
    fireEvent.click(screen.getByRole("button", { name: /tabla/i }));
    expect(container.querySelector("section")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("mar 26")).toBeInTheDocument();
    rerender(ui("day", false));
    expect(container.querySelector("section")).not.toHaveAttribute("aria-busy");
    expect(screen.getByText("1 mar")).toBeInTheDocument();
  });
});
