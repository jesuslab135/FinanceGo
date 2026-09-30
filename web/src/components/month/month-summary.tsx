"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Money } from "@/components/common/money";
import { cn } from "@/lib/utils";

type Totals = { income?: number; fixed_committed?: number; installments?: number; spent?: number; available?: number };

/** Month totals; a negative Available is flagged with an icon and a label, not by color alone. */
export function MonthSummary({ s }: { s: Totals }) {
  const t = useTranslations();
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5 [&>*]:min-w-0">
      {([
        ["dashboard.income", s.income],
        ["dashboard.fixed", s.fixed_committed],
        ["dashboard.installments", s.installments],
        ["dashboard.spent.month", s.spent],
        ["dashboard.available", s.available],
      ] as const).map(([k, v]) => {
        const overspent = k === "dashboard.available" && (v ?? 0) < 0;
        return (
          <div key={k} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{t(k)}</dt>
            <dd className={cn("break-words text-lg font-semibold", overspent && "text-critical")}>
              <Money cents={v ?? 0} />
            </dd>
            {overspent && (
              <dd className="flex items-center gap-1 text-xs font-medium text-critical">
                <AlertTriangle className="size-3.5" aria-hidden />
                {t("dashboard.overspent")}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
