"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/common/confirm-button";
import { EmptyState } from "@/components/common/empty-state";
import { QueryError } from "@/components/common/query-error";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Expense } from "@/lib/api/types";
import { parseISODate } from "@/lib/dates";
import {
  useCategories, useDeleteExpense, useExpenses, usePaymentMethods, useUpdateExpense, type ExpenseFilters,
} from "@/lib/query/hooks";
import { ExpenseForm } from "./expense-form";
import { useErrorMessage } from "@/lib/api/error-messages";

export function ExpenseList({ filters }: { filters: ExpenseFilters }) {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const locale = useLocale();
  const q = useExpenses(filters);
  const { data: categories = [] } = useCategories();
  const { data: methods = [] } = usePaymentMethods();
  const update = useUpdateExpense();
  const remove = useDeleteExpense();
  const [editing, setEditing] = useState<Expense | null>(null);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const pmById = useMemo(() => new Map(methods.map((p) => [p.id, p])), [methods]);
  const rows = q.data?.pages.flatMap((p) => p.items ?? []) ?? [];
  const day = (s: string) => format(parseISODate(s), "EEE d MMM", { locale: locale === "en" ? enUS : es });

  if (q.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (q.isError && rows.length === 0) return <QueryError error={q.error} />;
  if (rows.length === 0) return <EmptyState>{t("expenses.empty")}</EmptyState>;

  const actions = (e: Expense) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label={t("common.edit")} onClick={() => setEditing(e)}><Pencil /></Button>
      <ConfirmButton
        onConfirm={() =>
          remove.mutate(e.id, {
            onSuccess: () => toast.success(t("common.deleted")),
            onError: (err) => toast.error(errMsg(err)),
          })
        }
      >
        <Button variant="ghost" size="icon" aria-label={t("common.delete")}><Trash2 /></Button>
      </ConfirmButton>
    </div>
  );
  const category = (e: Expense) => {
    const c = catById.get(e.category_id);
    return (
      <span className="inline-flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: c?.color }} aria-hidden />
        {c?.name}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* mobile: cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{e.description || catById.get(e.category_id)?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {day(e.spent_on)} · {category(e)}{e.payment_method_id ? ` · ${pmById.get(e.payment_method_id)?.nickname ?? ""}` : ""}
              </p>
            </div>
            <Money cents={e.amount} className="font-medium" />
            {actions(e)}
          </li>
        ))}
      </ul>
      {/* desktop: table */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("expenses.date")}</TableHead>
            <TableHead>{t("expenses.description")}</TableHead>
            <TableHead>{t("expenses.category")}</TableHead>
            <TableHead>{t("expenses.paymentMethod")}</TableHead>
            <TableHead className="text-right">{t("expenses.amount")}</TableHead>
            <TableHead><span className="sr-only">{t("common.actions")}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap">{day(e.spent_on)}</TableCell>
              <TableCell className="max-w-64 truncate">{e.description}</TableCell>
              <TableCell>{category(e)}</TableCell>
              <TableCell>{e.payment_method_id ? pmById.get(e.payment_method_id)?.nickname : "—"}</TableCell>
              <TableCell className="text-right"><Money cents={e.amount} /></TableCell>
              <TableCell>{actions(e)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{t("expenses.loadMore")}</Button>
        </div>
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
