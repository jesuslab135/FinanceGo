import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { BudgetMeters, budgetStatus } from "./budget-meters";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

describe("budgets", () => {
  it("classifies percentages", () => {
    expect(budgetStatus(79)).toBe("ok");
    expect(budgetStatus(80)).toBe("warn");
    expect(budgetStatus(100)).toBe("warn");
    expect(budgetStatus(101)).toBe("over");
  });

  it("labels each status in text", () => {
    renderWithProviders(
      <BudgetMeters budgets={[
        { category_id: 1, name: "Comida", color: "#f00", limit: 1000, spent: 500, pct: 50 },
        { category_id: 2, name: "Ocio", color: "#0f0", limit: 1000, spent: 1500, pct: 150 },
      ]} />,
    );
    expect(screen.getByText("En orden")).toBeInTheDocument();
    expect(screen.getByText("Excedido")).toBeInTheDocument();
  });
});
