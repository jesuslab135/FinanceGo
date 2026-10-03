"use client";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createElement, useState } from "react";
import type { FieldValues, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useErrorMessage } from "@/lib/api/error-messages";
import type { FixedPaymentInput } from "@/lib/api/types";
import { iconFor } from "@/lib/category-icons";
import { toMonthKey } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { parseMoney } from "@/lib/money";
import { categoryForIcon, FIXED_SUGGESTIONS } from "@/lib/onboarding";
import { useCategories, useCreateFixedPayment, useDeactivateFixedPayment, useUpdateFixedPayment } from "@/lib/query/hooks";
import { cn } from "@/lib/utils";
import { StepActions } from "./progress";

type RowErrors = { name?: string; amount?: string; day?: string; form?: string };
export type FixedRow = { key: string; name: string; categoryIcon: string; custom: boolean; amount: string; day: string; savedId?: number; errors: RowErrors };
export type FixedDraft = { rows: FixedRow[]; removedIds: number[]; customCount: number };

const chipCls = "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";
const FIELD_TO_ERROR: Record<string, keyof RowErrors> = { name: "name", amount: "amount", day_of_month: "day" };

export function StepFixed({ draft, onChange, onBack, onDone, today }: {
  draft: FixedDraft; onChange: (d: FixedDraft) => void; onBack: () => void; onDone: () => void; today: Date;
}) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const categories = useCategories();
  const create = useCreateFixedPayment();
  const update = useUpdateFixedPayment();
  const deactivate = useDeactivateFixedPayment();
  const [busy, setBusy] = useState(false);

  // Removing a row that was already saved (the user came back to this step) deactivates it on the next Continue.
  const remove = (row: FixedRow) =>
    onChange({ ...draft, rows: draft.rows.filter((r) => r.key !== row.key), removedIds: row.savedId !== undefined ? [...draft.removedIds, row.savedId] : draft.removedIds });
  const toggle = (s: (typeof FIXED_SUGGESTIONS)[number]) => {
    const existing = draft.rows.find((r) => r.key === s.key);
    if (existing) return remove(existing);
    onChange({ ...draft, rows: [...draft.rows, { key: s.key, name: t(s.labelKey), categoryIcon: s.categoryIcon, custom: false, amount: "", day: "1", errors: {} }] });
  };
  const addCustom = () =>
    onChange({ ...draft, customCount: draft.customCount + 1, rows: [...draft.rows, { key: `custom-${draft.customCount}`, name: "", categoryIcon: "tag", custom: true, amount: "", day: "1", errors: {} }] });
  const patch = (key: string, p: Partial<FixedRow>) =>
    onChange({ ...draft, rows: draft.rows.map((r) => (r.key === key ? { ...r, ...p, errors: {} } : r)) });

  const submit = async () => {
    if (busy) return;
    // Validate everything first so all problems show at once.
    let invalid = false;
    const checked = draft.rows.map((r) => {
      const errors: RowErrors = {};
      const cents = parseMoney(r.amount);
      const day = Number(r.day);
      if (!r.name.trim()) errors.name = t("validation.required");
      if (!cents) errors.amount = t("validation.amount");
      if (!Number.isInteger(day) || day < 1 || day > 31) errors.day = t("validation.day");
      if (Object.keys(errors).length) invalid = true;
      return { r, errors, cents, day };
    });
    if (invalid) {
      onChange({ ...draft, rows: checked.map((c) => ({ ...c.r, errors: c.errors })) });
      return;
    }
    setBusy(true);
    const cats = categories.data ?? [];
    const results = await Promise.allSettled(
      checked.map(({ r, cents, day }) => {
        // Generated types are `T | undefined`; the Go API takes JSON null for these pointer fields.
        const body = {
          name: r.name.trim(), amount: cents, day_of_month: day, start_month: toMonthKey(today),
          category_id: categoryForIcon(cats, r.categoryIcon), payment_method_id: null, active: true, end_month: null,
        } as unknown as FixedPaymentInput;
        return r.savedId !== undefined ? update.mutateAsync({ id: r.savedId, ...body }) : create.mutateAsync(body);
      }),
    );
    const removals = await Promise.allSettled(draft.removedIds.map((id) => deactivate.mutateAsync(id)));
    setBusy(false);

    // Keep what was saved (so a retry updates instead of duplicating) and show failures under their row.
    let failed = false;
    const rows = draft.rows.map((r, i) => {
      const res = results[i];
      if (res.status === "fulfilled") return { ...r, savedId: res.value.id, errors: {} };
      failed = true;
      const errors: RowErrors = {};
      const setError = ((field: string, err: { message?: string }) => {
        errors[FIELD_TO_ERROR[field] ?? "form"] = err.message;
      }) as UseFormSetError<FieldValues>;
      applyApiError(res.reason, setError, (m) => { errors.form = m; }, t);
      return { ...r, errors };
    });
    const leftover = draft.removedIds.filter((_, i) => removals[i].status === "rejected");
    const firstRemovalError = removals.find((x) => x.status === "rejected");
    if (firstRemovalError) toast.error(errorMessage(firstRemovalError.reason));
    onChange({ ...draft, rows, removedIds: leftover });
    if (!failed && !leftover.length) onDone();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {FIXED_SUGGESTIONS.map((s) => {
          const on = draft.rows.some((r) => r.key === s.key);
          return (
            <button key={s.key} type="button" aria-pressed={on} onClick={() => toggle(s)} className={cn(chipCls, on ? "border-primary bg-primary text-primary-foreground" : "bg-surface-raised")}>
              {createElement(iconFor(s.icon), { className: "size-4", "aria-hidden": true })}
              {t(s.labelKey)}
            </button>
          );
        })}
        <button type="button" onClick={addCustom} className={cn(chipCls, "border-dashed bg-surface-raised")}>{t("welcome.customFixed")}</button>
      </div>
      <ul className="space-y-3">
        {draft.rows.map((r) => {
          const label = r.name || t("welcome.customName");
          return (
            <li key={r.key} className="space-y-2 rounded-2xl border bg-card p-3">
              <div className="flex items-center gap-2">
                {r.custom ? (
                  <Input value={r.name} placeholder={t("welcome.customName")} aria-label={t("welcome.customName")} aria-invalid={!!r.errors.name} onChange={(e) => patch(r.key, { name: e.target.value })} />
                ) : (
                  <span className="flex-1 text-sm font-medium">{r.name}</span>
                )}
                {r.custom && (
                  <Button type="button" variant="ghost" className="size-11 shrink-0 p-0" aria-label={t("welcome.removeRow", { name: label })} onClick={() => remove(r)}>
                    <X className="size-4" />
                  </Button>
                )}
              </div>
              <FieldError message={r.errors.name} />
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <MoneyInput aria-label={`${label}: ${t("welcome.amount")}`} aria-invalid={!!r.errors.amount} value={r.amount} onChange={(e) => patch(r.key, { amount: e.target.value })} />
                  <FieldError message={r.errors.amount} />
                </div>
                <div className="w-20 space-y-1">
                  <Input type="number" inputMode="numeric" min={1} max={31} aria-label={`${label}: ${t("welcome.day")}`} aria-invalid={!!r.errors.day} value={r.day} onChange={(e) => patch(r.key, { day: e.target.value })} />
                  <FieldError message={r.errors.day} />
                </div>
              </div>
              <FieldError message={r.errors.form} />
            </li>
          );
        })}
      </ul>
      <StepActions onBack={onBack}>
        <Button type="button" className="min-h-11 px-6" disabled={busy || categories.isPending} onClick={() => void submit()}>{t("welcome.continue")}</Button>
      </StepActions>
    </div>
  );
}
