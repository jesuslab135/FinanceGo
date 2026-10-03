"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { notFound, useParams } from "next/navigation";
import { useId, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { MonthNav } from "@/components/common/month-nav";
import { EntryRow } from "@/components/month/entry-row";
import { MonthSummary } from "@/components/month/month-summary";
import type { Entry } from "@/lib/api/types";
import { duration, ease } from "@/lib/motion";
import { useMonthEntries, useSummary } from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";
import { cn } from "@/lib/utils";

/** Collapsible group of entries: the header shows the total and stays visible when the list is hidden. */
function EntrySection({ title, list }: { title: string; list: Entry[] }) {
  const t = useTranslations();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);
  const id = useId();
  const total = list.filter((e) => e.status !== "skipped").reduce((a, e) => a + e.amount, 0);
  return (
    <section className="space-y-2">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl text-sm font-medium text-muted-foreground"
        >
          <span className="flex min-w-0 items-center gap-1">
            <ChevronDown aria-hidden className={cn("size-4 shrink-0 transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
            <span className="sr-only">{t("month.collapse", { section: title })}</span>
            <span aria-hidden className="truncate">{title}</span>
          </span>
          <Money cents={total} />
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={id}
            key="body"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: duration.small, ease: ease.enter }}
            className="overflow-hidden"
          >
            <ul className="space-y-2 pb-1">{list.map((e) => <EntryRow key={e.id} entry={e} />)}</ul>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}

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
      {entries.data?.length === 0 && <EmptyState illustration="month">{t("month.empty")}</EmptyState>}
      {groups.map(([title, list]) => (list.length === 0 ? null : <EntrySection key={title} title={title} list={list} />))}
    </div>
  );
}
