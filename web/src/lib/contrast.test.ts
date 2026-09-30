import { describe, expect, it } from "vitest";
import { cardPalette, contrastRatio } from "./contrast";

// Spec §3.1 pairs; body text needs 4.5, large/bold 3.
const pairs: Array<[string, string, string, number]> = [
  ["fg on surface (light)", "#2a1d14", "#fffaf4", 4.5],
  ["muted on surface (light)", "#6b5a4c", "#fffaf4", 4.5],
  ["fg on bg (light)", "#2a1d14", "#f6efe7", 4.5],
  ["muted on bg (light)", "#6b5a4c", "#f6efe7", 4.5],
  ["white on brand (light, hero bold)", "#ffffff", "#d9602f", 3],
  ["fg on surface (dark)", "#f6ede4", "#1c1714", 4.5],
  ["muted on surface (dark)", "#b8a797", "#1c1714", 4.5],
  ["muted on raised (dark)", "#b8a797", "#241d19", 4.5],
  ["white on brand (dark, hero bold)", "#ffffff", "#b64b22", 3],
  ["white on primary (light)", "#ffffff", "#b9501f", 4.5],
  ["white on primary (dark)", "#ffffff", "#c4531f", 4.5],
  ["white on critical hero", "#ffffff", "#b42828", 4.5],
  // Hero: the amount is large bold (3:1). The gradient holds its start color to 70%, so a long amount
  // (about 50% along the diagonal at 360px) still sits on the start color; small text sits on a 40% black
  // pill, checked at the gradient end.
  ["white on hero amount zone (light)", "#ffffff", "#d9602f", 3],
  ["white on hero amount zone (dark)", "#ffffff", "#b64b22", 3],
  ["white on hero amount zone (critical light)", "#ffffff", "#b42828", 3],
  ["white on hero amount zone (critical dark)", "#ffffff", "#8f1f1f", 3],
  ["white on auth panel wordmark (light, large bold, top-left start color)", "#ffffff", "#d9602f", 3],
  ["white on auth tagline pill at gradient end (light)", "#ffffff", "#8f5c33", 4.5],
  ["white on auth tagline pill at gradient end (dark)", "#ffffff", "#863e23", 4.5],
  ["white on auth panel wordmark (dark, large bold, top-left start color)", "#ffffff", "#b64b22", 3],
  ["white on hero pill, gradient end (light)", "#ffffff", "#8f5c33", 4.5],
  ["white on hero pill, gradient end (dark)", "#ffffff", "#863e23", 4.5],
  ["white on hero pill, gradient end (critical light)", "#ffffff", "#822c23", 4.5],
  ["white on hero pill, gradient end (critical dark)", "#ffffff", "#74231c", 4.5],
];

describe("token contrast (WCAG AA)", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
  it.each(pairs)("%s", (_n, a, b, min) => {
    expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(min);
  });
  it("card text meets AA across the whole gradient for any card color", () => {
    const h = (n: number) => n.toString(16).padStart(2, "0");
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
      const { from, ink } = cardPalette(`#${h(r)}${h(g)}${h(b)}`);
      const end = `#${[from.slice(1, 3), from.slice(3, 5), from.slice(5, 7)].map((x) => h(Math.round(parseInt(x, 16) * 0.55))).join("")}`;
      expect(contrastRatio(ink, from), from).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink, end), from).toBeGreaterThanOrEqual(4.5);
    }
  });
});
