"use client";
import { useTranslations } from "next-intl";
import { AnimatedAmount } from "@/components/motion/animated-amount";
import { useFormatMoney } from "@/components/common/money";
import type { SavingsOverview } from "@/lib/api/types";

const pill = "inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-0.5 text-sm";
const amountClass = "font-display text-4xl font-extrabold tracking-tight md:text-5xl";

/** Same visual language as the dashboard hero: brand gradient, amount on the start color, small text on a dark pill. */
export function NetWorthHero({ overview: o }: { overview: SavingsOverview }) {
  const t = useTranslations("savings");
  const fmt = useFormatMoney();
  return (
    <section className="relative space-y-2 overflow-hidden rounded-[20px] bg-[linear-gradient(135deg,var(--hero-from)_0%,var(--hero-from)_70%,var(--hero-to)_100%)] p-5 text-white shadow-card md:p-7">
      <p className={pill}>{t("netWorth")}</p>
      <div>
        {o.net_worth < 0 ? (
          <p className={`num ${amountClass}`}>{fmt(o.net_worth)}</p>
        ) : (
          <AnimatedAmount cents={o.net_worth} splitCents className={amountClass} />
        )}
      </div>
      <p className={pill}>{t("netWorthDetail", { assets: fmt(o.assets), debt: fmt(o.card_debt) })}</p>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
    </section>
  );
}
