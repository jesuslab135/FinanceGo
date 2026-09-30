import { cn } from "@/lib/utils";

const base = "rounded-2xl bg-[linear-gradient(90deg,var(--surface-raised),var(--border),var(--surface-raised))] bg-[length:200%_100%] animate-[shimmer_1.2s_linear_infinite] motion-reduce:animate-none";

export function Shimmer({ className }: { className?: string }) { return <div aria-hidden className={cn(base, className)} />; }
export const HeroSkeleton = () => <Shimmer className="h-36 rounded-[20px]" />;
export const ChipsSkeleton = () => <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3 md:gap-3">{[0, 1, 2].map((i) => <Shimmer key={i} className="h-20" />)}</div>;
export const ChartSkeleton = () => <Shimmer className="h-72" />;
export const ListSkeleton = ({ rows = 4 }: { rows?: number }) => <div className="space-y-2">{Array.from({ length: rows }, (_, i) => <Shimmer key={i} className="h-16" />)}</div>;
