"use client";
import { Languages, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { useUpdateMe } from "@/lib/query/hooks";

export function UserMenu() {
  const t = useTranslations("nav");
  const { user, logout, setUser } = useAuth();
  const { setTheme } = useTheme();
  const router = useRouter();
  const updateMe = useUpdateMe();

  const switchLocale = async (locale: "es" | "en") => {
    if (!user) return;
    try {
      const u = await updateMe.mutateAsync({ name: user.name ?? "", currency: user.currency ?? "MXN", timezone: user.timezone ?? "UTC", locale });
      setUser(u); // the (app) layout redirects to the new locale
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-start truncate">{user?.name ?? user?.email}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("theme")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}><Sun /> {t("themeLight")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}><Moon /> {t("themeDark")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}><Monitor /> {t("themeSystem")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("language")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => switchLocale("es")}><Languages /> Español</DropdownMenuItem>
        <DropdownMenuItem onClick={() => switchLocale("en")}><Languages /> English</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { await logout(); router.replace("/login"); }}><LogOut /> {t("logout")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
