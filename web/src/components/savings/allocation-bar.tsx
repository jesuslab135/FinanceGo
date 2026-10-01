"use client";
import { useTranslations } from "next-intl";
import type { SavingsOverview } from "@/lib/api/types";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function AllocationBar({ slices }: { slices: SavingsOverview["allocation"] }) {
  const t = useTranslations("savings");
  if (slices.length === 0) return null;
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
      <h2 className="font-semibold">{t("allocation")}</h2>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
        {slices.map((s, i) => <div key={s.kind} style={{ width: `${s.pct}%`, background: COLORS[i % COLORS.length] }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {slices.map((s, i) => (
          <li key={s.kind} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            {t("allocationItem", { kind: t(`kinds.${s.kind}`), pct: s.pct })}
          </li>
        ))}
      </ul>
    </section>
  );
}
