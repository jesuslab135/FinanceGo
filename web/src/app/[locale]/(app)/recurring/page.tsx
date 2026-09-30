"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { Pencil, Plus, Power, PowerOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryTile } from "@/components/common/category-tile";
import { EmptyState } from "@/components/common/empty-state";
import { ListRow } from "@/components/common/list-row";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { RowMenu } from "@/components/common/row-menu";
import { FadeInItem, FadeInList } from "@/components/motion/fade-in-list";
import { TemplateForm } from "@/components/recurring/template-form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FixedPayment, FixedPaymentInput, IncomeSource, IncomeSourceInput } from "@/lib/api/types";
import { useToday } from "@/hooks/use-today";
import { parseISODate } from "@/lib/dates";
import { nextOccurrence } from "@/lib/recurring";
import {
  useCategories, useCreateFixedPayment, useCreateIncomeSource, useDeactivateFixedPayment, useDeactivateIncomeSource,
  useFixedPayments, useIncomeSources, useUpdateFixedPayment, useUpdateIncomeSource,
} from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";

type Row = (IncomeSource | FixedPayment) & { id: number };

function TemplateList({ rows, onEdit, onToggle, onAdd, addLabel }: {
  rows: Row[]; onEdit: (r: Row) => void; onToggle: (r: Row) => void; onAdd: () => void; addLabel: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const today = useToday();
  const { data: categories = [] } = useCategories();
  if (rows.length === 0) return <EmptyState illustration="recurring" action={<Button size="touch" onClick={onAdd}><Plus /> {addLabel}</Button>}>{t("common.empty")}</EmptyState>;
  return (
    <FadeInList className="space-y-2">
      {rows.map((r) => {
        const cat = categories.find((c) => c.id === r.category_id);
        const next = nextOccurrence(r, today);
        const meta = [
          t("recurring.everyMonth", { day: r.day_of_month }),
          next && t("recurring.next", { date: format(parseISODate(next), "d MMM", { locale: locale === "en" ? enUS : es }) }),
          !r.active && t("common.inactive"),
        ].filter(Boolean).join(" · ");
        return (
          <FadeInItem key={r.id}>
            <ListRow
              muted={!r.active}
              leading={<CategoryTile icon={cat?.icon} color={cat?.color} />}
              title={r.name}
              meta={<span className="whitespace-normal">{meta}</span>}
              amount={<Money cents={r.amount} />}
              trailing={<RowMenu actions={[
                { label: t("common.edit"), icon: Pencil, onSelect: () => onEdit(r) },
                r.active
                  ? { label: t("recurring.deactivate"), icon: PowerOff, onSelect: () => onToggle(r) }
                  : { label: t("common.activate"), icon: Power, onSelect: () => onToggle(r) },
              ]} />}
            />
          </FadeInItem>
        );
      })}
    </FadeInList>
  );
}

export default function RecurringPage() {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const incomes = useIncomeSources();
  const fixed = useFixedPayments();
  const [tab, setTab] = useState<"income" | "fixed">("income");
  const [dialog, setDialog] = useState<{ kind: "income" | "fixed"; row?: Row } | null>(null);
  const createIncome = useCreateIncomeSource();
  const updateIncome = useUpdateIncomeSource();
  const offIncome = useDeactivateIncomeSource();
  const createFixed = useCreateFixedPayment();
  const updateFixed = useUpdateFixedPayment();
  const offFixed = useDeactivateFixedPayment();

  // Deactivating (DELETE) sets end_month to the current month server-side, so reactivation is a
  // full PUT with active=true and end_month=null (the API has no separate endpoint).
  const toggle = (kind: "income" | "fixed", r: Row) => {
    const done = { onSuccess: () => toast.success(t("common.saved")), onError: (e: Error) => toast.error(errMsg(e)) };
    if (r.active) return kind === "income" ? offIncome.mutate(r.id, done) : offFixed.mutate(r.id, done);
    const input = {
      name: r.name, amount: r.amount, day_of_month: r.day_of_month, start_month: r.start_month,
      end_month: null as unknown as string | undefined, // generated type omits null; the API accepts it
      active: true,
    };
    return kind === "income"
      ? updateIncome.mutate({ id: r.id, ...input, category_id: (r as IncomeSource).category_id }, done)
      : updateFixed.mutate({ id: r.id, ...input, category_id: (r as FixedPayment).category_id, payment_method_id: (r as FixedPayment).payment_method_id }, done);
  };

  const title = dialog
    ? dialog.row ? t(dialog.kind === "income" ? "recurring.editIncome" : "recurring.editFixed")
      : t(dialog.kind === "income" ? "recurring.newIncome" : "recurring.newFixed")
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("recurring.title")}</h1>
        <Button size="touch" onClick={() => setDialog({ kind: tab })}>
          <Plus /> {t(tab === "income" ? "recurring.newIncome" : "recurring.newFixed")}
        </Button>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "income" | "fixed")}>
        <TabsList className="h-11 w-full [&>*]:h-full [&>*]:min-w-0 [&>*]:flex-1">
          <TabsTrigger value="income">{t("recurring.incomeSources")}</TabsTrigger>
          <TabsTrigger value="fixed">{t("recurring.fixedPayments")}</TabsTrigger>
        </TabsList>
        <TabsContent value="income" className="pt-4">
          <TemplateList rows={(incomes.data ?? []) as Row[]} onEdit={(row) => setDialog({ kind: "income", row })} onToggle={(r) => toggle("income", r)} onAdd={() => setDialog({ kind: "income" })} addLabel={t("recurring.newIncome")} />
        </TabsContent>
        <TabsContent value="fixed" className="pt-4">
          <TemplateList rows={(fixed.data ?? []) as Row[]} onEdit={(row) => setDialog({ kind: "fixed", row })} onToggle={(r) => toggle("fixed", r)} onAdd={() => setDialog({ kind: "fixed" })} addLabel={t("recurring.newFixed")} />
        </TabsContent>
      </Tabs>
      <ResponsiveDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} title={title}>
        {dialog && (
          <TemplateForm
            kind={dialog.kind}
            initial={dialog.row}
            onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              if (dialog.kind === "income") {
                if (dialog.row) await updateIncome.mutateAsync({ ...(v as IncomeSourceInput), id: dialog.row.id });
                else await createIncome.mutateAsync(v as IncomeSourceInput);
              } else {
                if (dialog.row) await updateFixed.mutateAsync({ ...(v as FixedPaymentInput), id: dialog.row.id });
                else await createFixed.mutateAsync(v as FixedPaymentInput);
              }
              toast.success(t("common.saved"));
              setDialog(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
