"use client";
import { useTranslations } from "next-intl";
import { useRovingRadio } from "@/hooks/use-roving-radio";
import type { PaymentMethod } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const CHIP = "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors";

export function CardChips({ methods, value, onChange }: { methods: PaymentMethod[]; value: number | null; onChange: (id: number | null) => void }) {
  const t = useTranslations("expenses");
  const active = methods.filter((p) => p.active || p.id === value);
  const values: (number | null)[] = [null, ...active.map((p) => p.id)];
  const { groupRef, itemProps } = useRovingRadio({ values, value, onChange });
  const chip = (selected: boolean) => cn(CHIP, selected ? "border-transparent bg-primary text-primary-foreground" : "bg-surface-raised active:bg-muted");
  return (
    <div ref={groupRef} role="radiogroup" aria-label={t("paymentMethod")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button type="button" role="radio" aria-checked={value === null} className={chip(value === null)} onClick={() => onChange(null)} {...itemProps(0)}>{t("noMethod")}</button>
      {active.map((p, i) => (
        <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className={chip(value === p.id)} onClick={() => onChange(p.id)} {...itemProps(i + 1)}>
          {p.nickname}{p.last4 ? ` ···· ${p.last4}` : ""}
        </button>
      ))}
    </div>
  );
}
