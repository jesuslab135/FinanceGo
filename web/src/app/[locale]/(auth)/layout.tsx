import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageLinks } from "@/components/auth/language-links";
import { Logo } from "@/components/brand/logo";
import { AllCaughtUp } from "@/components/illustrations/all-caught-up";

// Contrast on the brand panel (pairs pinned in contrast.test.ts): the logo wordmark and tagline are large bold
// (3:1) and sit in the top/middle of the panel, where the gradient still holds its start color (70%); the
// decorative mock card uses the same 40% black pill as the dashboard hero, checked at the gradient end.
export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-2">
      <aside className="hidden flex-col justify-between gap-8 bg-[linear-gradient(135deg,var(--hero-from)_0%,var(--hero-from)_70%,var(--hero-to)_100%)] p-10 text-white md:flex">
        <h1><Logo withWordmark /></h1>
        <p className="font-display text-3xl font-bold tracking-tight">{t("auth.tagline")}</p>
        <div aria-hidden className="flex flex-col gap-4">
          <div className="space-y-1 rounded-[20px] bg-black/40 p-5">
            <p className="text-sm">{t("dashboard.heroLabel")}</p>
            <p className="num font-display text-4xl font-extrabold tracking-tight">$12,480<span className="text-[0.75em]">.50</span></p>
          </div>
          <div className="self-start rounded-2xl bg-card p-3 text-foreground shadow-card">
            <AllCaughtUp className="h-auto w-32 text-muted-foreground" />
          </div>
        </div>
      </aside>
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10 md:min-h-0 md:max-w-md md:px-8">
        <div className="space-y-2 text-center md:hidden">
          <h1 className="flex justify-center"><Logo withWordmark /></h1>
          <p className="text-sm text-muted-foreground">{t("auth.tagline")}</p>
        </div>
        {children}
        <LanguageLinks label={t("nav.language")} />
      </main>
    </div>
  );
}
