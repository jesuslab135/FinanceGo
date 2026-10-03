"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { CategorySelect } from "@/components/common/category-select";
import { PaymentMethodSelect } from "@/components/common/payment-method-select";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ExpenseList } from "@/components/expenses/expense-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { periodRange } from "@/lib/dates";
import { useCreateExpense } from "@/lib/query/hooks";

export default function ExpensesPage() {
  const t = useTranslations();
  const month = periodRange("month", new Date());
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [methodId, setMethodId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [creating, setCreating] = useState(false);
  const create = useCreateExpense();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("expenses.title")}</h1>
        <Button onClick={() => setCreating(true)}><Plus /> {t("expenses.new")}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="f-from">{t("common.from")}</Label>
          <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-to">{t("common.to")}</Label>
          <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-cat">{t("expenses.category")}</Label>
          <div className="flex gap-1">
            <CategorySelect id="f-cat" kind="expense" value={categoryId} onChange={setCategoryId} placeholder={t("common.all")} />
            {categoryId && <Button variant="ghost" size="sm" aria-label={t("common.all")} onClick={() => setCategoryId(null)}>×</Button>}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-pm">{t("expenses.paymentMethod")}</Label>
          <PaymentMethodSelect id="f-pm" value={methodId} onChange={setMethodId} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-q">{t("common.search")}</Label>
          <Input id="f-q" type="search" placeholder={t("expenses.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <ExpenseList
        filters={{
          from: from || undefined, to: to || undefined, q: q || undefined,
          category_id: categoryId ?? undefined, payment_method_id: methodId ?? undefined,
        }}
      />
      <ResponsiveDialog open={creating} onOpenChange={setCreating} title={t("expenses.new")}>
        <ExpenseForm
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            await create.mutateAsync(v);
            toast.success(t("common.saved"));
            setCreating(false);
          }}
        />
      </ResponsiveDialog>
    </div>
  );
}
