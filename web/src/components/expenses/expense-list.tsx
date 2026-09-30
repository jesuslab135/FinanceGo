"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CategoryTile } from "@/components/common/category-tile";
import { EmptyState } from "@/components/common/empty-state";
import { ListRow } from "@/components/common/list-row";
import { Money } from "@/components/common/money";
import { QueryError } from "@/components/common/query-error";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { RowMenu, type RowAction } from "@/components/common/row-menu";
import { SwipeRow } from "@/components/common/swipe-row";
import { FadeInItem, FadeInList } from "@/components/motion/fade-in-list";
import { Button } from "@/components/ui/button";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import type { Expense } from "@/lib/api/types";
import { parseISODate } from "@/lib/dates";
import {
  useCategories, useDeleteExpense, useExpenses, usePaymentMethods, useUpdateExpense, type ExpenseFilters,
} from "@/lib/query/hooks";
import { ExpenseForm } from "./expense-form";
import { QuickAdd } from "./quick-add";

export function ExpenseList({ filters }: { filters: ExpenseFilters }) {
  const t = useTranslations();
  const locale = useLocale();
  const q = useExpenses(filters);
  const { data: categories = [] } = useCategories();
  const { data: methods = [] } = usePaymentMethods();
  const update = useUpdateExpense();
  const remove = useDeleteExpense();
  const [editing, setEditing] = useState<Expense | null>(null);
  // `repeating` outlives the close so the dialog can animate out; `repeatOpen` drives visibility.
  const [repeating, setRepeating] = useState<Expense | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const { hidden, request } = useUndoableDelete({ remove: (id) => remove.mutateAsync(id) });

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const pmById = useMemo(() => new Map(methods.map((p) => [p.id, p])), [methods]);
  const rows = useMemo(() => (q.data?.pages.flatMap((p) => p.items ?? []) ?? []).filter((e) => !hidden.has(e.id)), [q.data, hidden]);
  const groups = useMemo(() => {
    const byDay = new Map<string, Expense[]>();
    for (const e of rows) byDay.set(e.spent_on, [...(byDay.get(e.spent_on) ?? []), e]);
    return [...byDay];
  }, [rows]);
  const dayLabel = (s: string) =>
    locale === "en"
      ? format(parseISODate(s), "EEEE, MMMM d", { locale: enUS })
      : format(parseISODate(s), "EEEE d 'de' MMMM", { locale: es });

  if (q.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (q.isError && rows.length === 0) return <QueryError error={q.error} />;
  if (rows.length === 0) return <EmptyState illustration="expenses" action={<QuickAdd variant="button" />}>{t("expenses.empty")}</EmptyState>;

  const actionsFor = (e: Expense): RowAction[] => [
    { label: t("common.edit"), icon: Pencil, onSelect: () => setEditing(e) },
    { label: t("quickAdd.repeat"), icon: Copy, onSelect: () => { setRepeating(e); setRepeatOpen(true); } },
    { label: t("common.delete"), icon: Trash2, destructive: true, onSelect: () => request(e.id, t("common.deleted")) },
  ];

  return (
    <div className="space-y-4">
      {groups.map(([spentOn, items]) => (
        <section key={spentOn}>
          <h3 className="sticky top-0 z-10 flex items-baseline justify-between bg-background/90 py-2 text-sm backdrop-blur">
            <span className="font-medium capitalize">{dayLabel(spentOn)}</span>
            <span className="text-xs text-muted-foreground">
              {t("expenses.dayTotal")} <Money cents={items.reduce((a, e) => a + e.amount, 0)} className="font-semibold text-foreground" />
            </span>
          </h3>
          <FadeInList className="space-y-2">
            {items.map((e) => {
              const c = catById.get(e.category_id);
              const method = e.payment_method_id ? pmById.get(e.payment_method_id)?.nickname : undefined;
              const actions = actionsFor(e);
              return (
                <FadeInItem key={e.id}>
                  <SwipeRow actions={actions}>
                    <ListRow
                      leading={<CategoryTile icon={c?.icon} color={c?.color} size="md" />}
                      title={e.description || c?.name}
                      meta={[c?.name, method].filter(Boolean).join(" · ")}
                      amount={<Money cents={e.amount} />}
                      trailing={<RowMenu actions={actions} />}
                    />
                  </SwipeRow>
                </FadeInItem>
              );
            })}
          </FadeInList>
        </section>
      ))}
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{t("expenses.loadMore")}</Button>
        </div>
      )}
      {repeating && (
        <QuickAdd
          variant="none"
          open={repeatOpen}
          onOpenChange={setRepeatOpen}
          prefill={{
            amount: repeating.amount,
            category_id: repeating.category_id,
            payment_method_id: repeating.payment_method_id ?? undefined,
            description: repeating.description,
          }}
        />
      )}
      <ResponsiveDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={t("expenses.edit")}>
        {editing && (
          <ExpenseForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              await update.mutateAsync({ id: editing.id, ...v });
              toast.success(t("common.saved"));
              setEditing(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
