"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const base = "rounded-2xl bg-[linear-gradient(90deg,var(--surface-raised),var(--border),var(--surface-raised))] bg-[length:200%_100%] animate-[shimmer_1.2s_linear_infinite] motion-reduce:animate-none";

export function Shimmer({ className }: { className?: string }) { return <div aria-hidden className={cn(base, className)} />; }
export const HeroSkeleton = () => <Shimmer className="h-36 rounded-[20px]" />;
export const ChipsSkeleton = () => <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">{[0, 1, 2, 3].map((i) => <Shimmer key={i} className="h-20" />)}</div>;
export const ChartSkeleton = () => <Shimmer className="h-72" />;
export const ListSkeleton = ({ rows = 4 }: { rows?: number }) => <div className="space-y-2">{Array.from({ length: rows }, (_, i) => <Shimmer key={i} className="h-16" />)}</div>;

/** Shimmer rows for a section whose query is still loading, announced as "Loading…" to screen readers. */
export function LoadingRows({ rows = 3, rowClassName = "h-10" }: { rows?: number; rowClassName?: string }) {
  const t = useTranslations("common");
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">{t("loading")}</span>
      {Array.from({ length: rows }, (_, i) => <Shimmer key={i} className={rowClassName} />)}
    </div>
  );
}
