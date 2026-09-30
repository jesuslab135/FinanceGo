"use client";
import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations("cards");
  return <h1 className="text-2xl font-semibold">{t("title")}</h1>;
}
