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
import { useCreateSavingsAccount, useUpdateSavingsAccount } from "@/lib/query/hooks";
import { ACCOUNT_KINDS, parseRate, rateToInput, type AccountKind } from "@/lib/savings";
import { selectClass } from "./select-class";

const insuranceKey = (k: AccountKind) => (k === "bank" ? "insuredBank" : k === "sofipo" ? "insuredSofipo" : "notInsured");

export function AccountForm({ account, onDone }: { account?: SavingsAccount; onDone: () => void }) {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const create = useCreateSavingsAccount();
  const update = useUpdateSavingsAccount();
  const locked = account?.has_money_history ?? false;
  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [kind, setKind] = useState<AccountKind>((account?.kind as AccountKind) ?? "bank");
  const [rate, setRate] = useState(rateToInput(account?.annual_rate_bp));
  const [opening, setOpening] = useState(account ? centsToInput(account.opening_balance) : "");
  const [openingDate, setOpeningDate] = useState(account?.opening_date ?? toISODate(new Date()));
  const [color, setColor] = useState(account?.color ?? "#64748b");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateBp = parseRate(rate);
    const openingCents = opening.trim() ? parseMoney(opening) : 0;
    const next: Record<string, string> = {};
    if (rateBp === undefined) next.annual_rate_bp = t("validation.rate");
    if (openingCents === null || openingCents < 0) next.opening_balance = t("validation.amount");
    if (Object.keys(next).length) return setErrors(next);
    const body = {
      name: name.trim(), institution: institution.trim(), kind, color, annual_rate_bp: rateBp ?? undefined,
      opening_balance: openingCents!, opening_date: openingDate, archived: account?.archived_on != null,
    };
    try {
      if (account) await update.mutateAsync({ id: account.id, ...body });
      else await create.mutateAsync(body);
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
          <Label htmlFor="acc-name">{t("savings.form.name")}</Label>
          <Input id="acc-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          <FieldError message={errors.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-inst">{t("savings.form.institution")}</Label>
          <Input id="acc-inst" maxLength={60} placeholder={t("savings.form.institutionHint")} value={institution} onChange={(e) => setInstitution(e.target.value)} aria-invalid={!!errors.institution} />
          <FieldError message={errors.institution} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="acc-kind">{t("savings.form.kind")}</Label>
          <select id="acc-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)} aria-describedby="acc-kind-help">
            {ACCOUNT_KINDS.map((k) => <option key={k} value={k}>{t(`savings.kinds.${k}`)}</option>)}
          </select>
          <p id="acc-kind-help" className="text-sm text-muted-foreground">{t(`savings.${insuranceKey(kind)}`)}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-rate">{t("savings.form.rate")} ({t("common.optional")})</Label>
          <Input id="acc-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-describedby="acc-rate-help" aria-invalid={!!errors.annual_rate_bp} />
          <p id="acc-rate-help" className="text-xs text-muted-foreground">{t("savings.form.rateHint")}</p>
          <FieldError message={errors.annual_rate_bp} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-color">{t("savings.form.color")}</Label>
          <Input id="acc-color" type="color" className="h-11 w-20 p-1" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-opening">{t("savings.form.openingBalance")}</Label>
          <MoneyInput id="acc-opening" value={opening} disabled={locked} onChange={(e) => setOpening(e.target.value)} aria-invalid={!!errors.opening_balance} />
          <FieldError message={errors.opening_balance} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-opening-date">{t("savings.form.openingDate")}</Label>
          <Input id="acc-opening-date" type="date" value={openingDate} disabled={locked} max={toISODate(new Date())} onChange={(e) => setOpeningDate(e.target.value)} />
          <FieldError message={errors.opening_date} />
        </div>
        {locked && <p className="text-sm text-muted-foreground sm:col-span-2">{t("savings.form.openingLocked")}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={create.isPending || update.isPending}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
