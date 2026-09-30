"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { BudgetField } from "@/components/categories/budget-field";
import { CategoryForm } from "@/components/categories/category-form";
import { CategorySelect } from "@/components/common/category-select";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/errors";
import type { Category } from "@/lib/api/types";
import {
  useBudgets, useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory,
} from "@/lib/query/hooks";

export default function CategoriesPage() {
  const t = useTranslations();
  const { data: categories = [] } = useCategories();
  const budgetsQuery = useBudgets();
  const budgets = budgetsQuery.data ?? [];
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [dialog, setDialog] = useState<{ cat?: Category } | null>(null);
  const [reassign, setReassign] = useState<{ cat: Category; to: number | null } | null>(null);

  const tryDelete = (cat: Category) =>
    remove.mutate({ id: cat.id }, {
      onSuccess: () => toast.success(t("common.deleted")),
      onError: (e) => (e instanceof ApiError && e.code === "category_in_use" ? setReassign({ cat, to: null }) : toast.error(e.message)),
    });

  const section = (kind: "expense" | "income") => (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{t(`categories.kinds.${kind}`)}</h2>
      <ul className="space-y-2">
        {categories.filter((c) => c.kind === kind).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {kind === "expense" && budgetsQuery.isSuccess && (() => {
              const limit = budgets.find((b) => b.category_id === c.id)?.monthly_limit;
              return <BudgetField key={`${c.id}-${limit ?? "none"}`} category={c} limit={limit} />;
            })()}
            <Button size="icon" variant="ghost" aria-label={t("common.edit")} onClick={() => setDialog({ cat: c })}><Pencil /></Button>
            <Button size="icon" variant="ghost" aria-label={t("common.delete")} onClick={() => tryDelete(c)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("categories.title")}</h1>
        <Button onClick={() => setDialog({})}><Plus /> {t("categories.new")}</Button>
      </div>
      {section("expense")}
      {section("income")}
      <ResponsiveDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} title={t(dialog?.cat ? "categories.edit" : "categories.new")}>
        {dialog && (
          <CategoryForm
            initial={dialog.cat}
            onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              if (dialog.cat) await update.mutateAsync({ id: dialog.cat.id, ...v });
              else await create.mutateAsync(v);
              toast.success(t("common.saved"));
              setDialog(null);
            }}
          />
        )}
      </ResponsiveDialog>
      <ResponsiveDialog open={!!reassign} onOpenChange={(o) => !o && setReassign(null)} title={t("common.confirmTitle")}>
        {reassign && (
          <div className="space-y-4">
            <p className="text-sm">{t("categories.inUse")}</p>
            <Label htmlFor="reassign-to">{t("categories.reassignTo")}</Label>
            <CategorySelect id="reassign-to" exclude={reassign.cat.id} kind={reassign.cat.kind as "expense" | "income"} value={reassign.to} onChange={(to) => setReassign({ ...reassign, to })} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReassign(null)}>{t("common.cancel")}</Button>
              <Button
                variant="destructive"
                disabled={!reassign.to || reassign.to === reassign.cat.id}
                onClick={() =>
                  remove.mutate({ id: reassign.cat.id, reassignTo: reassign.to! }, {
                    onSuccess: () => { toast.success(t("common.deleted")); setReassign(null); },
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </div>
  );
}
