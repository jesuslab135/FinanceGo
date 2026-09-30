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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InstallmentPlan, InstallmentPlanInput } from "@/lib/api/types";
import { toISODate } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { centsToInput, parseMoney } from "@/lib/money";

type Values = { description: string; total_amount: string; installments: number; purchased_on: string; category_id: number | null };

export function PlanForm({ cardId, initial, onSubmit, onCancel }: {
  cardId: number; initial?: InstallmentPlan; onSubmit: (v: InstallmentPlanInput) => Promise<void>; onCancel?: () => void;
}) {
  const t = useTranslations();
  const schema = useMemo(
    () =>
      z.object({
        description: z.string().trim().min(1, t("validation.required")).max(120),
        total_amount: z.string().refine((v) => parseMoney(v) !== null, t("validation.amount")),
        installments: z.coerce.number().int().min(2, t("validation.installments")).max(48, t("validation.installments")),
        purchased_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("validation.required")),
        category_id: z.number().nullable().refine((v) => v !== null, t("validation.required")),
      }),
    [t],
  );
  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      description: initial?.description ?? "",
      total_amount: initial ? centsToInput(initial.total_amount) : "",
      installments: initial?.installments ?? 12,
      purchased_on: initial?.purchased_on ?? toISODate(new Date()),
      category_id: initial?.category_id ?? null,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSubmit({
        payment_method_id: cardId, category_id: v.category_id!, description: v.description.trim(),
        total_amount: parseMoney(v.total_amount)!, installments: Number(v.installments), purchased_on: v.purchased_on,
      });
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m), t);
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="plan-desc">{t("expenses.description")}</Label>
        <Input id="plan-desc" aria-invalid={!!errors.description} {...form.register("description")} />
        <FieldError message={errors.description?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="plan-total">{t("cards.totalAmount")}</Label>
          <MoneyInput id="plan-total" aria-invalid={!!errors.total_amount} {...form.register("total_amount")} />
          <FieldError message={errors.total_amount?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-n">{t("cards.installments")}</Label>
          <Input id="plan-n" type="number" min={2} max={48} list="plan-n-common" aria-invalid={!!errors.installments} {...form.register("installments")} />
          <datalist id="plan-n-common">{[3, 6, 9, 12, 18, 24].map((n) => <option key={n} value={n} />)}</datalist>
          <FieldError message={errors.installments?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="plan-date">{t("cards.purchasedOn")}</Label>
          <Input id="plan-date" type="date" {...form.register("purchased_on")} />
          <FieldError message={errors.purchased_on?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-cat">{t("expenses.category")}</Label>
          <Controller control={form.control} name="category_id" render={({ field }) => (
            <CategorySelect id="plan-cat" kind="expense" value={field.value} onChange={field.onChange} invalid={!!errors.category_id} />
          )} />
          <FieldError message={errors.category_id?.message} />
        </div>
      </div>
      <FieldError message={errors.root?.message} />
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
