import {
  addDays, endOfMonth, endOfISOWeek, format, startOfISOWeek, startOfMonth, subDays, subMonths, subWeeks,
} from "date-fns";

export type Period = "day" | "week" | "month";

/** "YYYY-MM-DD" → local-midnight Date (never UTC). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function toMonthKey(d: Date): string {
  return format(d, "yyyy-MM");
}

export function parseMonthKey(s: string): Date {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function periodRange(period: Period, anchor: Date): { from: string; to: string } {
  switch (period) {
    case "day":
      return { from: toISODate(anchor), to: toISODate(anchor) };
    case "week":
      return { from: toISODate(startOfISOWeek(anchor)), to: toISODate(endOfISOWeek(anchor)) };
    case "month":
      return { from: toISODate(startOfMonth(anchor)), to: toISODate(endOfMonth(anchor)) };
  }
}

/** The window the spending chart shows: 14 days, 12 ISO weeks or 12 months ending at the anchor's period. */
export function seriesRange(period: Period, anchor: Date): { from: string; to: string } {
  switch (period) {
    case "day":
      return { from: toISODate(subDays(anchor, 13)), to: toISODate(anchor) };
    case "week":
      return { from: toISODate(startOfISOWeek(subWeeks(anchor, 11))), to: toISODate(endOfISOWeek(anchor)) };
    case "month":
      return { from: toISODate(startOfMonth(subMonths(anchor, 11))), to: toISODate(endOfMonth(anchor)) };
  }
}

export { addDays };
