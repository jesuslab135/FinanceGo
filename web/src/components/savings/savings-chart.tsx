"use client";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFormatMoney } from "@/components/common/money";
import type { SavingsPoint } from "@/lib/api/types";
import { parseMonthKey } from "@/lib/dates";

export function SavingsChart({ points }: { points: SavingsPoint[] }) {
  const t = useTranslations("savings");
  const fmt = useFormatMoney();
  const locale = useLocale();
  const label = (m: string) => format(parseMonthKey(m), "LLL", { locale: locale === "en" ? enUS : es });
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
      <h2 className="font-semibold">{t("chartTitle")}</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ left: 8, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={label} stroke="var(--chart-axis)" fontSize={12} />
            <YAxis tickFormatter={(v: number) => fmt(v).replace(/\.00$/, "")} stroke="var(--chart-axis)" fontSize={12} width={72} />
            <Tooltip formatter={(v) => fmt(Number(v))} labelFormatter={(m) => label(String(m))} />
            <Legend />
            <Line type="monotone" dataKey="value" name={t("chartValue")} stroke="var(--chart-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="put_in" name={t("chartPutIn")} stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
