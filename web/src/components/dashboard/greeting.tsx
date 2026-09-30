"use client";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/auth-provider";

export function greetingKey(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 19) return "afternoon";
  return "evening";
}

export function Greeting({ now = new Date() }: { now?: Date }) {
  const t = useTranslations("dashboard.greeting");
  const locale = useLocale();
  const { user } = useAuth();
  const first = (user?.name ?? "").split(" ")[0];
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold md:text-3xl">{t(greetingKey(now.getHours()), { name: first })}</h1>
      <p className="text-sm capitalize text-muted-foreground">{format(now, "LLLL yyyy", { locale: locale === "en" ? enUS : es })}</p>
    </div>
  );
}
