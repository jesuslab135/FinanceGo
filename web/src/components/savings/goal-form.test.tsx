import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SavingsAccount } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { GoalForm } from "./goal-form";

const create = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/query/hooks", () => ({
  useCreateGoal: () => ({ mutateAsync: create, isPending: false }),
  useUpdateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
});
