"use client";

import { useTranslations } from "next-intl";
import { CategoryTile } from "@/components/common/category-tile";
import { useFormatMoney } from "@/components/common/money";
import type { BreakdownItem } from "@/lib/api/types";

const TOP = 7;

export function BreakdownBars({ title, items, fallbackName, identityDots = true, icons }: { title: string; items: BreakdownItem[]; fallbackName: string; identityDots?: boolean; icons?: Record<number, string> }) {
  const t = useTranslations("dashboard");
  const fmt = useFormatMoney();
  const rest = items.slice(TOP).reduce((a, i) => a + i.amount, 0);
  const rows = rest > 0 ? [...items.slice(0, TOP), { id: undefined, name: t("other"), color: "#94a3b8", amount: rest }] : items;
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r, i) => {
            const name = r.name || fallbackName;
            const pct = total ? Math.round((r.amount / total) * 100) : 0;
            return (
              <li key={`${r.id ?? "none"}-${i}`} title={`${name}: ${fmt(r.amount)} (${pct}%)`} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    {icons ? (
                      <CategoryTile icon={r.id != null ? icons[r.id] : undefined} color={r.color} size="sm" />
                    ) : (
                      identityDots && <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                    )}
                    {name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {fmt(r.amount)} <span className="text-muted-foreground">{pct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-chart-1" style={{ width: `${(r.amount / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
