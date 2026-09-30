"use client";

import { useTranslations } from "next-intl";
import { m, useReducedMotion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import { BudgetMeters } from "@/components/dashboard/budget-meters";
import { QueryError } from "@/components/common/query-error";
import { CardsDebt } from "@/components/dashboard/cards-debt";
import { Greeting } from "@/components/dashboard/greeting";
import { HeroAvailable } from "@/components/dashboard/hero-available";
import { KpiChips } from "@/components/dashboard/kpi-cards";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { UpcomingList } from "@/components/dashboard/upcoming-list";
import { ChartSkeleton, ChipsSkeleton, HeroSkeleton, ListSkeleton } from "@/components/common/skeletons";
import { usePathname, useRouter } from "@/i18n/navigation";
import { parseISODate, periodRange, seriesRange, toISODate, toMonthKey, type Period } from "@/lib/dates";
import { useBreakdown, useCategories, useSeries, useSummary } from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";
import { riseIn } from "@/lib/motion";

/** Dashboard section that rises in, staggered by position. Fade only under reduced motion. */
function Rise({ index, className, children }: { index: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <m.div className={`h-full ${className ?? ""}`} initial={reduce ? false : riseIn.initial} animate={riseIn.animate}
      transition={reduce ? { duration: 0 } : { ...riseIn.transition, delay: index * 0.04 }}>
      {children}
    </m.div>
  );
}

function Dashboard() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const errMsg = useErrorMessage();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawPeriod = sp.get("period");
  const period: Period = rawPeriod === "day" || rawPeriod === "week" ? rawPeriod : "month";
  const rawDate = sp.get("date") ?? "";
  const anchorStr = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : toISODate(new Date());
  const anchor = parseISODate(anchorStr);
  const pr = periodRange(period, anchor);
  const sr = seriesRange(period, anchor);

  const summary = useSummary(toMonthKey(anchor));
  const current = useSeries(period, pr.from, pr.to);
  const series = useSeries(period, sr.from, sr.to);
  const { data: categories = [] } = useCategories();
  const icons = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.icon])), [categories]);
  const byCat = useBreakdown("category", pr.from, pr.to);
  const byPm = useBreakdown("payment_method", pr.from, pr.to);
  const spent = (current.data ?? []).reduce((a, p) => a + p.expenses, 0);

  const onChange = (p: Period, d: string) => router.replace({ pathname, query: { period: p, date: d } });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <Greeting />
        <PeriodControls period={period} anchor={anchorStr} onChange={onChange} />
      </div>
      {summary.data ? <HeroAvailable summary={summary.data} /> : summary.error ? null : <HeroSkeleton />}
      {summary.error && <p role="alert" className="text-sm text-destructive">{errMsg(summary.error)}</p>}
      <div id="insights-slot" />
      {summary.data ? <KpiChips summary={summary.data} spent={spent} period={period} /> : summary.error ? null : <ChipsSkeleton />}
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Rise index={0} className="min-w-0 lg:col-span-2">
          {series.error ? <QueryError error={series.error} className="rounded-2xl bg-card p-4 shadow-card" /> : series.data ? <SpendingChart points={series.data} period={period} /> : <ChartSkeleton />}
        </Rise>
        <Rise index={1}><UpcomingList /></Rise>
      </div>
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Rise index={2}>{byCat.error ? <QueryError error={byCat.error} className="rounded-2xl bg-card p-4 shadow-card" /> : <BreakdownBars title={t("byCategory")} items={byCat.data ?? []} fallbackName={tc("none")} icons={icons} />}</Rise>
        <Rise index={3}>{byPm.error ? <QueryError error={byPm.error} className="rounded-2xl bg-card p-4 shadow-card" /> : <BreakdownBars title={t("byMethod")} items={byPm.data ?? []} fallbackName={t("noMethod")} />}</Rise>
      </div>
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Rise index={4}><BudgetMeters budgets={summary.data?.budgets ?? []} /></Rise>
        <Rise index={5}><CardsDebt /></Rise>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="space-y-6"><HeroSkeleton /><ChipsSkeleton /><ListSkeleton rows={3} /></div>}>
      <Dashboard />
    </Suspense>
  );
}
