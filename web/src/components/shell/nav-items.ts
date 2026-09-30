import { CalendarDays, CreditCard, LayoutDashboard, Receipt, Repeat, Settings, Tags, type LucideIcon } from "lucide-react";
import { toMonthKey } from "@/lib/dates";

export type NavItem = { key: "dashboard" | "expenses" | "month" | "recurring" | "cards" | "categories" | "settings"; href: string; icon: LucideIcon };

export function navItems(): NavItem[] {
  return [
    { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
    { key: "expenses", href: "/expenses", icon: Receipt },
    { key: "month", href: `/month/${toMonthKey(new Date())}`, icon: CalendarDays },
    { key: "recurring", href: "/recurring", icon: Repeat },
    { key: "cards", href: "/cards", icon: CreditCard },
    { key: "categories", href: "/categories", icon: Tags },
    { key: "settings", href: "/settings", icon: Settings },
  ];
}

export function isActive(pathname: string, item: NavItem): boolean {
  const root = "/" + item.href.split("/")[1];
  return pathname === root || pathname.startsWith(root + "/");
}
