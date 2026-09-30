import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cardPalette, contrastRatio } from "./contrast";

// Token values are read from globals.css, so this test cannot drift from the real theme.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
function block(selector: string): Record<string, string> {
  const start = css.search(new RegExp(`^${selector.replace(".", "\.")} \{`, "m"));
  if (start < 0) throw new Error(`no ${selector} block in globals.css`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}
const light = block(":root");
const dark = { ...light, ...block(".dark") }; // .dark overrides only what changes (e.g. --good, --critical stay)
const tok = (theme: Record<string, string>, name: string) => {
  const v = theme[name];
  if (!v) throw new Error(`token ${name} missing`);
  return v;
};
/** `fg` at `p` opacity over `bg` (what `bg-x/12` or color-mix produces on an opaque surface). */
function mix(fg: string, bg: string, p: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i, 3 + i), 16);
  return `#${[0, 2, 4].map((i) => Math.round(ch(fg, i) * p + ch(bg, i) * (1 - p)).toString(16).padStart(2, "0")).join("")}`;
}

type Pair = [name: string, fg: string, bg: string, min: number];
const pairs: Pair[] = [];
for (const [mode, th] of [["light", light], ["dark", dark]] as const) {
  const t = (n: string) => tok(th, n);
  const surfaces = { bg: t("--background"), card: t("--card"), raised: t("--surface-raised") };
  // Spec §3.1 pairs; body text needs 4.5, large/bold 3.
  for (const [sn, s] of Object.entries(surfaces)) {
    pairs.push([`fg on ${sn} (${mode})`, t("--foreground"), s, 4.5]);
    pairs.push([`muted on ${sn} (${mode})`, t("--muted-foreground"), s, 4.5]);
  }
  pairs.push(
    [`white on primary (${mode})`, t("--primary-foreground"), t("--primary"), 4.5],
    [`white on brand (${mode}, hero bold)`, t("--brand-fg"), t("--hero-from"), 3],
    // Error and destructive text (row menus, "Over the limit", "Overdue", form errors) sits on cards and popovers.
    [`destructive text on card (${mode})`, t("--destructive"), t("--card"), 4.5],
    [`destructive text on popover (${mode})`, t("--destructive"), t("--popover"), 4.5],
    // Link text: `text-primary` in light, `dark:text-brand` in dark (button/badge link variants).
    [`link text on card (${mode})`, mode === "light" ? t("--primary") : t("--brand"), t("--card"), 4.5],
    [`link text on popover (${mode})`, mode === "light" ? t("--primary") : t("--brand"), t("--popover"), 4.5],
    // Insight cards: tone tints over the page background carry foreground/muted text and the "View" link (foreground).
    ...(["--good", "--warning", "--critical"] as const).flatMap((tone): Pair[] => {
      const tint = mix(t(tone), t("--background"), tone === "--warning" ? 0.16 : 0.12);
      return [
        [`fg on ${tone} insight tint (${mode})`, t("--foreground"), tint, 4.5],
        [`muted on ${tone} insight tint (${mode})`, t("--muted-foreground"), tint, 4.5],
      ];
    }),
    // Hero: the amount is large bold (3:1). The gradient holds its start color to 70%, so a long amount
    // still sits on the start color; small text sits on a 40% black pill, checked at the gradient end.
    [`white on hero amount zone (${mode})`, "#ffffff", t("--hero-from"), 3],
    [`white on hero amount zone (critical ${mode})`, "#ffffff", t("--critical-hero-from"), 3],
    [`white on hero pill, gradient end (${mode})`, "#ffffff", mix("#000000", t("--hero-to"), 0.4), 4.5],
    [`white on hero pill, gradient end (critical ${mode})`, "#ffffff", mix("#000000", t("--critical-hero-to"), 0.4), 4.5],
    // Auth brand panel uses the hero gradient: wordmark at the start color (large bold), tagline on the pill.
    [`white on auth panel wordmark (${mode})`, "#ffffff", t("--hero-from"), 3],
  );
}
pairs.push(["white on critical hero (light)", "#ffffff", tok(light, "--critical-hero-from"), 4.5]);

describe("token contrast (WCAG AA)", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
  it("reads the real tokens from globals.css", () => {
    expect(light["--card"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(dark["--card"]).not.toBe(light["--card"]);
    expect(dark["--destructive"]).not.toBe(light["--destructive"]);
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
