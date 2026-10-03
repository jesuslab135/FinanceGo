"use client";
import { useLocale } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { isOnboardingSkipped, needsOnboarding } from "@/lib/onboarding";
import { useIncomeSources } from "@/lib/query/hooks";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const incomes = useIncomeSources();
  const incomeCount = incomes.data?.length;
  const skipped = user ? isOnboardingSkipped(user.id) : false;
  const decision = needsOnboarding({ status, incomeCount, skipped, pathname });
  // While the income list is still loading, hold back the page if an empty list would send this user to /welcome,
  // so a new user never sees the dashboard flash. An errored query has no count, so it falls through to "stay", and
  // after the first failed attempt (retries continue in the background) the page is no longer held back.
  const checking = incomes.isPending && incomes.failureCount === 0 && needsOnboarding({ status, incomeCount: 0, skipped, pathname }) === "redirect";

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (decision === "redirect") router.replace("/welcome");
  }, [decision, router]);

  useEffect(() => {
    if (user?.locale && user.locale !== locale) router.replace(pathname, { locale: user.locale as "es" | "en" });
  }, [user?.locale, locale, pathname, router]);

  if (status !== "authenticated" || checking || decision === "redirect") {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground" aria-busy>…</div>;
  }
  return <AppShell>{children}</AppShell>;
}
