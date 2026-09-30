import { describe, expect, it } from "vitest";
import { centsToInput, formatMoney, parseMoney } from "./money";

describe("parseMoney", () => {
  it.each([
    ["1,234.50", 123450],
    ["1234,5", 123450],
    ["1.234,50", 123450],
    ["$ 99", 9900],
    ["0.1", 10],
    ["12", 1200],
    [" 7.05 ", 705],
    ["1,23", 123],
    ["1,234", 123400],
    ["1.234.567", 123456700],
  ])("%s → %d", (raw, cents) => expect(parseMoney(raw)).toBe(cents));

  it.each(["", "abc", "1.2.3", "12.345", "-5", "1e3", "12.3.4,5", "99999999999999999", "0.001", "5."])(
    "rejects %j",
    (raw) => expect(parseMoney(raw)).toBeNull(),
  );
});

describe("formatMoney", () => {
  it("formats MXN in Spanish and English", () => {
    expect(formatMoney(123450, "MXN", "es")).toBe("$1,234.50");
    expect(formatMoney(-500, "USD", "en")).toBe("-$5.00");
  });
});

describe("centsToInput", () => {
  it("renders plain decimals for editing", () => {
    expect(centsToInput(123450)).toBe("1234.50");
    expect(centsToInput(5)).toBe("0.05");
  });
});
