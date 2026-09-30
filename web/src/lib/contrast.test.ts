import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

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
];

describe("token contrast (WCAG AA)", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
  it.each(pairs)("%s", (_n, a, b, min) => {
    expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(min);
  });
});
