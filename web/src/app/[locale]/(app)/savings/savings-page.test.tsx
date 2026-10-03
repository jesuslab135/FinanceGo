import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { SavingsAccount } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import SavingsPage from "./page";

const ok = (data: unknown) => ({ data, error: null, isPending: false });
const failed = () => ({ data: undefined, error: new ApiError(500, "internal", "boom"), isPending: false });
const state = vi.hoisted(() => ({ accounts: {} as Record<string, unknown>, goals: {} as Record<string, unknown>, series: {} as Record<string, unknown>, includeArchived: [] as boolean[] }));
const mut = vi.hoisted(() => () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }));
vi.mock("@/lib/query/hooks", () => ({
  useSavingsOverview: () => ({ data: { allocation: [], insurance_warnings: [] }, error: null, isPending: false }),
  useSavingsAccounts: (includeArchived?: boolean) => { state.includeArchived.push(!!includeArchived); return state.accounts; },
  useSavingsGoals: () => state.goals,
  useSavingsSeries: () => state.series,
  useUpdateSavingsAccount: mut, useDeleteSavingsAccount: mut,
}));
vi.mock("@/components/savings/net-worth-hero", () => ({ NetWorthHero: () => null }));
vi.mock("@/components/savings/insurance-banner", () => ({ InsuranceBanner: () => null }));
vi.mock("@/components/savings/allocation-bar", () => ({ AllocationBar: () => null }));
vi.mock("@/components/savings/savings-chart", () => ({ SavingsChart: () => <p>chart</p> }));
vi.mock("@/components/savings/savings-sheet", () => ({ SavingsSheet: () => null }));
vi.mock("@/components/savings/goal-card", () => ({ GoalCard: () => null }));
vi.mock("@/components/savings/account-row", () => ({ AccountRow: ({ account }: { account: SavingsAccount }) => <p>{account.name}</p> }));

const account = (over: Partial<SavingsAccount>) => ({ id: 1, name: "Cajita", institution: "Nu", kind: "bank", archived_on: null, ...over }) as SavingsAccount;
const EMPTY = "Aún no registras ahorros. Empieza con una cuenta o con tu fondo de emergencia.";

describe("SavingsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    state.accounts = ok([]);
    state.goals = ok([]);
    state.series = ok([]);
    state.includeArchived = [];
  });

  it("shows the empty state only when there are no accounts at all", () => {
    renderWithProviders(<SavingsPage />);
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(state.includeArchived.every(Boolean)).toBe(true);
  });

  it("keeps the Archived toggle reachable when every account is archived", async () => {
    state.accounts = ok([account({ name: "Vieja", archived_on: "2026-09-01" })]);
    renderWithProviders(<SavingsPage />);
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
    expect(screen.queryByText("Vieja")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archivada" }));
    expect(screen.getByText("Vieja")).toBeInTheDocument();
  });

  it("hides archived accounts until the toggle is on", () => {
    state.accounts = ok([account({ id: 1, name: "Activa" }), account({ id: 2, name: "Vieja", archived_on: "2026-09-01" })]);
    renderWithProviders(<SavingsPage />);
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.queryByText("Vieja")).not.toBeInTheDocument();
  });

  it("shows the accounts load error instead of the empty state", () => {
    state.accounts = failed();
    renderWithProviders(<SavingsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal en el servidor");
    expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
  });

  it("shows the goals and series load errors", () => {
    state.accounts = ok([account({})]);
    state.goals = failed();
    state.series = failed();
    renderWithProviders(<SavingsPage />);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.queryByText("chart")).not.toBeInTheDocument();
  });
});
