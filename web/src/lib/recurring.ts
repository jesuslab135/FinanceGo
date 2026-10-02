import { addDays, differenceInCalendarDays, endOfMonth } from "date-fns";
import { parseISODate, parseMonthKey, toISODate } from "./dates";

export type Frequency = "monthly" | "semimonthly" | "biweekly" | "weekly";
export const FREQUENCIES: Frequency[] = ["monthly", "semimonthly", "biweekly", "weekly"];

/** When a template lands: day_of_month (monthly, and every fixed payment), two days (semimonthly) or every 7/14 days from anchor_date. */
export type PaySchedule = { frequency?: Frequency; day_of_month: number; second_day?: number | null; anchor_date?: string | null };

/** The day a template lands in a month; shorter months use their last day. */
function clampedDate(year: number, month0: number, day: number): Date {
  const last = endOfMonth(new Date(year, month0, 1)).getDate();
  return new Date(year, month0, Math.min(day, last));
}

/** The pay dates that fall in a month, in order. Mirrors the API (internal/payday). */
export function payDates(s: PaySchedule, year: number, month0: number): Date[] {
  const first = new Date(year, month0, 1);
  if ((s.frequency === "weekly" || s.frequency === "biweekly") && s.anchor_date) {
    const step = s.frequency === "weekly" ? 7 : 14;
    const off = ((differenceInCalendarDays(parseISODate(s.anchor_date), first) % step) + step) % step;
    const out: Date[] = [];
    for (let d = addDays(first, off); d.getMonth() === first.getMonth(); d = addDays(d, step)) out.push(d);
    return out;
  }
  if (s.frequency === "semimonthly" && s.second_day) {
    return [clampedDate(year, month0, s.day_of_month), clampedDate(year, month0, s.second_day)].sort((a, b) => a.getTime() - b.getTime());
  }
  return [clampedDate(year, month0, s.day_of_month)];
}

/** The next `count` pay dates on or after `from`. */
export function upcomingPayDates(s: PaySchedule, from: Date, count: number): Date[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const out: Date[] = [];
  for (let i = 0; out.length < count && i < count + 2; i++) {
    for (const d of payDates(s, start.getFullYear(), start.getMonth() + i)) {
      if (d >= start && out.length < count) out.push(d);
    }
  }
  return out;
}

/**
 * Next occurrence on or after `today` as "YYYY-MM-DD", or null when the template has ended or is inactive.
 * Honors start_month (first occurrence) and end_month (inclusive last month).
 */
export function nextOccurrence(t: PaySchedule & { start_month: string; end_month?: string | null; active: boolean }, today: Date): string | null {
  if (!t.active) return null;
  const start = parseMonthKey(t.start_month);
  const [next] = upcomingPayDates(t, start > today ? start : today, 1);
  if (!next || (t.end_month && next > endOfMonth(parseMonthKey(t.end_month)))) return null;
  return toISODate(next);
}
