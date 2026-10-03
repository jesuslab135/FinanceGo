import { describe, expect, it } from "vitest";
import { monthlyEstimate, nextOccurrence, payDates, upcomingPayDates, type PaySchedule } from "./recurring";

const base = { start_month: "2026-01", active: true };

describe("nextOccurrence", () => {
  it("is later this month when the day has not passed", () => {
    expect(nextOccurrence({ ...base, day_of_month: 20 }, new Date(2026, 3, 10))).toBe("2026-04-20");
  });
  it("includes today", () => {
    expect(nextOccurrence({ ...base, day_of_month: 10 }, new Date(2026, 3, 10))).toBe("2026-04-10");
  });
  it("rolls to next month once the day has passed, crossing the year", () => {
    expect(nextOccurrence({ ...base, day_of_month: 5 }, new Date(2026, 11, 10))).toBe("2027-01-05");
  });
  it("clamps to the last day of short months", () => {
    expect(nextOccurrence({ ...base, day_of_month: 31 }, new Date(2026, 1, 10))).toBe("2026-02-28");
    expect(nextOccurrence({ ...base, day_of_month: 31 }, new Date(2026, 0, 31))).toBe("2026-01-31");
  });
  it("waits for a future start month", () => {
    expect(nextOccurrence({ day_of_month: 15, start_month: "2026-06", active: true }, new Date(2026, 3, 10))).toBe("2026-06-15");
  });
  it("is null when ended or inactive", () => {
    expect(nextOccurrence({ ...base, day_of_month: 5, end_month: "2026-04" }, new Date(2026, 3, 10))).toBeNull();
    expect(nextOccurrence({ ...base, day_of_month: 20, end_month: "2026-04" }, new Date(2026, 3, 10))).toBe("2026-04-20");
    expect(nextOccurrence({ ...base, active: false, day_of_month: 20 }, new Date(2026, 3, 10))).toBeNull();
  });
});

const days = (s: PaySchedule, y: number, m0: number) => payDates(s, y, m0).map((d) => d.getDate());

describe("payDates", () => {
  it("is one clamped day for monthly, and for templates without a frequency", () => {
    expect(days({ day_of_month: 31 }, 2026, 1)).toEqual([28]);
    expect(days({ frequency: "monthly", day_of_month: 15 }, 2026, 9)).toEqual([15]);
  });
  it("is two days for semimonthly, clamped and in order", () => {
    expect(days({ frequency: "semimonthly", day_of_month: 15, second_day: 30 }, 2026, 1)).toEqual([15, 28]);
    expect(days({ frequency: "semimonthly", day_of_month: 20, second_day: 5 }, 2026, 9)).toEqual([5, 20]);
  });
  it("steps weekly and biweekly from the anchor, in both directions", () => {
    // 2026-10-02 is a Friday.
    const weekly = { frequency: "weekly" as const, day_of_month: 2, anchor_date: "2026-10-02" };
    const biweekly = { ...weekly, frequency: "biweekly" as const };
    expect(days(weekly, 2026, 9)).toEqual([2, 9, 16, 23, 30]);
    expect(days(weekly, 2026, 8)).toEqual([4, 11, 18, 25]);
    expect(days(biweekly, 2026, 9)).toEqual([2, 16, 30]);
    expect(days(biweekly, 2026, 10)).toEqual([13, 27]);
    expect(days(biweekly, 2026, 8)).toEqual([4, 18]);
    // Across the autumn clock change the step stays 14 calendar days.
    expect(days(biweekly, 2027, 9)).toEqual([1, 15, 29]);
  });
});

describe("monthlyEstimate", () => {
  it("turns one payment into an average month", () => {
    expect(monthlyEstimate(1000000, "monthly")).toBe(1000000);
    expect(monthlyEstimate(1000000, "semimonthly")).toBe(2000000);
    expect(monthlyEstimate(500000, "weekly")).toBe(2166667);
    expect(monthlyEstimate(600000, "biweekly")).toBe(1300000);
  });
});

describe("nextOccurrence with a pay schedule", () => {
  it("finds the next payday inside the month or in the next one", () => {
    const semi = { ...base, frequency: "semimonthly" as const, day_of_month: 15, second_day: 30 };
    expect(nextOccurrence(semi, new Date(2026, 9, 16))).toBe("2026-10-30");
    expect(nextOccurrence(semi, new Date(2026, 9, 31))).toBe("2026-11-15");
    const biweekly = { ...base, frequency: "biweekly" as const, day_of_month: 2, anchor_date: "2026-10-02" };
    expect(nextOccurrence(biweekly, new Date(2026, 9, 31))).toBe("2026-11-13");
    expect(upcomingPayDates(biweekly, new Date(2026, 9, 3), 3).map((d) => d.getDate())).toEqual([16, 30, 13]);
  });
});
