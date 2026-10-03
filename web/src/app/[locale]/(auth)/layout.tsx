import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { BrandPanel } from "@/components/auth/brand-panel";
import { LanguageLinks } from "@/components/auth/language-links";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[1.25fr_1fr]">
      <BrandPanel />
      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 md:px-8">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-[var(--brand)] opacity-15 blur-3xl md:hidden" />
        <div className="relative w-full max-w-md space-y-6">
          <div className="space-y-2 text-center md:text-left">
            <h1 className="flex justify-center md:sr-only"><Logo withWordmark /></h1>
            <p className="text-sm text-muted-foreground md:hidden">{t("auth.tagline")}</p>
          </div>
          {children}
          <LanguageLinks label={t("nav.language")} />
        </div>
      </main>
    </div>
  );
}
