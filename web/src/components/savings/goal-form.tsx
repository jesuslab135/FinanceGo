"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { useFormatMoney } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/errors";
import { localizeFields, useErrorMessage } from "@/lib/api/error-messages";
import type { SavingsAccount, SavingsGoal } from "@/lib/api/types";
import { centsToInput, parseMoney } from "@/lib/money";
import { useCreateGoal, useDeleteGoal, useEmergencySuggestion, useUpdateGoal } from "@/lib/query/hooks";
import { requiredMonthly } from "@/lib/savings";
import { ConfirmButton } from "@/components/common/confirm-button";
import { cn } from "@/lib/utils";
import { selectClass } from "./select-class";

export function GoalForm({ accounts, goal, emergency = goal?.kind === "emergency", defaultAccountId, onDone }: {
  accounts: SavingsAccount[]; goal?: SavingsGoal; emergency?: boolean; defaultAccountId?: number; onDone: () => void;
}) {
  const t = useTranslations();
  const fmt = useFormatMoney();
  const errMsg = useErrorMessage();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();
  const open = accounts.filter((a) => a.archived_on == null);
  const [months, setMonths] = useState<3 | 6>((goal?.emergency_months as 3 | 6) ?? 3);
  const [name, setName] = useState(goal?.name ?? (emergency ? t("savings.form.emergency") : ""));
  const [accountId, setAccountId] = useState<number>(goal?.account_id ?? defaultAccountId ?? open[0]?.id ?? 0);
  // null until the user types their own; until then the emergency suggestion (if any) fills the target.
  const [typedTarget, setTypedTarget] = useState<string | null>(goal ? centsToInput(goal.target_amount) : null);
  const [start, setStart] = useState(goal?.starting_amount ? centsToInput(goal.starting_amount) : "");
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "");
  const [monthly, setMonthly] = useState(goal?.monthly_amount ? centsToInput(goal.monthly_amount) : "");
  const [color, setColor] = useState(goal?.color ?? "#64748b");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suggestion = useEmergencySuggestion(months, emergency && !goal);

  const target = typedTarget ?? (suggestion.data ? centsToInput(suggestion.data.target) : "");
  const targetCents = parseMoney(target);
  const startCents = start.trim() ? parseMoney(start) : 0;
  // goal.progress already includes the saved starting amount: keep only what was tagged, add the typed start.
  const tagged = goal ? goal.progress - goal.starting_amount : 0;
  const remaining = Math.max((targetCents ?? 0) - ((startCents ?? 0) + tagged), 0);
  const required = targetDate && remaining > 0 ? requiredMonthly(remaining, new Date(), targetDate) : 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const monthlyCents = monthly.trim() ? parseMoney(monthly) : null;
    const next: Record<string, string> = {};
    if (targetCents === null || targetCents <= 0) next.target_amount = t("validation.amount");
    if (startCents === null || startCents < 0) next.starting_amount = t("validation.amount");
    if (monthly.trim() && (monthlyCents === null || monthlyCents <= 0)) next.monthly_amount = t("validation.amount");
    if (Object.keys(next).length) return setErrors(next);
    const body = {
      account_id: accountId, name: name.trim(), kind: emergency ? "emergency" : "standard",
      emergency_months: emergency ? months : undefined, target_amount: targetCents!, starting_amount: startCents!, target_date: targetDate || undefined,
      monthly_amount: monthlyCents ?? undefined, color, archived: goal?.archived ?? false,
    };
    try {
      if (goal) await update.mutateAsync({ id: goal.id, ...body, icon: goal.icon });
      else await create.mutateAsync(body);
      toast.success(t("common.saved"));
      onDone();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(localizeFields(err.fields, t));
      else toast.error(errMsg(err));
    }
  };

  const toggleArchive = async () => {
    if (!goal) return;
    try {
      await update.mutateAsync({ id: goal.id, account_id: goal.account_id, name: goal.name, kind: goal.kind,
        emergency_months: goal.emergency_months ?? undefined, target_amount: goal.target_amount, starting_amount: goal.starting_amount, target_date: goal.target_date ?? undefined,
        monthly_amount: goal.monthly_amount ?? undefined, color: goal.color, icon: goal.icon, archived: !goal.archived });
      onDone();
    } catch (err) { toast.error(errMsg(err)); }
  };
  const removeGoal = async () => {
    if (!goal) return;
    try { await remove.mutateAsync(goal.id); toast.success(t("common.deleted")); onDone(); }
    catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      {emergency && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("savings.form.emergency")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {([3, 6] as const).map((m) => (
              <label key={m} className={cn("flex h-11 cursor-pointer items-center justify-center rounded-[10px] border text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]",
                months === m ? "border-primary bg-primary/10 text-primary" : "border-input")}>
                <input type="radio" name="emergency-months" checked={months === m} onChange={() => setMonths(m)} className="sr-only" />
                {t("savings.form.emergencyMonths", { months: m })}
              </label>
            ))}
          </div>
          {suggestion.data && <p className="text-sm text-muted-foreground">{t("savings.form.emergencyHow", { need: fmt(suggestion.data.monthly_need) })}</p>}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="goal-name">{t("savings.form.name")}</Label>
          <Input id="goal-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          <FieldError message={errors.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-account">{t("savings.form.account")}</Label>
          <select id="goal-account" className={selectClass} value={accountId} disabled={!!goal} onChange={(e) => setAccountId(Number(e.target.value))}>
            {(goal ? accounts : open).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <FieldError message={errors.account_id} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-target">{t("savings.form.target")}</Label>
          <MoneyInput id="goal-target" value={target} onChange={(e) => setTypedTarget(e.target.value)} aria-invalid={!!errors.target_amount} />
          <FieldError message={errors.target_amount} />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline gap-1">
            <Label htmlFor="goal-start">{t("savings.form.startingAmount")}</Label>
            <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
          </div>
          <MoneyInput id="goal-start" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={!!errors.starting_amount} aria-describedby="goal-start-hint" />
          <p id="goal-start-hint" className="text-xs text-muted-foreground">{t("savings.form.startingAmountHint")}</p>
          <FieldError message={errors.starting_amount} />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline gap-1">
            <Label htmlFor="goal-date">{t("savings.form.targetDate")}</Label>
            <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
          </div>
          <Input id="goal-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          <FieldError message={errors.target_date} />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline gap-1">
            <Label htmlFor="goal-monthly">{t("savings.form.monthly")}</Label>
            <span className="text-xs text-muted-foreground">({t("common.optional")})</span>
          </div>
          <MoneyInput id="goal-monthly" value={monthly} onChange={(e) => setMonthly(e.target.value)} aria-invalid={!!errors.monthly_amount} />
          <FieldError message={errors.monthly_amount} />
          {required > 0 && (
            <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={() => setMonthly(centsToInput(required))}>
              {t("savings.form.useRequired", { amount: fmt(required) })}
            </Button>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-color">{t("savings.form.color")}</Label>
          <Input id="goal-color" type="color" className="h-11 w-20 p-1" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        {goal ? (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => void toggleArchive()}>{t(goal.archived ? "savings.unarchive" : "savings.archive")}</Button>
            <ConfirmButton onConfirm={() => void removeGoal()} description={t("savings.deleteGoalConfirm")}>
              <Button type="button" variant="ghost" className="text-destructive">{t("common.delete")}</Button>
            </ConfirmButton>
          </div>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={create.isPending || update.isPending}>{t("common.save")}</Button>
        </div>
      </div>
    </form>
  );
}
