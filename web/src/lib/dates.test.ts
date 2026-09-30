import { describe, expect, it } from "vitest";
import { parseISODate, toISODate, periodRange, seriesRange, toMonthKey, parseMonthKey } from "./dates";

describe("dates (TZ=America/Tijuana)", () => {
  it("parses ISO dates as local days", () => {
    const d = parseISODate("2026-03-01");
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(2);
    expect(toISODate(d)).toBe("2026-03-01");
  });

  it("month keys round-trip", () => {
    expect(toMonthKey(parseMonthKey("2026-12"))).toBe("2026-12");
  });

  it("period ranges", () => {
    const a = parseISODate("2026-03-18"); // Wednesday
    expect(periodRange("day", a)).toEqual({ from: "2026-03-18", to: "2026-03-18" });
    expect(periodRange("week", a)).toEqual({ from: "2026-03-16", to: "2026-03-22" });
    expect(periodRange("month", a)).toEqual({ from: "2026-03-01", to: "2026-03-31" });
  });

  it("series ranges end at the anchor's period", () => {
    const a = parseISODate("2026-03-18");
    expect(seriesRange("day", a)).toEqual({ from: "2026-03-05", to: "2026-03-18" });
    expect(seriesRange("week", a)).toEqual({ from: "2025-12-29", to: "2026-03-22" });
    expect(seriesRange("month", a)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });
});
