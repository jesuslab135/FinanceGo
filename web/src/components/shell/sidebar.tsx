"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { QuickAdd } from "@/components/expenses/quick-add";
import { isActive, navItems } from "./nav-items";
import { UserMenu } from "./user-menu";

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r p-4 md:flex">
      <Logo withWordmark className="px-2" />
      <QuickAdd variant="button" />
      <nav aria-label={t("nav.mainNav")} className="flex flex-1 flex-col gap-1">
        {navItems().map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive(pathname, item) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2 font-display text-sm hover:bg-accent",
              isActive(pathname, item) && "bg-accent font-medium",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {t(`nav.${item.key}`)}
          </Link>
        ))}
      </nav>
      <UserMenu />
    </aside>
  );
}
