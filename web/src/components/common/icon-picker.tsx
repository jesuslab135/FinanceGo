"use client";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import { CategoryTile } from "./category-tile";

export function IconPicker({ value, onChange, color, id, labelledBy }: {
  value: string; onChange: (k: string) => void; color: string; id?: string; labelledBy?: string;
}) {
  const t = useTranslations();
  const group = useRef<HTMLDivElement>(null);
  const selected = CATEGORY_ICONS.some((i) => i.key === value) ? value : CATEGORY_ICONS[0].key;

  const columns = () => {
    const tpl = group.current ? getComputedStyle(group.current).gridTemplateColumns : "";
    const n = tpl.split(" ").filter(Boolean).length;
    return n > 1 ? n : 6;
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = CATEGORY_ICONS.length - 1;
    let next: number;
    switch (e.key) {
      case "ArrowRight": next = Math.min(last, index + 1); break;
      case "ArrowLeft": next = Math.max(0, index - 1); break;
      case "ArrowDown": next = Math.min(last, index + columns()); break;
      case "ArrowUp": next = Math.max(0, index - columns()); break;
      case "Home": next = 0; break;
      case "End": next = last; break;
      default: return;
    }
    e.preventDefault();
    onChange(CATEGORY_ICONS[next].key);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      ref={group}
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
          tabIndex={selected === key ? 0 : -1}
          onClick={() => onChange(key)}
          onKeyDown={(e) => onKeyDown(e, i)}
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
