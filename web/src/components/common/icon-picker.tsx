"use client";
import { useTranslations } from "next-intl";
import { useRovingRadio } from "@/hooks/use-roving-radio";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import { CategoryTile } from "./category-tile";

export function IconPicker({ value, onChange, color, id, labelledBy }: {
  value: string; onChange: (k: string) => void; color: string; id?: string; labelledBy?: string;
}) {
  const t = useTranslations();
  const columns = (el: HTMLDivElement | null) => {
    const tpl = el ? getComputedStyle(el).gridTemplateColumns : "";
    const n = tpl.split(" ").filter(Boolean).length;
    return n > 1 ? n : 6;
  };

  const { groupRef, itemProps } = useRovingRadio({ values: CATEGORY_ICONS.map((i) => i.key), value, onChange, columns });

  return (
    <div
      ref={groupRef}
      id={id}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : t("categories.icon")}
      className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-8"
    >
      {CATEGORY_ICONS.map(({ key, labelKey }, i) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          onClick={() => onChange(key)}
          {...itemProps(i)}
          className={cn(
            "flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 transition",
            value === key
              ? "border-[var(--focus)] bg-[color-mix(in_srgb,var(--focus)_14%,transparent)]"
              : "border-transparent hover:bg-muted",
          )}
        >
          <CategoryTile icon={key} color={color} size="sm" />
        </button>
      ))}
    </div>
  );
}
