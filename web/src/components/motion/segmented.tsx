"use client";
import { m } from "motion/react";
import { useId } from "react";
import { useRovingRadio } from "@/hooks/use-roving-radio";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Option<V extends string> = { value: V; label: string };

/** Pill segmented control with a sliding indicator (radiogroup semantics). */
export function Segmented<V extends string>({ value, options, onChange, ariaLabel, className }: {
  value: V; options: Option<V>[]; onChange: (v: V) => void; ariaLabel: string; className?: string;
}) {
  const id = useId();
  const { groupRef, itemProps } = useRovingRadio({ values: options.map((o) => o.value), value, onChange });
  return (
    <div ref={groupRef} role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-full bg-muted p-1", className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            {...itemProps(i)}
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
