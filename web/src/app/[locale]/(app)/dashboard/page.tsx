"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import { BudgetMeters } from "@/components/dashboard/budget-meters";
import { QueryError } from "@/components/common/query-error";
import { CardsDebt } from "@/components/dashboard/cards-debt";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { UpcomingList } from "@/components/dashboard/upcoming-list";
import { Skeleton } from "@/components/ui/skeleton";
import { usePathname, useRouter } from "@/i18n/navigation";
import { parseISODate, periodRange, seriesRange, toISODate, toMonthKey, type Period } from "@/lib/dates";
import { useBreakdown, useCategories, useSeries, useSummary } from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <PeriodControls period={period} anchor={anchorStr} onChange={onChange} />
      </div>
      {summary.data ? <KpiCards summary={summary.data} spent={spent} period={period} /> : <Skeleton className="h-28 w-full" />}
      {summary.error && <p role="alert" className="text-sm text-destructive">{errMsg(summary.error)}</p>}
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="min-w-0 lg:col-span-2">
          {series.error ? <QueryError error={series.error} className="rounded-xl border p-4" /> : series.data ? <SpendingChart points={series.data} period={period} /> : <Skeleton className="h-80 w-full" />}
        </div>
        <UpcomingList />
      </div>
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        {byCat.error ? <QueryError error={byCat.error} className="rounded-xl border p-4" /> : <BreakdownBars title={t("byCategory")} items={byCat.data ?? []} fallbackName={tc("none")} icons={icons} />}
        {byPm.error ? <QueryError error={byPm.error} className="rounded-xl border p-4" /> : <BreakdownBars title={t("byMethod")} items={byPm.data ?? []} fallbackName={t("noMethod")} />}
      </div>
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <BudgetMeters budgets={summary.data?.budgets ?? []} />
        <CardsDebt />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Dashboard />
    </Suspense>
  );
}
