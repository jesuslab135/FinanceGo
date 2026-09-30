function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio between two #rrggbb colors. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const DARK_INK = "#2a1d14";

function shift(hex: string, target: 0 | 255, p: number): string {
  const h = hex.replace("#", "");
  return `#${[0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - p) + target * p).toString(16).padStart(2, "0")).join("")}`;
}

/** The card gradient runs from the color to 55% of it mixed with black; text must read on both ends. */
function worstOnCard(ink: string, from: string): number {
  return Math.min(contrastRatio(ink, from), contrastRatio(ink, shift(from, 0, 0.45)));
}

/**
 * Text color and (possibly nudged) gradient start for a user-picked card color: the smallest shift of the
 * color, darker under white text or lighter under dark text, that gives 4.5:1 across the whole gradient.
 */
export function cardPalette(color: string): { from: string; ink: string } {
  let white: { from: string; p: number } | undefined;
  let dark: { from: string; p: number } | undefined;
  for (let p = 0; p <= 1.0001 && !(white && dark); p += 0.02) {
    const d = shift(color, 0, p);
    const l = shift(color, 255, p);
    if (!white && worstOnCard("#ffffff", d) >= 4.5) white = { from: d, p };
    if (!dark && worstOnCard(DARK_INK, l) >= 4.5) dark = { from: l, p };
  }
  if (dark && (!white || dark.p < white.p)) return { from: dark.from, ink: DARK_INK };
  return { from: white?.from ?? "#000000", ink: "#ffffff" };
}
