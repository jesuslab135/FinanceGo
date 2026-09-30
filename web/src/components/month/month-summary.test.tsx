import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Summary } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { MonthSummary } from "./month-summary";

const celebrateMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/celebrate", async (o) => ({ ...(await o<typeof import("@/lib/celebrate")>()), celebrate: celebrateMock }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
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

  describe("month closed under budget", () => {
    const good: Summary = { ...base, month: "2020-05", available: 5000 };
    beforeEach(() => { localStorage.clear(); celebrateMock.mockReset(); });

    it("celebrates a past month once, remembering it per user", async () => {
      const { unmount } = renderWithProviders(<MonthSummary s={good} />);
      await waitFor(() => expect(celebrateMock).toHaveBeenCalledWith("monthUnderBudget", "¡Cerraste mayo 2020 dentro de tu presupuesto! 🎉", expect.anything()));
      expect(JSON.parse(localStorage.getItem("fin:celebrated-months:1")!)).toEqual(["2020-05"]);
      unmount();
      celebrateMock.mockReset();
      renderWithProviders(<MonthSummary s={good} />);
      expect(celebrateMock).not.toHaveBeenCalled();
    });

    it("never celebrates the current month or an overspent one", () => {
      const now = new Date();
      const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      renderWithProviders(<MonthSummary s={{ ...good, month: cur }} />);
      renderWithProviders(<MonthSummary s={{ ...good, available: -1 }} />);
      expect(celebrateMock).not.toHaveBeenCalled();
    });
  });
});
