"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CategorySelect } from "@/components/common/category-select";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { PaymentMethodSelect } from "@/components/common/payment-method-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FixedPayment, FixedPaymentInput, IncomeSource, IncomeSourceInput } from "@/lib/api/types";
import { toMonthKey } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { centsToInput, parseMoney } from "@/lib/money";
import { useToday } from "@/hooks/use-today";
import { useFormatMoney } from "@/components/common/money";
import { monthlyEstimate } from "@/lib/recurring";
import { PayScheduleField, scheduleErrors, scheduleFromSource, scheduleInput, type ScheduleErrors } from "./pay-schedule-field";

type Kind = "income" | "fixed";
type Values = {
  name: string; amount: string; day_of_month: number; start_month: string; end_month: string;
  category_id: number | null; payment_method_id: number | null;
};

export function TemplateForm({ kind, initial, onSubmit, onCancel }: {
  kind: Kind;
  initial?: Partial<IncomeSource & FixedPayment>;
  onSubmit: (v: IncomeSourceInput | FixedPaymentInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const today = useToday();
  // Income picks its pay schedule in PayScheduleField; fixed payments keep the plain day of the month.
  const [schedule, setSchedule] = useState(() => scheduleFromSource(kind === "income" ? initial : undefined));
  const [scheduleErr, setScheduleErr] = useState<ScheduleErrors>({});
  const [savedSchedule] = useState(() => JSON.stringify(schedule));
  // Editing an existing income's schedule rewrites pending rows; say so before saving.
  const scheduleChanged = kind === "income" && initial?.id !== undefined && JSON.stringify(schedule) !== savedSchedule;
  const fmt = useFormatMoney();
  const [more, setMore] = useState(() => !!initial?.end_month);
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, t("validation.required")).max(80),
          amount: z.string().refine((v) => parseMoney(v) !== null, t("validation.amount")),
          day_of_month: z.coerce.number().int().min(1, t("validation.day")).max(31, t("validation.day")),
          start_month: z.string().regex(/^\d{4}-\d{2}$/, t("validation.required")),
          end_month: z.string(),
          category_id: z.number().nullable(),
          payment_method_id: z.number().nullable(),
        })
        .refine((v) => kind === "income" || v.category_id !== null, { path: ["category_id"], message: t("validation.required") })
        .refine((v) => !v.end_month || v.end_month >= v.start_month, { path: ["end_month"], message: t("validation.endBeforeStart") }),
    [t, kind],
  );
  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      name: initial?.name ?? "",
      amount: initial?.amount ? centsToInput(initial.amount) : "",
      day_of_month: initial?.day_of_month ?? 1,
      start_month: initial?.start_month ?? toMonthKey(new Date()),
      end_month: initial?.end_month ?? "",
      category_id: initial?.category_id ?? null,
      payment_method_id: initial?.payment_method_id ?? null,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const cents = parseMoney(useWatch({ control: form.control, name: "amount" }));
  const showMore = more || !!errors.start_month || !!errors.end_month;

  const checkSchedule = () => {
    const e = kind === "income" ? scheduleErrors(schedule) : {};
    setScheduleErr(e);
    return Object.keys(e).length === 0;
  };
  const submit = form.handleSubmit(async (v) => {
    if (!checkSchedule()) return;
    const base = {
      name: v.name.trim(), amount: parseMoney(v.amount)!, day_of_month: Number(v.day_of_month),
      start_month: v.start_month,
      // Generated types are `T | undefined`; these Go pointer fields accept JSON null (clears the value).
      end_month: (v.end_month || null) as string | undefined, active: initial?.active ?? true,
    };
    try {
      await onSubmit(
        kind === "income"
          ? ({ ...base, ...scheduleInput(schedule, today), category_id: v.category_id } as unknown as IncomeSourceInput)
          : { ...base, category_id: v.category_id!, payment_method_id: v.payment_method_id as number | undefined },
      );
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m), t);
    }
  });

  return (
    <form onSubmit={(e) => { checkSchedule(); void submit(e); }} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="tpl-name">{t("recurring.name")}</Label>
        <Input id="tpl-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tpl-amount">{t(kind === "income" ? "schedule.amountPerPayment" : "recurring.amount")}</Label>
          <MoneyInput id="tpl-amount" aria-invalid={!!errors.amount} {...form.register("amount")} />
          {kind === "income" && cents !== null && cents > 0 && schedule.frequency !== "monthly" && (
            <p className="text-xs text-muted-foreground">{t("schedule.perMonth", { amount: fmt(monthlyEstimate(cents, schedule.frequency)) })}</p>
          )}
          <FieldError message={errors.amount?.message} />
        </div>
        {kind === "fixed" && (
          <div className="space-y-2">
            <Label htmlFor="tpl-day">{t("recurring.day")}</Label>
            <Input id="tpl-day" type="number" min={1} max={31} inputMode="numeric" aria-describedby="tpl-day-hint" aria-invalid={!!errors.day_of_month} {...form.register("day_of_month")} />
            <p id="tpl-day-hint" className="text-xs text-muted-foreground">{t("recurring.dayHint")}</p>
            <FieldError message={errors.day_of_month?.message} />
          </div>
        )}
      </div>
      {kind === "income" && <PayScheduleField collapsible value={schedule} errors={scheduleErr} onChange={(v) => { setScheduleErr({}); setSchedule(v); }} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tpl-category">{t("expenses.category")}</Label>
          <Controller
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <CategorySelect id="tpl-category" kind={kind === "income" ? "income" : "expense"} value={field.value} onChange={field.onChange} invalid={!!errors.category_id} />
            )}
          />
          <FieldError message={errors.category_id?.message} />
        </div>
        {kind === "fixed" && (
          <div className="space-y-2">
            <Label htmlFor="tpl-pm">{t("expenses.paymentMethod")}</Label>
            <Controller
              control={form.control}
              name="payment_method_id"
              render={({ field }) => <PaymentMethodSelect id="tpl-pm" value={field.value} onChange={field.onChange} />}
            />
          </div>
        )}
      </div>
      {scheduleChanged && <p role="status" className="rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">{t("schedule.editNote")}</p>}
      <button type="button" aria-expanded={showMore} className="min-h-11 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline" onClick={() => setMore(!showMore)}>
        {t(showMore ? "schedule.lessOptions" : "schedule.moreOptions")}
      </button>
      <div hidden={!showMore} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tpl-start">{t("recurring.startMonth")}</Label>
          <Input id="tpl-start" type="month" aria-invalid={!!errors.start_month} {...form.register("start_month")} />
          <FieldError message={errors.start_month?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpl-end">{t("recurring.endMonth")} ({t("common.optional")})</Label>
          <Input id="tpl-end" type="month" aria-describedby="tpl-end-hint" {...form.register("end_month")} />
          <p id="tpl-end-hint" className="text-xs text-muted-foreground">{t("recurring.endMonthHint")}</p>
          <FieldError message={errors.end_month?.message} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
