"use client";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { SharedElement } from "@/components/motion/page-transition";
import { AnimatedAmount } from "@/components/motion/animated-amount";
import { useFormatMoney } from "@/components/common/money";
import type { Summary } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// Small hero text sits on a dark pill so it clears AA 4.5 across the whole gradient (see contrast.test.ts);
// the gradient holds its start color to 70% under the amount so the large bold text clears 3.
const pill = "inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-0.5 text-sm";

export function HeroAvailable({ summary: s, className }: { summary: Summary; className?: string }) {
  const t = useTranslations("dashboard");
  const fmt = useFormatMoney();
  const negative = s.available < 0;
  return (
    <SharedElement name="hero-amount">
      <section
        data-tone={negative ? "critical" : "brand"}
        className={cn(
          "relative space-y-2 overflow-hidden rounded-[20px] p-5 text-white shadow-card md:p-7",
          negative
            ? "bg-[linear-gradient(135deg,var(--critical-hero-from)_0%,var(--critical-hero-from)_70%,var(--critical-hero-to)_100%)]"
            : "bg-[linear-gradient(135deg,var(--hero-from)_0%,var(--hero-from)_70%,var(--hero-to)_100%)]",
          className,
        )}
      >
        <p className={pill}>{t("heroLabel")}</p>
        <div>
          {negative ? (
            <p className="num font-display text-4xl font-extrabold tracking-tight md:text-5xl">{fmt(s.available)}</p>
          ) : (
            <AnimatedAmount cents={s.available} splitCents className="font-display text-4xl font-extrabold tracking-tight md:text-5xl" />
          )}
        </div>
        {negative ? (
          <p className={cn(pill, "font-semibold")}><AlertTriangle className="size-4" aria-hidden /> {t("overspent")}</p>
        ) : (
          s.safe_to_spend_per_day != null && (
            <p data-dynamic className={pill}>{t("heroHint", { amount: fmt(s.safe_to_spend_per_day), days: s.days_remaining ?? 0 })}</p>
          )
        )}
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
      </section>
    </SharedElement>
  );
}
