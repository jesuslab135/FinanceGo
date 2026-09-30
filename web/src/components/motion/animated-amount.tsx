"use client";
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import { useFormatMoney } from "@/components/common/money";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Money that counts from its previous value to the new one; screen readers get the final value. */
export function AnimatedAmount({ cents, className }: { cents: number; className?: string }) {
  const fmt = useFormatMoney();
  const reduce = useReducedMotion();
  const mv = useMotionValue(cents);
  const text = useTransform(mv, (v) => fmt(Math.round(v)));

  useEffect(() => {
    if (reduce) {
      mv.set(cents);
      return;
    }
    const controls = animate(mv, cents, { duration: duration.count, ease: ease.enter });
    return () => controls.stop();
  }, [cents, reduce, mv]);

  return (
    <span className={cn("num", className)} aria-label={fmt(cents)} role="text">
      {reduce ? <span aria-hidden>{fmt(cents)}</span> : <m.span aria-hidden>{text}</m.span>}
    </span>
  );
}
