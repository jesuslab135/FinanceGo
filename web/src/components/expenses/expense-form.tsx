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
import type { Expense, ExpenseInput } from "@/lib/api/types";
import { toISODate } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { centsToInput, parseMoney } from "@/lib/money";

type Values = { amount: string; category_id: number | null; payment_method_id: number | null; description: string; spent_on: string };

export function ExpenseForm({ initial, onSubmit, onCancel }: {
  initial?: Partial<Expense>;
  onSubmit: (v: ExpenseInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const schema = useMemo(
    () =>
      z.object({
        amount: z.string().refine((v) => parseMoney(v) !== null, t("validation.amount")),
        category_id: z.number().nullable().refine((v) => v !== null, t("validation.required")),
        payment_method_id: z.number().nullable(),
        description: z.string().max(200, t("validation.max200")),
        spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("validation.required")),
      }),
    [t],
  );
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: initial?.amount ? centsToInput(initial.amount) : "",
      category_id: initial?.category_id ?? null,
      payment_method_id: initial?.payment_method_id ?? null,
      description: initial?.description ?? "",
      spent_on: initial?.spent_on ?? toISODate(new Date()),
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSubmit({
        amount: parseMoney(v.amount)!,
        category_id: v.category_id!,
        // Generated type is `number | undefined`; the Go pointer field accepts JSON null (clears the method).
        payment_method_id: v.payment_method_id as number | undefined,
        description: v.description.trim(),
        spent_on: v.spent_on,
      });
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="expense-amount">{t("expenses.amount")}</Label>
        <MoneyInput id="expense-amount" autoFocus aria-invalid={!!errors.amount} aria-describedby="expense-amount-error" {...form.register("amount")} />
        <FieldError id="expense-amount-error" message={errors.amount?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="expense-category">{t("expenses.category")}</Label>
          <Controller
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <CategorySelect id="expense-category" kind="expense" value={field.value} onChange={field.onChange} invalid={!!errors.category_id} />
            )}
          />
          <FieldError id="expense-category-error" message={errors.category_id?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-method">{t("expenses.paymentMethod")}</Label>
          <Controller
            control={form.control}
            name="payment_method_id"
            render={({ field }) => <PaymentMethodSelect id="expense-method" value={field.value} onChange={field.onChange} />}
          />
          <FieldError id="expense-method-error" message={errors.payment_method_id?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="expense-date">{t("expenses.date")}</Label>
          <Input id="expense-date" type="date" aria-invalid={!!errors.spent_on} {...form.register("spent_on")} />
          <FieldError id="expense-date-error" message={errors.spent_on?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-description">{t("expenses.description")}</Label>
          <Input id="expense-description" maxLength={200} {...form.register("description")} />
          <FieldError id="expense-description-error" message={errors.description?.message} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
