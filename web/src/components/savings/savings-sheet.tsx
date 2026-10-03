"use client";
import { useTranslations } from "next-intl";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import type { AccountMovement, SavingsAccount, SavingsGoal } from "@/lib/api/types";
import { useSavingsAccounts, useSavingsGoals } from "@/lib/query/hooks";
import type { MovementKind } from "@/lib/savings";
import { AccountForm } from "./account-form";
import { GoalForm } from "./goal-form";
import { MovementForm } from "./movement-form";
import { ValuationForm } from "./valuation-form";

export type SheetState =
  | { type: "account"; account?: SavingsAccount }
  | { type: "goal"; goal?: SavingsGoal; emergency?: boolean; accountId?: number }
  | { type: "movement"; movement?: AccountMovement; accountId?: number; goalId?: number; kind?: MovementKind }
  | { type: "valuation"; account: SavingsAccount }
  | null;

/** One dialog/bottom sheet for every savings form; the page keeps a single SheetState. */
export function SavingsSheet({ state, onChange }: { state: SheetState; onChange: (s: SheetState) => void }) {
  const t = useTranslations("savings");
  const { data: accounts = [] } = useSavingsAccounts();
  const { data: goals = [] } = useSavingsGoals();
  const close = () => onChange(null);
  const title = !state ? "" :
    state.type === "account" ? t(state.account ? "editAccount" : "newAccount") :
    state.type === "goal" ? t(state.goal ? "editGoal" : state.emergency ? "form.emergency" : "newGoal") :
    state.type === "movement" ? t(state.movement ? "editMovement" : "movement") :
    t("updateValue");
  return (
    <ResponsiveDialog open={state !== null} onOpenChange={(o) => !o && close()} title={title}>
      {state?.type === "account" && <AccountForm account={state.account} onDone={close} />}
      {state?.type === "goal" && (
        <GoalForm accounts={accounts} goal={state.goal} emergency={state.emergency} defaultAccountId={state.accountId} onDone={close} />
      )}
      {state?.type === "movement" && (
        <MovementForm
          accounts={accounts} goals={goals} movement={state.movement}
          defaults={{ accountId: state.accountId, goalId: state.goalId, kind: state.kind }}
          onDone={close} onUpdateValue={(account) => onChange({ type: "valuation", account })}
        />
      )}
      {state?.type === "valuation" && <ValuationForm account={state.account} onDone={close} />}
    </ResponsiveDialog>
  );
}
