"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { Keypad } from "@/components/quick-add/keypad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IncomeSourceInput } from "@/lib/api/types";
import { toMonthKey } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { useCategories, useCreateIncomeSource, useUpdateIncomeSource } from "@/lib/query/hooks";
import { cn } from "@/lib/utils";
import { StepActions } from "./progress";

export type IncomeDraft = { name: string; cents: number; day: number; savedId?: number };
const PAYDAYS = [1, 5, 10, 15, 20, 25, 30];
const HIGHLIGHT = new Set([15, 30]);

export function StepIncome({ draft, onChange, onDone, today }: {
  draft: IncomeDraft; onChange: (d: IncomeDraft) => void; onDone: () => void; today: Date;
}) {
  const t = useTranslations();
  const categories = useCategories();
  const create = useCreateIncomeSource();
  const update = useUpdateIncomeSource();
  const form = useForm();
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;
  const [other, setOther] = useState(() => !PAYDAYS.includes(draft.day));
  const [busy, setBusy] = useState(false);

  const setDay = (day: number) => { form.clearErrors("day_of_month"); onChange({ ...draft, day }); };

  const submit = async () => {
    if (busy) return;
    form.clearErrors();
    const name = draft.name.trim();
    let bad = false;
    if (!name) { form.setError("name", { message: t("validation.required") }); bad = true; }
    if (draft.cents <= 0) { form.setError("amount", { message: t("validation.amount") }); bad = true; }
    if (!Number.isInteger(draft.day) || draft.day < 1 || draft.day > 31) { form.setError("day_of_month", { message: t("validation.day") }); bad = true; }
    if (bad) return;
    const categoryId = categories.data?.find((c) => c.kind === "income" && c.icon === "briefcase")?.id;
    // Generated types are `T | undefined`; the Go API takes JSON null for a missing end month.
    const body = {
      name, amount: draft.cents, day_of_month: draft.day, start_month: toMonthKey(today),
      category_id: categoryId, active: true, end_month: null,
    } as unknown as IncomeSourceInput;
    setBusy(true);
    try {
      // Coming back to this step must not create a second income source.
      const saved = draft.savedId !== undefined ? await update.mutateAsync({ id: draft.savedId, ...body }) : await create.mutateAsync(body);
      onChange({ ...draft, savedId: saved.id });
      onDone();
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m), t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="welcome-income-name">{t("welcome.incomeName")}</Label>
        <Input id="welcome-income-name" value={draft.name} aria-invalid={!!errors.name} onChange={(e) => { form.clearErrors("name"); onChange({ ...draft, name: e.target.value }); }} />
        <FieldError message={errors.name?.message} />
      </div>
      <div>
        <Keypad cents={draft.cents} onChange={(cents) => { form.clearErrors("amount"); onChange({ ...draft, cents }); }} onSubmit={() => void submit()} />
        <div className="text-center"><FieldError message={errors.amount?.message} /></div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("welcome.payday")}</legend>
        <div className="flex flex-wrap gap-2">
          {PAYDAYS.map((d) => {
            const on = !other && draft.day === d;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => { setOther(false); setDay(d); }}
                className={cn(
                  "min-h-11 min-w-11 rounded-full border px-3 text-sm font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]",
                  on ? "border-primary bg-primary text-primary-foreground" : HIGHLIGHT.has(d) ? "border-brand/60 bg-brand/10" : "bg-surface-raised",
                )}
              >
                {d}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={other}
            onClick={() => setOther(true)}
            className={cn("min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]", other ? "border-primary bg-primary text-primary-foreground" : "bg-surface-raised")}
          >
            {t("welcome.other")}
          </button>
        </div>
        {other && (
          <Input
            type="number" inputMode="numeric" min={1} max={31} className="w-28" aria-label={t("welcome.otherDay")}
            aria-invalid={!!errors.day_of_month} value={Number.isFinite(draft.day) ? draft.day : ""}
            onChange={(e) => setDay(e.target.value === "" ? NaN : Number(e.target.value))}
          />
        )}
        <FieldError message={errors.day_of_month?.message} />
      </fieldset>
      <StepActions>
        <Button type="button" className="min-h-11 px-6" disabled={busy || categories.isPending} onClick={() => void submit()}>{t("welcome.continue")}</Button>
      </StepActions>
    </div>
  );
}
