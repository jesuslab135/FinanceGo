"use client";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { CategoryTile } from "@/components/common/category-tile";
import type { Category } from "@/lib/api/types";
import { orderCategories } from "@/lib/recents";
import { cn } from "@/lib/utils";

export function CategoryGrid({ categories, recent, value, onSelect }: {
  categories: Category[]; recent: number[]; value: number | null; onSelect: (id: number) => void;
}) {
  const t = useTranslations("expenses");
  const ordered = useMemo(() => orderCategories(categories, recent), [categories, recent]);
  return (
    <div role="radiogroup" aria-label={t("category")} className="grid grid-cols-4 gap-2">
      {ordered.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            "flex min-h-11 flex-col items-center gap-1 rounded-2xl p-2 text-center transition-colors active:bg-muted",
            value === c.id && "ring-2 ring-(--focus)",
          )}
        >
          <CategoryTile icon={c.icon} color={c.color} size="lg" />
          <span className="line-clamp-1 w-full text-xs">{c.name}</span>
        </button>
      ))}
    </div>
  );
}
