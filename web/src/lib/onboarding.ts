import type { Category } from "@/lib/api/types";

/** Routes that never bounce to /welcome (pathname is locale-free, from next-intl's usePathname). */
const EXEMPT_PREFIXES = ["/welcome", "/settings"];

/**
 * Decides whether the app layout should send the user to /welcome. It is deliberately conservative:
 * anything unknown (still loading, query failed, so no count) means "stay", so nobody is ever trapped.
 */
export function needsOnboarding(p: {
  status: "loading" | "authenticated" | "anonymous";
  incomeCount: number | undefined;
  skipped: boolean;
  pathname: string;
}): "redirect" | "stay" {
  if (p.status !== "authenticated" || p.incomeCount === undefined) return "stay";
  if (p.skipped || p.incomeCount > 0) return "stay";
  if (EXEMPT_PREFIXES.some((x) => p.pathname === x || p.pathname.startsWith(`${x}/`))) return "stay";
  return "redirect";
}

export const FIXED_SUGGESTIONS = [
  { key: "rent", labelKey: "welcome.sug.rent", icon: "home" },
  { key: "power", labelKey: "welcome.sug.power", icon: "zap" },
  { key: "water", labelKey: "welcome.sug.water", icon: "zap" },
  { key: "internet", labelKey: "welcome.sug.internet", icon: "zap" },
  { key: "phone", labelKey: "welcome.sug.phone", icon: "zap" },
  { key: "netflix", labelKey: "welcome.sug.netflix", icon: "repeat" },
  { key: "gym", labelKey: "welcome.sug.gym", icon: "heart-pulse" },
  { key: "insurance", labelKey: "welcome.sug.insurance", icon: "tag" },
] as const;

/** Matches by icon key (names are localized and user-editable), falling back to the first expense category. */
export function categoryForIcon(categories: Pick<Category, "id" | "kind" | "icon">[], icon: string): number | undefined {
  const expense = categories.filter((c) => c.kind === "expense");
  return (expense.find((c) => c.icon === icon) ?? expense[0])?.id;
}

export const ONBOARDING_SKIPPED = "onboarding-skipped";
