"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { PaymentMethodSelect } from "@/components/common/payment-method-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Entry } from "@/lib/api/types";
import { centsToInput, parseMoney } from "@/lib/money";
import { useUpdateEntry } from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";

export function EntryForm({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const update = useUpdateEntry();
  const [amount, setAmount] = useState(centsToInput(entry.amount));
  const [pm, setPm] = useState<number | null>(entry.payment_method_id ?? null);
  const [error, setError] = useState<string>();

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null) return setError(t("validation.amount"));
    setError(undefined);
    const settled = entry.status === "paid" || entry.status === "received";
    try {
      await update.mutateAsync({
        id: entry.id, amount: cents, status: entry.status,
        // The API rejects a settled_on far from the month; keep it only when already settled.
        settled_on: settled ? entry.settled_on ?? undefined : undefined,
        payment_method_id: entry.kind === "income" ? undefined : pm ?? undefined,
      });
      toast.success(t("common.saved"));
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="entry-amount">{t("recurring.amount")}</Label>
        <MoneyInput id="entry-amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!error} />
        <FieldError message={error} />
      </div>
      {entry.kind === "fixed" && (
        <div className="space-y-2">
          <Label htmlFor="entry-pm">{t("expenses.paymentMethod")}</Label>
          <PaymentMethodSelect id="entry-pm" value={pm} onChange={setPm} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={update.isPending}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
