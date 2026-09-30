import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageLinks } from "@/components/auth/language-links";
import { Logo } from "@/components/brand/logo";
import { AllCaughtUp } from "@/components/illustrations/all-caught-up";
import { formatMoney } from "@/lib/money";

// Contrast on the brand panel (pairs pinned in contrast.test.ts): the wordmark sits at the top-left corner, in the
// gradient's start color (large bold, 3:1). The tagline can land anywhere along the gradient on short, wide
// viewports, so like the mock card it sits on the 40% black pill checked at the gradient end (4.5:1).
export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-2">
      <aside className="hidden flex-col justify-between gap-8 bg-[linear-gradient(135deg,var(--hero-from)_0%,var(--hero-from)_70%,var(--hero-to)_100%)] p-10 text-white md:flex">
        <Logo withWordmark />
        <p className="rounded-[20px] bg-black/40 p-5 font-display text-3xl font-bold tracking-tight">{t("auth.tagline")}</p>
        <div aria-hidden className="flex flex-col gap-4">
          <div className="space-y-1 rounded-[20px] bg-black/40 p-5">
            <p className="text-sm">{t("dashboard.heroLabel")}</p>
            <p className="num font-display text-4xl font-extrabold tracking-tight">{formatMoney(1248050, "MXN", locale)}</p>
          </div>
          <div className="self-start rounded-2xl bg-card p-3 text-foreground shadow-card">
            <AllCaughtUp className="h-auto w-32 text-muted-foreground" />
          </div>
        </div>
      </aside>
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10 md:min-h-0 md:max-w-md md:px-8">
        <div className="space-y-2 text-center">
          <h1 className="flex justify-center md:sr-only"><Logo withWordmark /></h1>
          <p className="text-sm text-muted-foreground md:hidden">{t("auth.tagline")}</p>
        </div>
        {children}
        <LanguageLinks label={t("nav.language")} />
      </main>
    </div>
  );
}
