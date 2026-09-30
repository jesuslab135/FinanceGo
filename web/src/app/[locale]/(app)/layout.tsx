"use client";
import { useLocale } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (user?.locale && user.locale !== locale) router.replace(pathname, { locale: user.locale as "es" | "en" });
  }, [user?.locale, locale, pathname, router]);

  if (status !== "authenticated") {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground" aria-busy>…</div>;
  }
  return <AppShell>{children}</AppShell>;
}
