import { describe, expect, it } from "vitest";
import { daysSince, isInsuredKind, monthsWindow, parseRate, rateToInput, requiredMonthly } from "./savings";

describe("savings helpers", () => {
  it("parses annual rates into basis points", () => {
    expect(parseRate("13")).toBe(1300);
    expect(parseRate("13.5")).toBe(1350);
    expect(parseRate(" 6,55 ")).toBe(655);
    expect(parseRate("")).toBeNull();
    expect(parseRate("abc")).toBeUndefined();
    expect(parseRate("100.01")).toBeUndefined();
    expect(parseRate("1.234")).toBeUndefined();
    expect(rateToInput(1350)).toBe("13.5");
    expect(rateToInput(null)).toBe("");
  });

  it("knows which kinds have deposit insurance", () => {
    expect(isInsuredKind("bank")).toBe(true);
    expect(isInsuredKind("sofipo")).toBe(true);
    expect(isInsuredKind("fund")).toBe(false);
  });

  it("mirrors the API's required-per-month rule", () => {
    const today = new Date(2026, 3, 10); // Apr 10
    expect(requiredMonthly(90_000, today, "2026-12-15")).toBe(10_000); // Apr..Dec = 9 months
    expect(requiredMonthly(100, today, "2026-04-30")).toBe(100); // same month
    expect(requiredMonthly(100, today, "2025-01-01")).toBe(100); // past date: all now
    expect(requiredMonthly(10, today, "2026-06-01")).toBe(4); // ceil(10 / 3)
    expect(requiredMonthly(0, today, "2026-12-15")).toBe(0);
  });

  it("builds a month window and counts days", () => {
    expect(monthsWindow(new Date(2026, 2, 15), 12)).toEqual({ from: "2025-04", to: "2026-03" });
    expect(daysSince("2026-02-01", new Date(2026, 2, 15))).toBe(42);
  });
});
