"use client";
import { m } from "motion/react";
import { useId, type KeyboardEvent } from "react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Option<V extends string> = { value: V; label: string };

/** Pill segmented control with a sliding indicator (radiogroup semantics). */
export function Segmented<V extends string>({ value, options, onChange, ariaLabel, className }: {
  value: V; options: Option<V>[]; onChange: (v: V) => void; ariaLabel: string; className?: string;
}) {
  const id = useId();
  const idx = options.findIndex((o) => o.value === value);
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    const target = e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : null;
    if (!d && target === null) return;
    e.preventDefault();
    const next = target !== null ? options[target] : options[(idx + d + options.length) % options.length];
    onChange(next.value);
    (e.currentTarget.parentElement?.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-full bg-muted p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            onKeyDown={onKey}
            className={cn("relative min-h-11 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {active && <m.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-card shadow-card" transition={spring} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
