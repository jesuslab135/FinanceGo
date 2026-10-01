"use client";
import { useTranslations } from "next-intl";
import { Meter } from "@/components/common/meter";
import { useFormatMoney } from "@/components/common/money";
import { ProgressRing } from "@/components/savings/progress-ring";
import { Link } from "@/i18n/navigation";
import type { SavingsGoal, SavingsOverview } from "@/lib/api/types";

/** Goals with the nearest target date first; goals without a date after them, by progress. */
function nearest(goals: SavingsGoal[]): SavingsGoal[] {
  return [...goals]
    .filter((g) => g.status !== "achieved")
    .sort((a, b) => (a.target_date ?? "9999") < (b.target_date ?? "9999") ? -1 : (a.target_date ?? "9999") > (b.target_date ?? "9999") ? 1 : b.pct - a.pct)
    .slice(0, 2);
}

export function SavingsCard({ overview: o, goals }: { overview: SavingsOverview; goals: SavingsGoal[] }) {
  const t = useTranslations("savings");
  const fmt = useFormatMoney();
  return (
    <section className="h-full space-y-4 rounded-2xl bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("title")}</h2>
        <Link href="/savings" className="text-sm font-medium text-primary hover:underline dark:text-brand">{t("seeAll")}</Link>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{t("netWorth")}</p>
        <p className="num font-display text-2xl font-bold">{fmt(o.net_worth)}</p>
      </div>
      {o.month.planned > 0 && (
        <Meter value={o.month.deposited} max={o.month.planned} label={t("savedOfPlanned", { saved: fmt(o.month.deposited), planned: fmt(o.month.planned) })} />
      )}
      <ul className="space-y-2">
        {nearest(goals).map((g) => (
          <li key={g.id} className="flex items-center gap-3">
            <ProgressRing size={40} pct={g.pct} color={g.color} label={t("progressLabel", { name: g.name, pct: g.pct })} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
