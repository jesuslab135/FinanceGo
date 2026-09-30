export const MAX_CENTS = 999_999_999_999;
export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "00" | "back" | "clear";

/** ATM-style entry: digits shift in from the right; anything past MAX_CENTS is ignored. */
export function pressKey(cents: number, key: KeypadKey): number {
  if (key === "back") return Math.floor(cents / 10);
  if (key === "clear") return 0;
  const next = key === "00" ? cents * 100 : cents * 10 + Number(key);
  return next > MAX_CENTS ? cents : next;
}

export function keyFromKeyboard(key: string): KeypadKey | null {
  if (/^[0-9]$/.test(key)) return key as KeypadKey;
  if (key === "Backspace") return "back";
  if (key === "Delete") return "clear";
  return null;
}
