"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/errors";
import { toISODate } from "@/lib/dates";
import { centsToInput, parseMoney } from "@/lib/money";
import { useCreateCardPayment } from "@/lib/query/hooks";
import { localizeFields, useErrorMessage } from "@/lib/api/error-messages";

export function CardPaymentForm({ cardId, defaultAmount, onDone }: { cardId: number; defaultAmount: number; onDone: () => void }) {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const create = useCreateCardPayment();
  const [amount, setAmount] = useState(defaultAmount > 0 ? centsToInput(defaultAmount) : "");
  const [paidOn, setPaidOn] = useState(toISODate(new Date()));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null) return setErrors({ amount: t("validation.amount") });
    try {
      await create.mutateAsync({ payment_method_id: cardId, amount: cents, paid_on: paidOn, note: note.trim() });
      toast.success(t("common.saved"));
      onDone();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(localizeFields(err.fields, t));
      else toast.error(errMsg(err));
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cp-amount">{t("recurring.amount")}</Label>
          <MoneyInput id="cp-amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} />
          <FieldError message={errors.amount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-date">{t("expenses.date")}</Label>
          <Input id="cp-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          <FieldError message={errors.paid_on} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-note">{t("cards.note")} ({t("common.optional")})</Label>
        <Input id="cp-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={create.isPending}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
