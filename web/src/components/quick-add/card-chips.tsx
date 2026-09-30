"use client";
import { useTranslations } from "next-intl";
import type { PaymentMethod } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const CHIP = "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors";

export function CardChips({ methods, value, onChange }: { methods: PaymentMethod[]; value: number | null; onChange: (id: number | null) => void }) {
  const t = useTranslations("expenses");
  const active = methods.filter((p) => p.active || p.id === value);
  const chip = (selected: boolean) => cn(CHIP, selected ? "border-transparent bg-brand text-brand-foreground" : "bg-surface-raised active:bg-muted");
  return (
    <div role="radiogroup" aria-label={t("paymentMethod")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button type="button" role="radio" aria-checked={value === null} className={chip(value === null)} onClick={() => onChange(null)}>{t("noMethod")}</button>
      {active.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className={chip(value === p.id)} onClick={() => onChange(p.id)}>
          {p.nickname}{p.last4 ? ` ···· ${p.last4}` : ""}
        </button>
      ))}
    </div>
  );
}
