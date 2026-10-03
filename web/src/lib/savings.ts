import { differenceInCalendarDays, differenceInCalendarMonths, subMonths } from "date-fns";
import { parseISODate, toMonthKey } from "@/lib/dates";

export const ACCOUNT_KINDS = ["bank", "sofipo", "fund", "government", "broker", "afore", "ppr", "crypto", "other"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export const MOVEMENT_KINDS = ["deposit", "withdrawal", "transfer"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
export type GoalStatus = "achieved" | "no_date" | "ahead" | "on_track" | "behind";

/** Banks (IPAB) and SOFIPOs (PROSOFIPO) have deposit insurance; nothing else does. */
export const isInsuredKind = (kind: string) => kind === "bank" || kind === "sofipo";

/** "13", "13.5" or "13,5" → basis points; "" → null (no rate); anything invalid or above 100 % → undefined. */
export function parseRate(raw: string): number | null | undefined {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return undefined;
  const bp = Math.round(Number(s) * 100);
  return bp <= 10_000 ? bp : undefined;
}

export const rateToInput = (bp: number | null | undefined) => (bp == null ? "" : String(bp / 100));

/** Same rule as the API: what is left, spread over the months from this one through the target's, rounded up. */
export function requiredMonthly(remaining: number, today: Date, targetDate: string): number {
  if (remaining <= 0) return 0;
  const months = Math.max(differenceInCalendarMonths(parseISODate(targetDate), today) + 1, 1);
  return Math.ceil(remaining / months);
}

/** The `n` months ending with today's month, as YYYY-MM keys (for /savings/series). */
export function monthsWindow(today: Date, n: number): { from: string; to: string } {
  return { from: toMonthKey(subMonths(today, n - 1)), to: toMonthKey(today) };
}

export const daysSince = (iso: string, today: Date) => differenceInCalendarDays(today, parseISODate(iso));
