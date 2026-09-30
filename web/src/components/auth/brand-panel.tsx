import { Check, TrendingDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Logo } from "@/components/brand/logo";
import { CategoryTile } from "@/components/common/category-tile";
import { formatMoney } from "@/lib/money";

const BARS = [38, 62, 45, 80, 54, 70, 48];
const ROWS = [
  { icon: "utensils", label: "food", color: "#d9602f", cents: 18000 },
  { icon: "shopping-cart", label: "groceries", color: "#0a8a74", cents: 124050 },
  { icon: "fuel", label: "fuel", color: "#5b43c2", cents: 65000 },
] as const;

/**
 * Left half of the auth screens (md+): headline, feature list and a decorative phone preview of the dashboard.
 * Text sits on a light brand tint in both themes, so it uses the normal foreground tokens (pairs in contrast.test.ts).
 */
export function BrandPanel() {
  const t = useTranslations();
  const locale = useLocale();
  const money = (c: number) => formatMoney(c, "MXN", locale);
  return (
    <aside className="relative hidden overflow-hidden bg-[color-mix(in_oklab,var(--brand)_14%,var(--background))] md:flex md:flex-col md:justify-between md:gap-10 md:p-10 lg:p-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-20 size-80 rounded-full bg-[var(--brand)] opacity-25 blur-3xl" />
        <div className="absolute top-1/3 -right-24 size-96 rounded-full bg-[var(--accent-teal)] opacity-15 blur-3xl" />
        <div className="absolute -bottom-28 left-1/4 size-80 rounded-full bg-[var(--warning)] opacity-20 blur-3xl" />
      </div>

      <div className="relative"><Logo withWordmark /></div>

      <div className="relative grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="max-w-md space-y-6">
          <p className="font-display text-4xl leading-tight font-extrabold tracking-tight 2xl:text-5xl">{t("auth.headline")}</p>
          <p className="text-lg text-muted-foreground">{t("auth.tagline")}</p>
          <ul className="space-y-3">
            {(["feature1", "feature2", "feature3"] as const).map((k) => (
              <li key={k} className="flex items-center gap-3 font-medium">
                <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" strokeWidth={2.5} /></span>
                {t(`auth.${k}`)}
              </li>
            ))}
          </ul>
        </div>

        <PhonePreview money={money} label={t("dashboard.heroLabel")} names={ROWS.map((r) => t(`icons.${r.label}`))} budget={t("auth.previewBudget")} />
      </div>

      <p className="relative text-sm text-muted-foreground">{t("auth.footnote")}</p>
    </aside>
  );
}

function PhonePreview({ money, label, names, budget }: { money: (c: number) => string; label: string; names: string[]; budget: string }) {
  return (
    <div aria-hidden className="relative mx-auto w-[272px] shrink-0 motion-safe:animate-[float_6s_ease-in-out_infinite]">
      <div className="rotate-[-4deg] rounded-[40px] bg-[#2a1d14] p-2.5 shadow-[0_30px_60px_-20px_rgb(74_45_25/0.45)]">
        <div className="space-y-3 overflow-hidden rounded-[32px] bg-background p-4">
          <div className="mx-auto h-1.5 w-16 rounded-full bg-muted" />
          <div className="rounded-[20px] bg-[linear-gradient(135deg,var(--hero-from)_0%,var(--hero-from)_70%,var(--hero-to)_100%)] p-4 text-white">
            <p className="text-xs opacity-90">{label}</p>
            <p className="num font-display text-3xl font-extrabold tracking-tight">{money(1248050)}</p>
          </div>
          <div className="flex h-20 items-end gap-1.5 rounded-2xl bg-card p-3 shadow-card">
            {BARS.map((h, i) => (
              <span key={i} className="flex-1 rounded-t-[4px]" style={{ height: `${h}%`, background: i === 3 ? "var(--chart-1)" : "color-mix(in oklab, var(--chart-1) 35%, var(--card))" }} />
            ))}
          </div>
          <div className="space-y-2">
            {ROWS.map((r, i) => (
              <div key={r.icon} className="flex items-center gap-3 rounded-2xl bg-card p-2.5 shadow-card">
                <CategoryTile icon={r.icon} color={r.color} size="sm" />
                <span className="flex-1 truncate text-sm font-medium">{names[i]}</span>
                <span className="num text-sm font-semibold">−{money(r.cents)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute top-[150px] -right-12 w-48 rotate-[5deg] whitespace-nowrap rounded-2xl bg-card p-3 shadow-[0_16px_40px_-12px_rgb(74_45_25/0.35)]">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><TrendingDown className="size-4 text-[var(--accent-teal)]" />{budget}</div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-[72%] rounded-full bg-[var(--accent-teal)]" /></div>
      </div>
    </div>
  );
}
