"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/motion/segmented";
import { toISODate, type Period } from "@/lib/dates";

export function PeriodControls({ period, anchor, onChange }: { period: Period; anchor: string; onChange: (p: Period, anchor: string) => void }) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Segmented
        ariaLabel={t("dashboard.periodLabel")}
        value={period}
        onChange={(p) => onChange(p, anchor)}
        options={(["day", "week", "month"] as const).map((p) => ({ value: p, label: t(`dashboard.period.${p}`) }))}
      />
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="anchor" className="sr-only">{t("dashboard.anchor")}</Label>
          <Input id="anchor" type="date" className="w-40" value={anchor} onChange={(e) => e.target.value && onChange(period, e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => onChange(period, toISODate(new Date()))}>{t("common.today")}</Button>
      </div>
    </div>
  );
}
