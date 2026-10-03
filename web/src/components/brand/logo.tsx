import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** The FinanceGo mark (same shapes as src/app/icon.svg) with an optional wordmark. Decorative: the wordmark, or the aria-label, names it. */
export function Logo({ size = 32, withWordmark = false, className }: { size?: number; withWordmark?: boolean; className?: string }) {
  const t = useTranslations("common");
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width={size} height={size} viewBox="0 0 64 64" role={withWordmark ? undefined : "img"} aria-hidden={withWordmark || undefined} aria-label={withWordmark ? undefined : t("appName")}>
        <rect width="64" height="64" rx="14" fill="var(--brand)" />
        <path d="M18 44V20h22v6H25v4h13v6H25v8z" fill="#fff" />
        <circle cx="45" cy="41" r="5" fill="var(--accent-teal)" />
      </svg>
      {withWordmark && <span className="font-display text-xl font-extrabold tracking-tight">{t("appName")}</span>}
    </span>
  );
}
