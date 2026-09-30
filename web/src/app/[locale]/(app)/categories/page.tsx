"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { BudgetField } from "@/components/categories/budget-field";
import { CategoryForm } from "@/components/categories/category-form";
import { CategorySelect } from "@/components/common/category-select";
import { CategoryTile } from "@/components/common/category-tile";
import { Meter } from "@/components/common/meter";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { RowMenu } from "@/components/common/row-menu";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/errors";
import type { Category } from "@/lib/api/types";
import {
  useBudgets, useCategories, useCreateCategory, useDeleteCategory, useSummary, useUpdateCategory,
} from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";

export default function CategoriesPage() {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const { data: categories = [] } = useCategories();
  const budgetsQuery = useBudgets();
  const budgets = budgetsQuery.data ?? [];
  const summary = useSummary();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [dialog, setDialog] = useState<{ cat?: Category } | null>(null);
  const [reassign, setReassign] = useState<{ cat: Category; to: number | null } | null>(null);

  const tryDelete = (cat: Category) =>
    remove.mutate({ id: cat.id }, {
      onSuccess: () => toast.success(t("common.deleted")),
      onError: (e) => (e instanceof ApiError && e.code === "category_in_use" ? setReassign({ cat, to: null }) : toast.error(errMsg(e))),
    });

  const progress = new Map((summary.data?.budgets ?? []).map((b) => [b.category_id, b]));

  const section = (kind: "expense" | "income") => (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{t(`categories.kinds.${kind}`)}</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-0">
        {categories.filter((c) => c.kind === kind).map((c) => {
          const limit = budgets.find((b) => b.category_id === c.id)?.monthly_limit;
          const spent = progress.get(c.id)?.spent ?? 0;
          return (
            <li key={c.id} className="relative flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-1">
                <CategoryTile icon={c.icon} color={c.color} size="lg" />
                <div className="-mr-2 -mt-2">
                  <RowMenu actions={[
                    { label: t("common.edit"), icon: Pencil, onSelect: () => setDialog({ cat: c }) },
                    { label: t("common.delete"), icon: Trash2, destructive: true, onSelect: () => tryDelete(c) },
                  ]} />
                </div>
              </div>
              <p className="break-words font-display font-bold leading-tight">{c.name}</p>
              {kind === "expense" && budgetsQuery.isSuccess && (
                <div className="mt-auto space-y-2">
                  <BudgetField key={`${c.id}-${limit ?? "none"}`} category={c} limit={limit} />
                  {limit !== undefined && <Meter value={spent} max={limit} label={t("dashboard.spent.month")} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("categories.title")}</h1>
        <Button size="touch" onClick={() => setDialog({})}><Plus /> {t("categories.new")}</Button>
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
                    onError: (e) => toast.error(errMsg(e)),
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
