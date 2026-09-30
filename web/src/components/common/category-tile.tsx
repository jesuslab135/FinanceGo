import { createElement } from "react";
import { iconFor } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

const SIZES = { sm: "size-8 rounded-[10px] [&>svg]:size-4", md: "size-10 rounded-xl [&>svg]:size-5", lg: "size-14 rounded-2xl [&>svg]:size-7" };

/** Lucide icon on a tile tinted with the category color (15% light / 22% dark). */
export function CategoryTile({ icon, color, size = "md", className }: { icon?: string; color?: string; size?: keyof typeof SIZES; className?: string }) {
  const c = color ?? "#8a7766";
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center bg-[color-mix(in_srgb,var(--tile)_15%,transparent)] dark:bg-[color-mix(in_srgb,var(--tile)_22%,transparent)]", SIZES[size], className)}
      style={{ ["--tile" as string]: c, color: c }}
    >
      {createElement(iconFor(icon), { strokeWidth: 1.75 })}
    </span>
  );
}
