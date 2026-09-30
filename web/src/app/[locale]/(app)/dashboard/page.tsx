"use client";

import { addDays, endOfMonth, min as minDate, startOfMonth, subMonths } from "date-fns";
import { useTranslations } from "next-intl";
import { m, useReducedMotion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import { BudgetMeters } from "@/components/dashboard/budget-meters";
import { QueryError } from "@/components/common/query-error";
import { CardsDebt } from "@/components/dashboard/cards-debt";
import { Greeting } from "@/components/dashboard/greeting";
import { useFormatMoney } from "@/components/common/money";
import { InsightsRow } from "@/components/dashboard/insights-row";
import { HeroAvailable } from "@/components/dashboard/hero-available";
import { KpiChips } from "@/components/dashboard/kpi-cards";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { UpcomingList } from "@/components/dashboard/upcoming-list";
import { ChartSkeleton, ChipsSkeleton, HeroSkeleton, ListSkeleton } from "@/components/common/skeletons";
import { usePathname, useRouter } from "@/i18n/navigation";
import { parseISODate, periodRange, seriesRange, toISODate, toMonthKey, type Period } from "@/lib/dates";
import { useAuth } from "@/lib/auth/auth-provider";
import { computeInsights } from "@/lib/insights";
import { useBreakdown, useCardsOverview, useCategories, useIncomeSources, useSeries, useSummary, useUpcoming } from "@/lib/query/hooks";
import { readJSON, userKey } from "@/lib/storage";
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

  // Insights always look at the real today, independent of the dashboard's anchor date.
  const { user } = useAuth();
  const fmt = useFormatMoney();
  const today = useMemo(() => new Date(), []);
  const prevFrom = startOfMonth(subMonths(today, 1));
  const prevTo = minDate([addDays(prevFrom, today.getDate() - 1), endOfMonth(prevFrom)]);
  const summaryNow = useSummary(toMonthKey(today));
  const catNow = useBreakdown("category", toISODate(startOfMonth(today)), toISODate(today));
  const catPrev = useBreakdown("category", toISODate(prevFrom), toISODate(prevTo));
  const daily = useSeries("day", toISODate(addDays(today, -14)), toISODate(today));
  const incomeSources = useIncomeSources();
  const upcoming = useUpcoming(7);
  const cards = useCardsOverview();
  const onboardingSkipped = useMemo(() => user != null && readJSON(userKey(user.id, "onboarding-skipped"), false), [user]);
  // Hold insights until every input is settled and real: never compute from a placeholder of another range.
  const ready = summaryNow.data && catNow.data && catPrev.data && daily.data && !daily.isPlaceholderData && incomeSources.data && upcoming.data && cards.data;
  const insights = useMemo(
    () => !ready ? [] : computeInsights({
      today, summary: summaryNow.data, upcoming: upcoming.data ?? [], cards: cards.data ?? [], catNow: catNow.data ?? [], catPrev: catPrev.data ?? [],
      daily: daily.data ?? [], hasIncome: (incomeSources.data ?? []).some((s) => s.active), onboardingSkipped,
    }, fmt),
    [ready, today, summaryNow.data, upcoming.data, cards.data, catNow.data, catPrev.data, daily.data, incomeSources.data, onboardingSkipped, fmt],
  );

  const onChange = (p: Period, d: string) => router.replace({ pathname, query: { period: p, date: d } });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <Greeting />
        <PeriodControls period={period} anchor={anchorStr} onChange={onChange} />
      </div>
      {summary.data ? <HeroAvailable summary={summary.data} /> : summary.error ? null : <HeroSkeleton />}
      {summary.error && <p role="alert" className="text-sm text-destructive">{errMsg(summary.error)}</p>}
      {insights.length > 0 && <InsightsRow insights={insights} />}
      {summary.data ? <KpiChips summary={summary.data} spent={spent} period={period} spentStale={current.isPlaceholderData} /> : summary.error ? null : <ChipsSkeleton />}
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Rise index={0} className="min-w-0 lg:col-span-2">
          {series.error ? <QueryError error={series.error} className="h-full rounded-2xl bg-card p-4 shadow-card" /> : series.data ? <SpendingChart points={series.data} period={period} stale={series.isPlaceholderData} /> : <ChartSkeleton />}
        </Rise>
        <Rise index={1}><UpcomingList /></Rise>
      </div>
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Rise index={2}>{byCat.error ? <QueryError error={byCat.error} className="h-full rounded-2xl bg-card p-4 shadow-card" /> : <BreakdownBars title={t("byCategory")} items={byCat.data ?? []} fallbackName={tc("none")} icons={icons} />}</Rise>
        <Rise index={3}>{byPm.error ? <QueryError error={byPm.error} className="h-full rounded-2xl bg-card p-4 shadow-card" /> : <BreakdownBars title={t("byMethod")} items={byPm.data ?? []} fallbackName={t("noMethod")} />}</Rise>
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
