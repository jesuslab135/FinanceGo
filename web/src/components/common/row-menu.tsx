"use client";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string; icon: LucideIcon; onSelect: () => void; destructive?: boolean;
  /** Where focus goes when the menu closes after this action, for actions that remove the row (and so its trigger). */
  focusAfter?: () => HTMLElement | null;
};

export function RowMenu({ actions, rowId }: { actions: RowAction[]; rowId?: string | number }) {
  const t = useTranslations("common");
  const chosen = useRef<RowAction | null>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("more")} data-row-menu={rowId}><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(e) => {
          const target = chosen.current?.focusAfter?.();
          chosen.current = null;
          if (target) { e.preventDefault(); target.focus(); }
        }}
      >
        {actions.map((a) => (
          <DropdownMenuItem key={a.label} onSelect={() => { chosen.current = a; a.onSelect(); }} className={a.destructive ? "min-h-11 text-destructive focus:text-accent-foreground [&_svg]:text-destructive" : "min-h-11"}>
            <a.icon /> {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
