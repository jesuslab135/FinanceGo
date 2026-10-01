"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { Money } from "@/components/common/money";
import { HeroAvailable } from "@/components/dashboard/hero-available";
import type { Summary } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import { celebrate, shouldCelebrateMonth } from "@/lib/celebrate";
import { parseMonthKey, toMonthKey } from "@/lib/dates";
import { readJSON, userKey, writeJSON } from "@/lib/storage";

/** Month hero (Available; a negative one is flagged with an icon and a label, not by color alone) plus recap chips. */
export function MonthSummary({ s }: { s: Summary }) {
  const t = useTranslations();
  const locale = useLocale();
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const userId = user?.id;
  const celebrateNow = shouldCelebrateMonth(s, toMonthKey(new Date()));

  // Once per closed month per user; the flag is written before the burst so a re-run never repeats it.
  useEffect(() => {
    if (!celebrateNow || userId === undefined) return;
    const key = userKey(userId, "celebrated-months");
    const seen = readJSON<string[]>(key, []);
    if (!Array.isArray(seen) || seen.includes(s.month)) return;
    writeJSON(key, [...seen, s.month]);
    const month = format(parseMonthKey(s.month), "LLLL yyyy", { locale: locale === "en" ? enUS : es });
    void celebrate("monthUnderBudget", t("celebrate.monthUnderBudget", { month }), { reduceMotion: reduce ?? undefined });
  }, [celebrateNow, userId, s.month, locale, reduce, t]);

  return (
    <div className="space-y-3">
      <HeroAvailable summary={s} />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-5 [&>*]:min-w-0">
        {([
          ["dashboard.income", s.income],
          ["dashboard.fixed", s.fixed_committed],
          ["dashboard.installments", s.installments],
          ["dashboard.spent.month", s.spent],
          ["dashboard.saved", s.saved],
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
