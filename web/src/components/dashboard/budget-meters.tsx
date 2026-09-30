"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatMoney } from "@/components/common/money";
import { MeterFill } from "@/components/common/meter";

type Budget = { category_id: number; name: string; color: string; limit: number; spent: number; pct: number };

export function budgetStatus(pct: number): "ok" | "warn" | "over" {
  if (pct > 100) return "over";
  if (pct >= 80) return "warn";
  return "ok";
}

const STYLE = {
  ok: { Icon: CheckCircle2, bar: "bg-good", text: "text-foreground" },
  warn: { Icon: AlertTriangle, bar: "bg-warning", text: "text-foreground" },
  over: { Icon: XCircle, bar: "bg-critical", text: "text-critical" },
} as const;

export function BudgetMeters({ budgets }: { budgets: Budget[] }) {
  const t = useTranslations("dashboard");
  const fmt = useFormatMoney();
  return (
    <section className="h-full min-w-0 space-y-3 rounded-2xl bg-card p-4 shadow-card md:p-5">
      <h2 className="font-display text-base font-bold">{t("budgets")}</h2>
      {budgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <ul className="space-y-3">
          {budgets.map((b, i) => {
            const status = budgetStatus(b.pct);
            const { Icon, bar, text } = STYLE[status];
            return (
              <li key={b.category_id} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-x-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span className="size-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
                    {b.name}
                  </span>
                  <span className="ml-auto break-words text-right tabular-nums text-muted-foreground">{fmt(b.spent)} / {fmt(b.limit)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={b.limit} aria-valuenow={b.spent} aria-label={b.name}>
                  <MeterFill pct={Math.min(100, b.pct)} index={i} className={bar} />
                </div>
                <p className={`flex items-center gap-1 text-xs ${text}`}>
                  <Icon className={`size-3.5 ${status === "ok" ? "text-good" : status === "over" ? "text-critical" : "text-warning"}`} aria-hidden /> <span>{t(`budgetStatus.${status}`)}</span> · <span className="tabular-nums">{b.pct}%</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
