import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SavingsGoal, SavingsOverview } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { SavingsCard } from "./savings-card";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const overview = {
  net_worth: 5_000_000, assets: 5_300_000, card_debt: 300_000, udi_value: 8.7, allocation: [], insurance_warnings: [],
  month: { planned: 350_000, deposited: 200_000, withdrawn: 0, saved: 350_000 },
} as SavingsOverview;
const goal = (id: number, name: string, date: string | undefined, pct: number) =>
  ({ id, name, pct, target_date: date, progress: 0, target_amount: 1, status: "on_track", account_id: 1 }) as SavingsGoal;

describe("SavingsCard", () => {
  it("shows saved vs planned, net worth, and the two nearest goals", () => {
    renderWithProviders(<SavingsCard overview={overview} goals={[goal(1, "Lejana", "2027-12-31", 10), goal(2, "Japón", "2026-12-31", 40), goal(3, "Auto", "2026-06-30", 5)]} />);
    expect(screen.getByText("Ahorrado $2,000.00 de $3,500.00 planeado")).toBeInTheDocument();
    expect(screen.getByText("$50,000.00")).toBeInTheDocument();
    expect(screen.getByText("Auto")).toBeInTheDocument();
    expect(screen.getByText("Japón")).toBeInTheDocument();
    expect(screen.queryByText("Lejana")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver ahorro" })).toHaveAttribute("href", expect.stringContaining("/savings"));
  });
});
