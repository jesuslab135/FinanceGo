"use client";

import { m, useReducedMotion } from "motion/react";
import { ease, stagger } from "@/lib/motion";

/** Fill time: max section delay 0.16 + max stagger 3*0.06 + 0.35 = 0.69s, inside the 700ms entrance budget. */
const METER_FILL = 0.35;

/** Animated horizontal fill. `pct` is 0-100; `index` staggers siblings. Instant under reduced motion. */
export function MeterFill({ pct, index = 0, className }: { pct: number; index?: number; className: string }) {
  const reduce = useReducedMotion();
  return (
    <m.div
      className={`h-2 rounded-full ${className}`}
      initial={reduce ? false : { width: 0 }}
      animate={{ width: `${pct}%` }}
      transition={reduce ? { duration: 0 } : { duration: METER_FILL, ease: ease.enter, delay: Math.min(index, 3) * stagger.bars }}
    />
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{(max > 0 ? (value / max) * 100 : 0).toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(Math.max(value, 0), max)} aria-valuetext={`${pct.toFixed(1)}%`} aria-label={label}>
        <MeterFill pct={pct} className="bg-chart-1" />
      </div>
    </div>
  );
}
