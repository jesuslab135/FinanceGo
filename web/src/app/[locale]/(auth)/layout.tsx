import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">{t("common.appName")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.tagline")}</p>
      </div>
      {children}
      <nav className="flex justify-center gap-3 text-sm" aria-label={t("nav.language")}>
        <Link href="/login" locale="es" className="underline-offset-4 hover:underline">Español</Link>
        <Link href="/login" locale="en" className="underline-offset-4 hover:underline">English</Link>
      </nav>
    </main>
  );
}
