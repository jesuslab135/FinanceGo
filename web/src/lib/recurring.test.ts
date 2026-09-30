import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./recurring";

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
