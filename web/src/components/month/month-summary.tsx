"use client";

import { useTranslations } from "next-intl";
import { Money } from "@/components/common/money";
import { HeroAvailable } from "@/components/dashboard/hero-available";
import type { Summary } from "@/lib/api/types";

/** Month hero (Available; a negative one is flagged with an icon and a label, not by color alone) plus recap chips. */
export function MonthSummary({ s }: { s: Summary }) {
  const t = useTranslations();
  return (
    <div className="space-y-3">
      <HeroAvailable summary={s} />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3 [&>*]:min-w-0">
        {([
          ["dashboard.income", s.income],
          ["dashboard.fixed", s.fixed_committed],
          ["dashboard.installments", s.installments],
          ["dashboard.spent.month", s.spent],
        ] as const).map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-card p-3 shadow-card">
            <dt className="text-xs text-muted-foreground">{t(k)}</dt>
            <dd className="num break-words font-display text-lg font-bold"><Money cents={v} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
