"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { Keypad } from "@/components/quick-add/keypad";
import { PayScheduleField, scheduleErrors, scheduleInput, type ScheduleDraft, type ScheduleErrors } from "@/components/recurring/pay-schedule-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IncomeSourceInput } from "@/lib/api/types";
import { toMonthKey } from "@/lib/dates";
import { useAuth } from "@/lib/auth/auth-provider";
import { markOnboardingSettled } from "@/lib/onboarding";
import { applyApiError } from "@/lib/forms";
import { useCategories, useCreateIncomeSource, useUpdateIncomeSource } from "@/lib/query/hooks";
import { StepActions } from "./progress";

export type IncomeDraft = { name: string; cents: number; schedule: ScheduleDraft; savedId?: number };

export function StepIncome({ draft, onChange, onDone, today }: {
  draft: IncomeDraft; onChange: (d: IncomeDraft) => void; onDone: () => void; today: Date;
}) {
  const t = useTranslations();
  const categories = useCategories();
  const create = useCreateIncomeSource();
  const update = useUpdateIncomeSource();
  const { user } = useAuth();
  const form = useForm();
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;
  const [scheduleErr, setScheduleErr] = useState<ScheduleErrors>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    form.clearErrors();
    const name = draft.name.trim();
    let bad = false;
    if (!name) { form.setError("name", { message: t("validation.required") }); bad = true; }
    if (draft.cents <= 0) { form.setError("amount", { message: t("validation.amount") }); bad = true; }
    const sErr = scheduleErrors(draft.schedule);
    setScheduleErr(sErr);
    if (Object.keys(sErr).length > 0) bad = true;
    if (bad) return;
    const categoryId = categories.data?.find((c) => c.kind === "income" && c.icon === "briefcase")?.id;
    // Generated types are `T | undefined`; the Go API takes JSON null for a missing end month.
    const body = {
      name, amount: draft.cents, ...scheduleInput(draft.schedule, today), start_month: toMonthKey(today),
      category_id: categoryId, active: true, end_month: null,
    } as unknown as IncomeSourceInput;
    setBusy(true);
    try {
      // Coming back to this step must not create a second income source.
      const saved = draft.savedId !== undefined ? await update.mutateAsync({ id: draft.savedId, ...body }) : await create.mutateAsync(body);
      // A saved income means /welcome is done with this user even if the refetch that follows fails.
      if (user) markOnboardingSettled(user.id);
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
        <p className="pt-2 text-center text-xs text-muted-foreground">{t("schedule.perPayment")}</p>
        <div className="text-center"><FieldError message={errors.amount?.message} /></div>
      </div>
      <PayScheduleField value={draft.schedule} errors={scheduleErr} onChange={(schedule) => { setScheduleErr({}); onChange({ ...draft, schedule }); }} />
      <StepActions>
        <Button type="button" className="min-h-11 px-6" disabled={busy || categories.isPending} onClick={() => void submit()}>{t("welcome.continue")}</Button>
      </StepActions>
    </div>
  );
}
