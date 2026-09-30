"use client";

import { ArrowDownLeft, Receipt, Repeat, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { createElement, type ReactNode } from "react";
import { useFormatMoney } from "@/components/common/money";
import { FadeInItem, FadeInList } from "@/components/motion/fade-in-list";
import type { Summary } from "@/lib/api/types";
import type { Period } from "@/lib/dates";

export function Chip({ id, icon, label, value, children }: { id: string; icon: LucideIcon; label: string; value: string; children?: ReactNode }) {
  return (
    <FadeInItem as="div" layout={false} className="min-w-0 space-y-1 rounded-2xl bg-card p-3 shadow-card">
      <div data-kpi={id} className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{createElement(icon, { className: "size-3.5", "aria-hidden": true })}</span>
          <p className="min-w-0 text-xs text-muted-foreground">{label}</p>
        </div>
        <p className="num min-w-0 break-words font-display text-lg font-bold md:text-xl">{value}</p>
        {children}
      </div>
    </FadeInItem>
  );
}

export function KpiChips({ summary: s, spent, period }: { summary: Summary; spent: number; period: Period }) {
  const t = useTranslations("dashboard");
  const fmt = useFormatMoney();
  const committed = s.fixed_committed + s.installments;
  return (
    <FadeInList as="div" className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3 md:gap-3">
      <Chip id="income" icon={ArrowDownLeft} label={t("income")} value={fmt(s.income)} />
      <Chip id="fixed" icon={Repeat} label={t("fixed")} value={fmt(committed)}>
        <p className="text-xs text-muted-foreground">{t("fixedDetail", { paid: fmt(s.fixed_paid), pending: fmt(s.fixed_committed - s.fixed_paid) })}</p>
        {s.installments > 0 && <p className="text-xs text-muted-foreground">{t("installments")}: {fmt(s.installments)}</p>}
      </Chip>
      <Chip id="spent" icon={Receipt} label={t(`spent.${period}`)} value={fmt(spent)} />
    </FadeInList>
  );
}

/** Alias kept until every import uses KpiChips. */
export const KpiCards = KpiChips;
