import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SavingsAccount, SavingsGoal } from "@/lib/api/types";
import { centsToInput } from "@/lib/money";
import { requiredMonthly } from "@/lib/savings";
import { renderWithProviders } from "@/test/render";
import { GoalForm } from "./goal-form";

const create = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const update = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/query/hooks", () => ({
  useCreateGoal: () => ({ mutateAsync: create, isPending: false }),
  useUpdateGoal: () => ({ mutateAsync: update, isPending: false }),
  useDeleteGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEmergencySuggestion: (months: number, enabled: boolean) =>
    ({ data: enabled ? { monthly_need: 1_100_000, months, target: 1_100_000 * months } : undefined }),
  useMe: () => ({ data: { currency: "MXN" } }),
}));

const accounts = [{ id: 1, name: "Cajita", archived_on: null } as unknown as SavingsAccount];

describe("GoalForm", () => {
  it("pre-fills an emergency fund from the suggestion and switches months", async () => {
    renderWithProviders(<GoalForm accounts={accounts} emergency onDone={() => {}} />);
    expect(screen.getByLabelText("¿Cuánto quieres juntar?")).toHaveValue("33000.00");
    fireEvent.click(screen.getByLabelText("6 meses"));
    await waitFor(() => expect(screen.getByLabelText("¿Cuánto quieres juntar?")).toHaveValue("66000.00"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: "emergency", emergency_months: 6, target_amount: 6_600_000, account_id: 1 })));
  });

  it("offers the required monthly amount once target and date are set", () => {
    renderWithProviders(<GoalForm accounts={accounts} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("¿Cuánto quieres juntar?"), { target: { value: "1200" } });
    const nextYear = new Date().getFullYear() + 1;
    fireEvent.change(screen.getByLabelText("Fecha objetivo"), { target: { value: `${nextYear}-12-31` } });
    const use = screen.getByRole("button", { name: /^Usar .* al mes$/ });
    fireEvent.click(use);
    expect((screen.getByLabelText("Apartar al mes") as HTMLInputElement).value).not.toBe("");
  });

  it("sends the typed starting amount in cents, and 0 when left empty", async () => {
    create.mockClear();
    renderWithProviders(<GoalForm accounts={accounts} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Moto" } });
    fireEvent.change(screen.getByLabelText("¿Cuánto quieres juntar?"), { target: { value: "30000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ starting_amount: 0 })));
    fireEvent.change(screen.getByLabelText("Ya tengo ahorrado"), { target: { value: "12500.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ starting_amount: 1_250_050, target_amount: 3_000_000 })));
  });

  it("prefills the starting amount on edit and keeps it when archiving", async () => {
    update.mockClear();
    const goal = { id: 5, account_id: 1, name: "Moto", kind: "standard", target_amount: 120_000, starting_amount: 30_000,
      progress: 50_000, color: "#64748b", icon: "piggy-bank", archived: false } as unknown as SavingsGoal;
    renderWithProviders(<GoalForm accounts={accounts} goal={goal} onDone={() => {}} />);
    expect(screen.getByLabelText("Ya tengo ahorrado")).toHaveValue("300.00");
    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 5, starting_amount: 30_000, archived: true })));
  });

  it("subtracts the typed starting amount plus tagged savings from the monthly hint", () => {
    // progress 500.00 = 300.00 starting + 200.00 tagged; changing the start to 600.00 leaves 400.00 to go.
    const goal = { id: 5, account_id: 1, name: "Moto", kind: "standard", target_amount: 120_000, starting_amount: 30_000,
      progress: 50_000, color: "#64748b", icon: "piggy-bank", archived: false } as unknown as SavingsGoal;
    const date = `${new Date().getFullYear() + 1}-12-31`;
    renderWithProviders(<GoalForm accounts={accounts} goal={{ ...goal, target_date: date }} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("Ya tengo ahorrado"), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: /^Usar .* al mes$/ }));
    expect(screen.getByLabelText("Apartar al mes")).toHaveValue(centsToInput(requiredMonthly(40_000, new Date(), date)));
    // A start that covers what is left removes the hint.
    fireEvent.change(screen.getByLabelText("Ya tengo ahorrado"), { target: { value: "1000" } });
    expect(screen.queryByRole("button", { name: /^Usar .* al mes$/ })).toBeNull();
  });
});
