"use client";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { CategoryTile } from "@/components/common/category-tile";
import { useRovingRadio } from "@/hooks/use-roving-radio";
import type { Category } from "@/lib/api/types";
import { orderCategories } from "@/lib/recents";
import { cn } from "@/lib/utils";

const COLUMNS = 4;

/** Picking a category advances the flow, so arrow keys only move focus here; Enter/Space (or a tap) selects. */
export function CategoryGrid({ categories, recent, value, onSelect }: {
  categories: Category[]; recent: number[]; value: number | null; onSelect: (id: number) => void;
}) {
  const t = useTranslations("expenses");
  const ordered = useMemo(() => orderCategories(categories, recent), [categories, recent]);
  const ids = useMemo(() => ordered.map((c) => c.id), [ordered]);
  const { groupRef, itemProps } = useRovingRadio({ values: ids, value, onChange: onSelect, columns: () => COLUMNS, selectOnMove: false });
  return (
    <div ref={groupRef} role="radiogroup" aria-label={t("category")} className="grid grid-cols-4 gap-2">
      {ordered.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          onClick={() => onSelect(c.id)}
          {...itemProps(i)}
          className={cn(
            "flex min-h-11 flex-col items-center gap-1 rounded-2xl p-2 text-center transition-colors active:bg-muted",
            value === c.id && "bg-primary/12 font-semibold",
          )}
        >
          <CategoryTile icon={c.icon} color={c.color} size="lg" />
          <span className="line-clamp-1 w-full text-xs">{c.name}</span>
        </button>
      ))}
    </div>
  );
}
