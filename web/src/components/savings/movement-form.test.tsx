import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavingsAccount, SavingsGoal } from "@/lib/api/types";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { MovementForm } from "./movement-form";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query/hooks", () => ({
  useCreateMovement: () => ({ mutateAsync: create, isPending: false }),
  useUpdateMovement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMe: () => ({ data: { currency: "MXN" } }),
}));
vi.mock("motion/react", async (o) => ({ ...(await o<typeof import("motion/react")>()), useReducedMotion: () => true }));

const acct = (id: number, name: string): SavingsAccount =>
  ({ id, name, institution: "Nu", kind: "bank", color: "#64748b", opening_balance: 0, opening_date: "2026-03-01", balance: 50_000,
     put_in: 0, gain: 0, anchor_date: "2026-03-01", stale: false, insured: true, has_history: false, has_money_history: false }) as SavingsAccount;
const goal = (id: number, accountId: number, name: string): SavingsGoal =>
  ({ id, account_id: accountId, name, kind: "standard", target_amount: 100_000, color: "#64748b", icon: "piggy-bank", start_month: "2026-03",
     archived: false, progress: 0, remaining: 100_000, pct: 0, status: "no_date", planned_this_month: 0 }) as SavingsGoal;

describe("MovementForm", () => {
  beforeEach(() => { create.mockReset(); });

  it("offers only the selected account's goals and sends a tagged deposit", async () => {
    create.mockResolvedValue({});
    const onDone = vi.fn();
    renderWithProviders(<MovementForm accounts={[acct(1, "Cajita"), acct(2, "GBM")]} goals={[goal(10, 1, "Japón"), goal(20, 2, "Retiro")]} onDone={onDone} />);
    const goalSelect = screen.getByLabelText("Meta") as HTMLSelectElement;
    expect([...goalSelect.options].map((o) => o.text)).toEqual(["Sin meta", "Japón"]);
    fireEvent.change(goalSelect, { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ account_id: 1, kind: "deposit", goal_id: 10, amount: 25_000 })));
    expect(onDone).toHaveBeenCalled();
  });

  it("hides the goal and asks for a destination on transfers", () => {
    renderWithProviders(<MovementForm accounts={[acct(1, "Cajita"), acct(2, "GBM")]} goals={[]} onDone={() => {}} />);
    fireEvent.click(screen.getByLabelText("Transferir"));
    expect(screen.queryByLabelText("Meta")).not.toBeInTheDocument();
    const to = screen.getByLabelText("A la cuenta") as HTMLSelectElement;
    expect([...to.options].map((o) => o.text)).toEqual(["GBM"]);
  });

  it("explains an insufficient balance and offers to update the value", async () => {
    create.mockRejectedValue(new ApiError(422, "insufficient_balance", "x", { amount: "exceeds the account balance" }));
    const onUpdateValue = vi.fn();
    renderWithProviders(<MovementForm accounts={[acct(1, "Cajita")]} goals={[]} defaults={{ kind: "withdrawal" }} onDone={() => {}} onUpdateValue={onUpdateValue} />);
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Es más que el saldo de la cuenta.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar valor" }));
    expect(onUpdateValue).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
});
