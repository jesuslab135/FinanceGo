import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SavingsGoal } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { GoalCard } from "./goal-card";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

const base = {
  id: 7, account_id: 1, name: "Japón", kind: "standard", target_amount: 4_000_000, color: "#64748b", icon: "piggy-bank",
  start_month: "2026-01", archived: false, progress: 1_240_000, remaining: 2_760_000, pct: 31, required_monthly: 300_000,
  status: "behind", behind_by: 180_000, planned_this_month: 300_000, target_date: "2026-12-31",
} as SavingsGoal;

describe("GoalCard", () => {
  it("shows progress, a text status chip and the monthly amount", () => {
    renderWithProviders(<GoalCard goal={base} onContribute={() => {}} onOpen={() => {}} />);
    expect(screen.getByText("Japón")).toBeInTheDocument();
    expect(screen.getByText("Atrasada $1,800.00")).toBeInTheDocument();
    expect(screen.getByText("$12,400.00 de $40,000.00")).toBeInTheDocument();
    expect(screen.getByText("$3,000.00 al mes para llegar")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Progreso de Japón: 31%" })).toBeInTheDocument();
  });

  it("contributes with the goal preselected", () => {
    const onContribute = vi.fn();
    renderWithProviders(<GoalCard goal={base} onContribute={onContribute} onOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Abonar" }));
    expect(onContribute).toHaveBeenCalledWith(base);
  });

  it("celebrates a reached goal without a required amount", () => {
    renderWithProviders(<GoalCard goal={{ ...base, status: "achieved", required_monthly: undefined, pct: 100 }} onContribute={() => {}} onOpen={() => {}} />);
    expect(screen.getByText("¡Lograda!")).toBeInTheDocument();
    expect(screen.queryByText(/al mes para llegar/)).not.toBeInTheDocument();
  });
});
