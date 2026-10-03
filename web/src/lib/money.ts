const MAX_CENTS = 999_999_999_999;

/**
 * Parses user-typed money into integer cents without floating point.
 * Accepts "1,234.50", "1.234,50", "1234,5", "$ 99". A last separator followed
 * by 1-2 digits is the decimal point; 3 digits means thousands grouping.
 * "12.345" is ambiguous (thousands or a typo) and is rejected. Returns null when invalid.
 */
export function parseMoney(raw: string): number | null {
  const s = raw.trim().replace(/[\s$]/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const seps = [...s.matchAll(/[.,]/g)].map((m) => ({ ch: m[0], i: m.index! }));
  let whole = s;
  let frac = "";
  if (seps.length > 0) {
    const last = seps[seps.length - 1];
    const tail = s.slice(last.i + 1);
    if (tail.length >= 1 && tail.length <= 2) {
      // decimal point: earlier separators must be the other character ("1,234.50")
      if (seps.slice(0, -1).some((g) => g.ch === last.ch)) return null;
      whole = s.slice(0, last.i);
      frac = tail;
    } else if (tail.length === 3) {
      // no decimals: every separator groups thousands ("1,234", "1.234.567")
      if (seps.some((g) => g.ch !== last.ch)) return null;
      // "12.345" stays ambiguous (rejected); "10,000" is unambiguous US-style grouping.
      if (seps.length === 1 && last.ch === "." && last.i > 1) return null;
      if (s.startsWith("0")) return null;
    } else {
      return null;
    }
    if (/[.,]/.test(whole) && (!/^\d{1,3}([.,]\d{3})+$/.test(whole) || new Set(whole.match(/[.,]/g)).size > 1)) return null;
  }
  const digits = whole.replace(/[.,]/g, "");
  if (digits.length > 10) return null;
  const cents = Number(digits) * 100 + Number(frac.padEnd(2, "0") || 0);
  return cents <= MAX_CENTS ? cents : null;
}

export function intlLocale(locale: string): string {
  return locale === "en" ? "en-US" : "es-MX";
}

export function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency }).format(cents / 100);
}

export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
