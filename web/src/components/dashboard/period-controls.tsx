"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toISODate, type Period } from "@/lib/dates";

export function PeriodControls({ period, anchor, onChange }: { period: Period; anchor: string; onChange: (p: Period, anchor: string) => void }) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Tabs value={period} onValueChange={(v) => onChange(v as Period, anchor)}>
        <TabsList>
          {(["day", "week", "month"] as const).map((p) => (
            <TabsTrigger key={p} value={p}>{t(`dashboard.period.${p}`)}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
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
