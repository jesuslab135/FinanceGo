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
  { key: "internet", labelKey: "welcome.sug.internet", icon: "wifi" },
  { key: "phone", labelKey: "welcome.sug.phone", icon: "smartphone" },
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

// Session memory next to the stored flag: if localStorage throws (private mode, blocked site data) the stored flag can
// neither be written nor read, and without this the layout would send a user who skipped straight back to /welcome.
const settledThisSession = new Set<number>();
/** Records, for this page session, that the user skipped or already saved an income: never redirect them to /welcome. */
export function markOnboardingSettled(userId: number): void { settledThisSession.add(userId); }
export function isOnboardingSettled(userId: number): boolean { return settledThisSession.has(userId); }
