import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { SavingsAccount } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import SavingsAccountPage from "./page";

const ok = (data: unknown) => ({ data, error: null, isPending: false });
const failed = () => ({ data: undefined, error: new ApiError(500, "internal", "boom"), isPending: false });
const state = vi.hoisted(() => ({ account: {} as Record<string, unknown>, movements: {} as Record<string, unknown>, valuations: {} as Record<string, unknown>, update: vi.fn() }));
const mut = vi.hoisted(() => () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }));
vi.mock("@/lib/query/hooks", () => ({
  useSavingsAccount: () => ({ data: { account: state.account, goals: [] }, error: null, isPending: false }),
  useAccountMovements: () => state.movements,
  useValuations: () => state.valuations,
  useUpdateSavingsAccount: () => ({ mutate: vi.fn(), mutateAsync: state.update }),
  useDeleteMovement: mut, useDeleteValuation: mut, useMe: () => ({ data: { currency: "MXN" } }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "7" }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/components/savings/savings-sheet", () => ({ SavingsSheet: () => null }));

const account: SavingsAccount = {
  id: 7, name: "Cajita", institution: "Nu", kind: "bank", color: "#22c55e", annual_rate_bp: 1300, opening_balance: 100000,
  opening_date: "2026-01-10", balance: 100000, put_in: 100000, gain: 0,
  anchor_date: "2026-01-10", stale: false, insured: true, has_history: true, has_money_history: true,
};
const fields = { id: 7, name: "Cajita", institution: "Nu", kind: "bank", color: "#22c55e", annual_rate_bp: 1300,
  opening_balance: 100000, opening_date: "2026-01-10" };

describe("SavingsAccountPage", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    state.account = account;
    state.movements = ok([]);
    state.valuations = ok([]);
    state.update = vi.fn().mockResolvedValue(undefined);
  });

  it("archives the account from the header, sending all its fields", async () => {
    renderWithProviders(<SavingsAccountPage />);
    await userEvent.click(screen.getByRole("button", { name: "Archivar" }));
    expect(state.update).toHaveBeenCalledWith({ ...fields, archived: true });
  });

  it("un-archives an archived account", async () => {
    state.account = { ...account, archived_on: "2026-09-01" };
    renderWithProviders(<SavingsAccountPage />);
    await userEvent.click(screen.getByRole("button", { name: "Desarchivar" }));
    expect(state.update).toHaveBeenCalledWith({ ...fields, archived: false });
  });

  it("shows the movements load error instead of 'no movements'", () => {
    state.movements = failed();
    renderWithProviders(<SavingsAccountPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal en el servidor");
    expect(screen.queryByText("Sin movimientos todavía.")).not.toBeInTheDocument();
  });

  it("shows the valuations load error", () => {
    state.valuations = failed();
    renderWithProviders(<SavingsAccountPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal en el servidor");
  });
});
