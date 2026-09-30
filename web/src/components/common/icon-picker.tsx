"use client";
import { useTranslations } from "next-intl";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import { CategoryTile } from "./category-tile";

export function IconPicker({ value, onChange, color, id }: { value: string; onChange: (k: string) => void; color: string; id?: string }) {
  const t = useTranslations();
  return (
    <div id={id} role="radiogroup" aria-label={t("categories.icon")} className="grid grid-cols-6 gap-2 sm:grid-cols-8">
      {CATEGORY_ICONS.map(({ key, labelKey }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          onClick={() => onChange(key)}
          className={cn("flex min-h-11 items-center justify-center rounded-xl ring-offset-2 transition", value === key ? "ring-2 ring-[var(--focus)]" : "hover:bg-muted")}
        >
          <CategoryTile icon={key} color={color} size="sm" />
        </button>
      ))}
    </div>
  );
}
