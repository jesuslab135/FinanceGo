"use client";
import { addMonths, format, subMonths } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseMonthKey, toMonthKey } from "@/lib/dates";

export function MonthNav({ month, basePath }: { month: string; basePath: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const d = parseMonthKey(month);
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="icon" aria-label={t("previous")}>
        <Link href={`${basePath}/${toMonthKey(subMonths(d, 1))}`}><ChevronLeft /></Link>
      </Button>
      <span className="min-w-36 text-center font-medium capitalize">{format(d, "LLLL yyyy", { locale: locale === "en" ? enUS : es })}</span>
      <Button asChild variant="outline" size="icon" aria-label={t("next")}>
        <Link href={`${basePath}/${toMonthKey(addMonths(d, 1))}`}><ChevronRight /></Link>
      </Button>
    </div>
  );
}
