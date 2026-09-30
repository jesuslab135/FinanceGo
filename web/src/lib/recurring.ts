import { endOfMonth } from "date-fns";
import { parseMonthKey, toISODate } from "./dates";

/** The day a template lands in a month; shorter months use their last day. */
function clampedDate(year: number, month0: number, day: number): Date {
  const last = endOfMonth(new Date(year, month0, 1)).getDate();
  return new Date(year, month0, Math.min(day, last));
}

/**
 * Next occurrence on or after `today` as "YYYY-MM-DD", or null when the template has ended or is inactive.
 * Honors start_month (first occurrence) and end_month (inclusive last month).
 */
export function nextOccurrence(t: { day_of_month: number; start_month: string; end_month?: string | null; active: boolean }, today: Date): string | null {
  if (!t.active) return null;
  const start = parseMonthKey(t.start_month);
  const from = start > today ? start : today;
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = clampedDate(from.getFullYear(), from.getMonth(), t.day_of_month);
  if (next < todayMidnight || next < start) next = clampedDate(from.getFullYear(), from.getMonth() + 1, t.day_of_month);
  if (t.end_month && next > endOfMonth(parseMonthKey(t.end_month))) return null;
  return toISODate(next);
}
