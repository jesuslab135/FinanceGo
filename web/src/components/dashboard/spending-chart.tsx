"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFormatMoney } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SeriesPoint } from "@/lib/api/types";
import { parseISODate, type Period } from "@/lib/dates";
import { intlLocale } from "@/lib/money";
import { duration } from "@/lib/motion";

export function SpendingChart({ points, period }: { points: SeriesPoint[]; period: Period }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const fmt = useFormatMoney();
  const [asTable, setAsTable] = useState(false);
  const reduce = useReducedMotion();
  const dfLocale = locale === "en" ? enUS : es;
  const label = (s: string) => format(parseISODate(s), period === "month" ? "MMM yy" : "d MMM", { locale: dfLocale });
  const compact = new Intl.NumberFormat(intlLocale(locale), { notation: "compact", maximumFractionDigits: 1 });
  const names: Record<string, string> = { expenses: t("expensesSeries"), committed: t("committedSeries") };
  const empty = points.every((p) => p.expenses === 0 && p.committed === 0);

  return (
    <section className="h-full space-y-3 rounded-2xl bg-card p-4 shadow-card md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold">{t("spending")}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-1" aria-hidden />{names.expenses}</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-2" aria-hidden />{names.committed}</span>
          <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)}>{asTable ? t("showChart") : t("showTable")}</Button>
        </div>
      </div>
      {asTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("periodColumn")}</TableHead>
              <TableHead className="text-right">{names.expenses}</TableHead>
              <TableHead className="text-right">{names.committed}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((p) => (
              <TableRow key={p.start}>
                <TableCell>{label(p.start)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(p.expenses)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(p.committed)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : empty ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <AnimatePresence mode="wait">
          <m.div key={period} className="h-64" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : duration.small }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="start" tickFormatter={label} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }}
                  tick={{ fill: "var(--chart-axis)", fontSize: 12 }} minTickGap={12} />
                <YAxis tickFormatter={(v: number) => compact.format(v / 100)} tickLine={false} axisLine={false}
                  tick={{ fill: "var(--chart-axis)", fontSize: 12 }} width={48} />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={({ active, payload, label: key }) =>
                    active && payload?.length ? (
                      <div className="min-w-44 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow">
                        <p className="mb-1 font-medium">{label(String(key))}</p>
                        {payload.map((p) => (
                          <p key={String(p.dataKey)} className="flex items-center gap-2">
                            <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
                            {names[String(p.dataKey)]}
                            <span className="ml-auto tabular-nums">{fmt(Number(p.value))}</span>
                          </p>
                        ))}
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="expenses" stackId="s" isAnimationActive={!reduce} animationDuration={500} animationEasing="ease-out" fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
                <Bar dataKey="committed" stackId="s" isAnimationActive={!reduce} animationBegin={120} animationDuration={500} animationEasing="ease-out" fill="var(--chart-2)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </m.div>
        </AnimatePresence>
      )}
    </section>
  );
}
