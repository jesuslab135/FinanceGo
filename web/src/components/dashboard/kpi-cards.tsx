"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useFormatMoney } from "@/components/common/money";
import type { Summary } from "@/lib/api/types";
import type { Period } from "@/lib/dates";
import { cn } from "@/lib/utils";

function Tile({ id, label, value, children, valueClass }: { id: string; label: string; value: string; children?: ReactNode; valueClass?: string }) {
  return (
    <div data-kpi={id} className="space-y-1 rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold", valueClass)}>{value}</p>
      {children}
    </div>
  );
}

export function KpiCards({ summary: s, spent, period }: { summary: Summary; spent: number; period: Period }) {
  const t = useTranslations("dashboard");
  const fmt = useFormatMoney();
  const negative = s.available < 0;
  const committed = s.fixed_committed + s.installments;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile id="income" label={t("income")} value={fmt(s.income)} />
      <Tile id="fixed" label={t("fixed")} value={fmt(committed)}>
        <p className="text-xs text-muted-foreground">{t("fixedDetail", { paid: fmt(s.fixed_paid), pending: fmt(s.fixed_committed - s.fixed_paid) })}</p>
        {s.installments > 0 && <p className="text-xs text-muted-foreground">{t("installments")}: {fmt(s.installments)}</p>}
      </Tile>
      <Tile id="spent" label={t(`spent.${period}`)} value={fmt(spent)} />
      <Tile id="available" label={t("available")} value={fmt(s.available)} valueClass={negative ? "text-critical" : undefined}>
        {negative ? (
          <p className="flex items-center gap-1 text-sm font-medium text-critical">
            <AlertTriangle className="size-4" aria-hidden />
            {t("overspent")}
          </p>
        ) : (
          s.safe_to_spend_per_day != null && (
            <p className="text-xs text-muted-foreground">
              {t("safeToSpend", { amount: fmt(s.safe_to_spend_per_day), days: s.days_remaining ?? 0 })}
            </p>
          )
        )}
      </Tile>
    </div>
  );
}
