import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Rounded row tile: leading (tile), title + meta, amount, trailing (menu). */
export function ListRow({ leading, title, meta, amount, trailing, className, muted }: {
  leading?: ReactNode; title: ReactNode; meta?: ReactNode; amount?: ReactNode; trailing?: ReactNode; className?: string; muted?: boolean;
}) {
  return (
    <div className={cn("flex min-h-16 items-center gap-3 rounded-2xl bg-surface-raised px-3 py-2.5 shadow-card", muted && "opacity-60", className)}>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      {amount && <div className="num shrink-0 text-right font-semibold">{amount}</div>}
      {trailing}
    </div>
  );
}
