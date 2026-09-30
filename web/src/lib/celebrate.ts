import { toast } from "sonner";
import type { Summary } from "@/lib/api/types";

const COLORS = ["#d9602f", "#ef9a55", "#0a8a74", "#fab219"];

export type CelebrationKind = "firstExpense" | "cardPaidOff" | "monthUnderBudget" | "welcome";

/**
 * A toast (which also carries the message for screen readers) plus, unless reduced motion is on,
 * a confetti burst. canvas-confetti is loaded on demand so it never weighs on the initial bundle.
 */
export async function celebrate(
  _kind: CelebrationKind,
  message: string,
  opts: { reduceMotion?: boolean } = {},
): Promise<void> {
  toast.success(message);
  const reduce = opts.reduceMotion ?? (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  if (reduce) return;
  try {
    const confetti = (await import("canvas-confetti")).default;
    confetti({ particleCount: 90, spread: 70, startVelocity: 38, ticks: 140, origin: { y: 0.7 }, colors: COLORS, disableForReducedMotion: true });
  } catch {
    /* the toast already delivered the message; confetti is decoration */
  }
}

/** A past month with income that ended with Available ≥ 0 and every budget ≤ 100%. */
export function shouldCelebrateMonth(s: Summary, currentMonth: string): boolean {
  return s.month < currentMonth && s.income > 0 && s.available >= 0 && s.budgets.every((b) => b.pct <= 100);
}
