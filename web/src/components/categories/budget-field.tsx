"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/common/money-input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/lib/api/types";
import { centsToInput, parseMoney } from "@/lib/money";
import { useDeleteBudget, usePutBudget } from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";

export function BudgetField({ category, limit }: { category: Category; limit?: number }) {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const put = usePutBudget();
  const del = useDeleteBudget();
  const [value, setValue] = useState(limit !== undefined ? centsToInput(limit) : "");
  const opts = {
    onSuccess: () => toast.success(t("common.saved")),
    onError: (e: Error) => toast.error(errMsg(e)),
  };
  const save = () => {
    if (value.trim() === "") {
      if (limit !== undefined) del.mutate(category.id, opts);
      return;
    }
    const cents = parseMoney(value);
    if (cents === null) return toast.error(t("validation.amount"));
    if (cents !== limit) put.mutate({ categoryId: category.id, limit: cents }, opts);
  };
  return (
    <div className="w-full">
      <Label htmlFor={`budget-${category.id}`} className="sr-only">{t("categories.budgetFor", { name: category.name })}</Label>
      <MoneyInput id={`budget-${category.id}`} placeholder={t("categories.noBudget")} value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} />
    </div>
  );
}
