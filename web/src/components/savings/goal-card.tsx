"use client";
import { useTranslations } from "next-intl";
import { useFormatMoney } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import type { SavingsGoal } from "@/lib/api/types";
import type { GoalStatus } from "@/lib/savings";
import { cn } from "@/lib/utils";
import { ProgressRing } from "./progress-ring";

const chipTone: Record<GoalStatus, string> = {
  achieved: "bg-[color-mix(in_srgb,var(--good)_16%,transparent)]",
  ahead: "bg-[color-mix(in_srgb,var(--good)_16%,transparent)]",
  on_track: "bg-[color-mix(in_srgb,var(--good)_16%,transparent)]",
  behind: "bg-[color-mix(in_srgb,var(--warning)_22%,transparent)]",
  no_date: "bg-muted",
};

export function GoalCard({ goal: g, onContribute, onOpen }: {
  goal: SavingsGoal; onContribute: (g: SavingsGoal) => void; onOpen: (g: SavingsGoal) => void;
}) {
  const t = useTranslations("savings");
  const fmt = useFormatMoney();
  const status = g.status as GoalStatus;
  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card">
      <button type="button" onClick={() => onOpen(g)} className="flex items-center gap-3 text-left">
        <ProgressRing pct={g.pct} color={g.color} label={t("progressLabel", { name: g.name, pct: g.pct })} />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="truncate font-semibold">{g.name}</h3>
          <p className="num text-sm text-muted-foreground">{t("progressOf", { progress: fmt(g.progress), target: fmt(g.target_amount) })}</p>
        </div>
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground", chipTone[status])}>
          {t(`status.${status}`, { amount: fmt(g.behind_by ?? 0) })}
        </span>
        {g.required_monthly != null && status !== "achieved" && (
          <span className="num text-xs text-muted-foreground">{t("requiredMonthly", { amount: fmt(g.required_monthly) })}</span>
        )}
      </div>
      {status !== "achieved" && (
        <Button size="touch" variant="outline" onClick={() => onContribute(g)}>{t("contribute")}</Button>
      )}
    </article>
  );
}
