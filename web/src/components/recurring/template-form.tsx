"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
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

  const submit = form.handleSubmit(async (v) => {
    const base = {
      name: v.name.trim(), amount: parseMoney(v.amount)!, day_of_month: Number(v.day_of_month),
      start_month: v.start_month,
      // Generated types are `T | undefined`; these Go pointer fields accept JSON null (clears the value).
      end_month: (v.end_month || null) as string | undefined, active: initial?.active ?? true,
    };
    try {
      await onSubmit(
        kind === "income"
          ? { ...base, category_id: v.category_id as number | undefined }
          : { ...base, category_id: v.category_id!, payment_method_id: v.payment_method_id as number | undefined },
      );
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m), t);
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="tpl-name">{t("recurring.name")}</Label>
        <Input id="tpl-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tpl-amount">{t("recurring.amount")}</Label>
          <MoneyInput id="tpl-amount" aria-invalid={!!errors.amount} {...form.register("amount")} />
          <FieldError message={errors.amount?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpl-day">{t("recurring.day")}</Label>
          <Input id="tpl-day" type="number" min={1} max={31} inputMode="numeric" aria-describedby="tpl-day-hint" aria-invalid={!!errors.day_of_month} {...form.register("day_of_month")} />
          <p id="tpl-day-hint" className="text-xs text-muted-foreground">{t("recurring.dayHint")}</p>
          <FieldError message={errors.day_of_month?.message} />
        </div>
      </div>
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
      <div className="grid gap-4 sm:grid-cols-2">
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
