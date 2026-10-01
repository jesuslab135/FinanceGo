"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
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
import type { AccountMovement, SavingsAccount, SavingsGoal } from "@/lib/api/types";
import { celebrate } from "@/lib/celebrate";
import { toISODate } from "@/lib/dates";
import { centsToInput, parseMoney } from "@/lib/money";
import { useCreateMovement, useUpdateMovement } from "@/lib/query/hooks";
import { MOVEMENT_KINDS, type MovementKind } from "@/lib/savings";
import { cn } from "@/lib/utils";
import { selectClass } from "./select-class";

export function MovementForm({ accounts, goals, movement, defaults, onDone, onUpdateValue }: {
  accounts: SavingsAccount[];
  goals: SavingsGoal[];
  movement?: AccountMovement;
  defaults?: { accountId?: number; goalId?: number; kind?: MovementKind };
  onDone: () => void;
  onUpdateValue?: (account: SavingsAccount) => void;
}) {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const create = useCreateMovement();
  const update = useUpdateMovement();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const open = accounts.filter((a) => a.archived_on == null);
  const [kind, setKind] = useState<MovementKind>((movement?.kind as MovementKind) ?? defaults?.kind ?? "deposit");
  const [accountId, setAccountId] = useState<number>(movement?.account_id ?? defaults?.accountId ?? open[0]?.id ?? 0);
  const [toAccountId, setToAccountId] = useState<number>(movement?.to_account_id ?? 0);
  const [goalId, setGoalId] = useState<number>(movement?.goal_id ?? defaults?.goalId ?? 0);
  const [amount, setAmount] = useState(movement ? centsToInput(movement.amount) : "");
  const [date, setDate] = useState(movement?.occurred_on ?? toISODate(new Date()));
  const [note, setNote] = useState(movement?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [overBalance, setOverBalance] = useState(false);
  const transfer = kind === "transfer";
  const accountGoals = goals.filter((g) => g.account_id === accountId && !g.archived);
  const destinations = open.filter((a) => a.id !== accountId);
  const busy = create.isPending || update.isPending;

  const changeAccount = (id: number) => {
    setAccountId(id);
    if (!goals.some((g) => g.id === goalId && g.account_id === id)) setGoalId(0);
    if (toAccountId === id) setToAccountId(0);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverBalance(false);
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) return setErrors({ amount: t("validation.amount") });
    const body = {
      account_id: accountId, kind, amount: cents, occurred_on: date, note: note.trim(),
      to_account_id: transfer ? (toAccountId || destinations[0]?.id) : undefined,
      goal_id: !transfer && goalId ? goalId : undefined,
    };
    const goalBefore = goals.find((g) => g.id === body.goal_id);
    try {
      if (movement) await update.mutateAsync({ id: movement.id, ...body });
      else await create.mutateAsync(body);
      toast.success(t("common.saved"));
      // The mutation awaited the refetch, so the cached goals already show the new status.
      const goalAfter = qc.getQueryData<SavingsGoal[]>(["savings-goals", false])?.find((g) => g.id === body.goal_id);
      if (goalBefore && goalBefore.status !== "achieved" && goalAfter?.status === "achieved") {
        void celebrate("goalAchieved", t("celebrate.goalAchieved", { name: goalAfter.name }), { reduceMotion: reduce ?? undefined });
      }
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === "insufficient_balance") setOverBalance(true);
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(localizeFields(err.fields, t));
      else toast.error(errMsg(err));
    }
  };

  const account = open.find((a) => a.id === accountId);
  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("savings.form.kindLegend")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {MOVEMENT_KINDS.map((k) => (
            <label key={k} className={cn("flex h-11 cursor-pointer items-center justify-center rounded-[10px] border text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]",
              kind === k ? "border-primary bg-primary/10 text-primary" : "border-input")}>
              <input type="radio" name="movement-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {t(`savings.form.${k}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mv-account">{t("savings.form.account")}</Label>
          <select id="mv-account" className={selectClass} value={accountId} onChange={(e) => changeAccount(Number(e.target.value))}>
            {open.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <FieldError message={errors.account_id} />
        </div>
        {transfer ? (
          <div className="space-y-2">
            <Label htmlFor="mv-to">{t("savings.form.toAccount")}</Label>
            <select id="mv-to" className={selectClass} value={toAccountId || destinations[0]?.id || ""} onChange={(e) => setToAccountId(Number(e.target.value))}>
              {destinations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <FieldError message={errors.to_account_id} />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="mv-goal">{t("savings.form.goal")}</Label>
            <select id="mv-goal" className={selectClass} value={goalId} onChange={(e) => setGoalId(Number(e.target.value))}>
              <option value={0}>{t("savings.form.noGoal")}</option>
              {accountGoals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <FieldError message={errors.goal_id} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="mv-amount">{t("savings.form.amount")}</Label>
          <MoneyInput id="mv-amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} />
          <FieldError message={errors.amount} />
          {overBalance && account && onUpdateValue && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{t("savings.form.overBalanceHint")}</span>
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => onUpdateValue(account)}>{t("savings.updateValue")}</Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="mv-date">{t("savings.form.date")}</Label>
          <Input id="mv-date" type="date" value={date} max={toISODate(new Date())} onChange={(e) => setDate(e.target.value)} />
          <FieldError message={errors.occurred_on} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="mv-note">{t("savings.form.note")} ({t("common.optional")})</Label>
        <Input id="mv-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={busy}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
