import { describe, expect, it } from "vitest";
import { MAX_CENTS, keyFromKeyboard, pressKey } from "./keypad";

const type = (keys: string[]) => keys.reduce((c, k) => pressKey(c, k as never), 0);

describe("keypad", () => {
  it("builds amounts ATM-style in cents", () => {
    expect(type(["1", "2", "3", "4", "5"])).toBe(12345);
    expect(type(["5", "00"])).toBe(500);
    expect(type(["0", "0", "7"])).toBe(7);
  });
  it("backspace and clear", () => {
    expect(type(["1", "2", "3", "back"])).toBe(12);
    expect(type(["9", "clear"])).toBe(0);
    expect(type(["back"])).toBe(0);
  });
  it("ignores keys that would exceed the max", () => {
    const near = Math.floor(MAX_CENTS / 10);
    expect(pressKey(near, "9")).toBe(near * 10 + 9 <= MAX_CENTS ? near * 10 + 9 : near);
    expect(pressKey(MAX_CENTS, "1")).toBe(MAX_CENTS);
    expect(pressKey(MAX_CENTS, "00")).toBe(MAX_CENTS);
    expect(pressKey(MAX_CENTS, "0")).toBe(MAX_CENTS);
    expect(pressKey(MAX_CENTS, "back")).toBe(Math.floor(MAX_CENTS / 10));
  });
  it("maps physical keyboard keys", () => {
    expect(keyFromKeyboard("7")).toBe("7");
    expect(keyFromKeyboard("Backspace")).toBe("back");
    expect(keyFromKeyboard("Delete")).toBe("clear");
    expect(keyFromKeyboard("a")).toBeNull();
    expect(keyFromKeyboard("Enter")).toBeNull();
    expect(keyFromKeyboard("10")).toBeNull();
  });
});
