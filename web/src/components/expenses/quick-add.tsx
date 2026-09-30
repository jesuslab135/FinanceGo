"use client";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function QuickAdd({ variant }: { variant: "fab" | "button" }) {
  const t = useTranslations("nav");
  return variant === "fab" ? (
    <Button size="icon" className="-mt-6 size-14 rounded-full shadow-lg" aria-label={t("quickAdd")}><Plus className="size-6" /></Button>
  ) : (
    <Button className="w-full"><Plus /> {t("quickAdd")}</Button>
  );
}
