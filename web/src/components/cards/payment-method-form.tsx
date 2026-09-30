"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentMethod, PaymentMethodInput } from "@/lib/api/types";
import { toISODate } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { centsToInput, parseMoney } from "@/lib/money";

const TYPES = ["credit", "debit", "cash", "transfer"] as const;
const NETWORKS = ["visa", "mastercard", "amex", "other"] as const;
const selectCls = "h-9 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-60";

type Values = {
  nickname: string; type: (typeof TYPES)[number]; bank: string; network: string; last4: string; color: string; active: boolean;
  credit_limit: string; statement_day: number; payment_due_day: number; opening_balance: string; opening_balance_date: string;
};

export function PaymentMethodForm({ initial, onSubmit, onCancel }: {
  initial?: Partial<PaymentMethod>;
  onSubmit: (v: PaymentMethodInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const editing = initial?.id !== undefined;
  const schema = useMemo(
    () =>
      z
        .object({
          nickname: z.string().trim().min(1, t("validation.required")).max(60),
          type: z.enum(TYPES),
          bank: z.string().max(60),
          network: z.string(),
          last4: z.string().refine((v) => v === "" || /^\d{4}$/.test(v), t("validation.last4")),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          active: z.boolean(),
          credit_limit: z.string().refine((v) => v.trim() === "" || parseMoney(v) !== null, t("validation.amount")),
          statement_day: z.coerce.number(),
          payment_due_day: z.coerce.number(),
          opening_balance: z.string().refine((v) => v.trim() === "" || parseMoney(v) !== null || /^0+$/.test(v.trim()), t("validation.amount")),
          opening_balance_date: z.string(),
        })
        .superRefine((v, ctx) => {
          if (v.type !== "credit") return;
          for (const k of ["statement_day", "payment_due_day"] as const) {
            if (!Number.isInteger(v[k]) || v[k] < 1 || v[k] > 31) ctx.addIssue({ code: "custom", path: [k], message: t("validation.day") });
          }
        }),
    [t],
  );
  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      nickname: initial?.nickname ?? "",
      type: (initial?.type as Values["type"]) ?? "debit",
      bank: initial?.bank ?? "",
      network: initial?.network ?? "",
      last4: initial?.last4 ?? "",
      color: initial?.color ?? "#64748b",
      active: initial?.active ?? true,
      credit_limit: initial?.credit_limit ? centsToInput(initial.credit_limit) : "",
      statement_day: initial?.statement_day ?? 1,
      payment_due_day: initial?.payment_due_day ?? 20,
      opening_balance: initial?.opening_balance ? centsToInput(initial.opening_balance) : "",
      opening_balance_date: initial?.opening_balance_date ?? toISODate(new Date()),
    },
  });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: "type" });
  const credit = type === "credit";

  const submit = form.handleSubmit(async (v) => {
    const opening = v.opening_balance.trim() === "" ? 0 : parseMoney(v.opening_balance) ?? 0;
    // Generated types mark these pointer fields `T | undefined`; the Go API accepts JSON null (PUT is full-replace, null clears them).
    const input = {
      nickname: v.nickname.trim(), type: v.type, bank: v.bank.trim() || null, network: v.network || null,
      last4: v.last4 || null, color: v.color, active: v.active,
      credit_limit: credit && v.credit_limit.trim() ? parseMoney(v.credit_limit) : null,
      statement_day: credit ? Number(v.statement_day) : null,
      payment_due_day: credit ? Number(v.payment_due_day) : null,
      opening_balance: credit ? opening : 0,
      opening_balance_date: credit ? v.opening_balance_date : null,
    } as unknown as PaymentMethodInput;
    try {
      await onSubmit(input);
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pm-nickname">{t("cards.nickname")}</Label>
          <Input id="pm-nickname" aria-invalid={!!errors.nickname} {...form.register("nickname")} />
          <FieldError message={errors.nickname?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pm-type">{t("cards.type")}</Label>
          <select id="pm-type" className={`${selectCls} ${editing ? "pointer-events-none opacity-60" : ""}`} aria-disabled={editing} tabIndex={editing ? -1 : undefined} {...form.register("type")}>
            {TYPES.map((ty) => <option key={ty} value={ty}>{t(`cards.types.${ty}`)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="pm-bank">{t("cards.bank")}</Label>
          <Input id="pm-bank" {...form.register("bank")} />
          <FieldError message={errors.bank?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pm-network">{t("cards.network")}</Label>
          <select id="pm-network" className={selectCls} {...form.register("network")}>
            <option value="">—</option>
            {NETWORKS.map((n) => <option key={n} value={n}>{n === "other" ? t("cards.networkOther") : n.toUpperCase()}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pm-last4">{t("cards.last4")}</Label>
          <Input id="pm-last4" inputMode="numeric" maxLength={4} autoComplete="off" aria-describedby="pm-last4-hint" aria-invalid={!!errors.last4} {...form.register("last4")} />
          <FieldError message={errors.last4?.message} />
        </div>
      </div>
      <p id="pm-last4-hint" className="text-xs text-muted-foreground">{t("cards.last4Hint")}</p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="pm-color">{t("categories.color")}</Label>
          <input id="pm-color" type="color" className="h-9 w-12 rounded border" {...form.register("color")} />
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("active")} /> {t("common.active")}
          </label>
        )}
      </div>
      {credit && (
        <fieldset className="space-y-4 rounded-lg border p-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pm-limit">{t("cards.creditLimit")}</Label>
              <MoneyInput id="pm-limit" aria-invalid={!!errors.credit_limit} {...form.register("credit_limit")} />
              <FieldError message={errors.credit_limit?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pm-statement">{t("cards.statementDay")}</Label>
              <Input id="pm-statement" type="number" min={1} max={31} aria-invalid={!!errors.statement_day} {...form.register("statement_day")} />
              <FieldError message={errors.statement_day?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pm-due">{t("cards.paymentDueDay")}</Label>
              <Input id="pm-due" type="number" min={1} max={31} aria-invalid={!!errors.payment_due_day} {...form.register("payment_due_day")} />
              <FieldError message={errors.payment_due_day?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pm-opening">{t("cards.openingBalance")}</Label>
              <MoneyInput id="pm-opening" aria-describedby="pm-opening-hint" aria-invalid={!!errors.opening_balance} {...form.register("opening_balance")} />
              <FieldError message={errors.opening_balance?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pm-opening-date">{t("cards.openingBalanceDate")}</Label>
              <Input id="pm-opening-date" type="date" {...form.register("opening_balance_date")} />
            </div>
          </div>
          <p id="pm-opening-hint" className="text-xs text-muted-foreground">{t("cards.openingHint")}</p>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
