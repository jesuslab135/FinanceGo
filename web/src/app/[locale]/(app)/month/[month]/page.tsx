"use client";

import { useTranslations } from "next-intl";
import { notFound, useParams } from "next/navigation";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { MonthNav } from "@/components/common/month-nav";
import { EntryRow } from "@/components/month/entry-row";
import { MonthSummary } from "@/components/month/month-summary";
import type { Entry } from "@/lib/api/types";
import { useMonthEntries, useSummary } from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";

export default function MonthPage() {
  const { month } = useParams<{ month: string }>();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const entries = useMonthEntries(month);
  const summary = useSummary(month);

  const groups: Array<[string, Entry[]]> = [
    [t("month.income"), (entries.data ?? []).filter((e) => e.kind === "income")],
    [t("month.fixed"), (entries.data ?? []).filter((e) => e.kind === "fixed")],
    [t("month.installments"), (entries.data ?? []).filter((e) => e.kind === "installment")],
  ];
  const s = summary.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("month.title")}</h1>
        <MonthNav month={month} basePath="/month" />
      </div>
      {s && <MonthSummary s={s} />}
      {entries.error && <p role="alert" className="text-sm text-destructive">{errMsg(entries.error)}</p>}
      {entries.data?.length === 0 && <EmptyState>{t("month.empty")}</EmptyState>}
      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <section key={title} className="space-y-2">
            <h2 className="flex justify-between text-sm font-medium text-muted-foreground">
              <span>{title}</span>
              <Money cents={list.filter((e) => e.status !== "skipped").reduce((a, e) => a + e.amount, 0)} />
            </h2>
            <ul className="space-y-2">{list.map((e) => <EntryRow key={e.id} entry={e} />)}</ul>
          </section>
        ),
      )}
    </div>
  );
}
