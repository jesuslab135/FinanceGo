"use client";
import { toast } from "sonner";
import { useErrorMessage } from "@/lib/api/error-messages";
import type { SavingsAccount } from "@/lib/api/types";
import { useUpdateSavingsAccount } from "@/lib/query/hooks";

/** Archives or un-archives an account: the update sends every account field with `archived` flipped. */
export function useSetAccountArchived() {
  const update = useUpdateSavingsAccount();
  const errMsg = useErrorMessage();
  return async (a: SavingsAccount, archived: boolean) => {
    try {
      await update.mutateAsync({ id: a.id, name: a.name, institution: a.institution, kind: a.kind, color: a.color,
        annual_rate_bp: a.annual_rate_bp ?? undefined, opening_balance: a.opening_balance, opening_date: a.opening_date, archived });
    } catch (err) { toast.error(errMsg(err)); }
  };
}
