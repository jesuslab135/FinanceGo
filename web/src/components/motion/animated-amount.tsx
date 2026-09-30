"use client";
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import { useFormatMoney } from "@/components/common/money";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Splits "$12,480.50" into ["$12,480", ".50"] on the last separator; no fraction part gives ["text", ""]. */
export function splitAtCents(text: string): [string, string] {
  const match = /^(.*?)([.,]\d{1,2})(\D*)$/.exec(text);
  return match ? [match[1], match[2] + match[3]] : [text, ""];
}

/** Money that counts from its previous value to the new one; screen readers get the final value. */
export function AnimatedAmount({ cents, className, splitCents = false }: { cents: number; className?: string; splitCents?: boolean }) {
  const fmt = useFormatMoney();
  const reduce = useReducedMotion();
  const mv = useMotionValue(cents);
  const text = useTransform(mv, (v) => fmt(Math.round(v)));
  const whole = useTransform(text, (v) => splitAtCents(v)[0]);
  const fraction = useTransform(text, (v) => splitAtCents(v)[1]);

  useEffect(() => {
    if (reduce) {
      mv.set(cents);
      return;
    }
    const controls = animate(mv, cents, { duration: duration.count, ease: ease.enter });
    return () => controls.stop();
  }, [cents, reduce, mv]);

  let body;
  if (splitCents) {
    const [w, f] = splitAtCents(fmt(cents));
    body = reduce ? (
      <span aria-hidden>{w}<span className="text-[0.75em]">{f}</span></span>
    ) : (
      <span aria-hidden><m.span>{whole}</m.span><m.span className="text-[0.75em]">{fraction}</m.span></span>
    );
  } else {
    body = reduce ? <span aria-hidden>{fmt(cents)}</span> : <m.span aria-hidden>{text}</m.span>;
  }
  return (
    <span className={cn("num", className)} aria-label={fmt(cents)} role="text">
      {body}
    </span>
  );
}
