"use client";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { QuickAdd } from "@/components/expenses/quick-add";
import { isActive, navItems } from "./nav-items";
import { UserMenu } from "./user-menu";

export function BottomNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const items = navItems();
  const primary = items.filter((i) => i.key === "dashboard" || i.key === "expenses" || i.key === "cards");
  const rest = items.filter((i) => !primary.includes(i));
  const tab = (item: (typeof items)[number]) => (
    <Link
      key={item.key}
      href={item.href}
      aria-current={isActive(pathname, item) ? "page" : undefined}
      className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", isActive(pathname, item) ? "text-foreground" : "text-muted-foreground")}
    >
      <item.icon className="size-5" aria-hidden />
      {t(`nav.${item.key}`)}
    </Link>
  );
  return (
    <>
      <nav
        aria-label={t("nav.mainNav")}
        className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {tab(primary[0])}
        {tab(primary[1])}
        <div className="flex flex-1 justify-center"><QuickAdd variant="fab" /></div>
        {tab(primary[2])}
        <button type="button" onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
          <Menu className="size-5" aria-hidden />
          {t("nav.more")}
        </button>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8" closeLabel={t("common.close")}>
          <SheetHeader><SheetTitle>{t("nav.more")}</SheetTitle></SheetHeader>
          <div className="flex flex-col gap-1 px-4">
            {rest.map((item) => (
              <Link key={item.key} href={item.href} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-md px-2 py-3 hover:bg-accent">
                <item.icon className="size-5" aria-hidden />
                {t(`nav.${item.key}`)}
              </Link>
            ))}
            <UserMenu />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
