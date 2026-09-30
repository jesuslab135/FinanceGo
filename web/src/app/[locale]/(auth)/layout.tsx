import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LanguageLinks } from "@/components/auth/language-links";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">{t("common.appName")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.tagline")}</p>
      </div>
      {children}
      <LanguageLinks label={t("nav.language")} />
    </main>
  );
}
