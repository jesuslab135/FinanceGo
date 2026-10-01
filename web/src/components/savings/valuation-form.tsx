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
import { localizeFields, useErrorMessage } from "@/lib/api/error-messages";
import type { SavingsAccount } from "@/lib/api/types";
import { toISODate } from "@/lib/dates";
import { centsToInput, parseMoney } from "@/lib/money";
import { usePutValuation } from "@/lib/query/hooks";

export function ValuationForm({ account, onDone }: { account: SavingsAccount; onDone: () => void }) {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const put = usePutValuation();
  const [value, setValue] = useState(centsToInput(account.balance));
  const [date, setDate] = useState(toISODate(new Date()));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(value);
    if (cents === null || cents < 0) return setErrors({ value: t("validation.amount") });
    try {
      await put.mutateAsync({ accountId: account.id, date, value: cents });
      toast.success(t("common.saved"));
      onDone();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(localizeFields(err.fields, t));
      else toast.error(errMsg(err));
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">{account.name} · {account.institution}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="val-value">{t("savings.form.value")}</Label>
          <MoneyInput id="val-value" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!errors.value} />
          <FieldError message={errors.value} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="val-date">{t("savings.form.date")}</Label>
          <Input id="val-date" type="date" value={date} min={account.opening_date} max={toISODate(new Date())} onChange={(e) => setDate(e.target.value)} />
          <FieldError message={errors.valued_on} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={put.isPending}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
