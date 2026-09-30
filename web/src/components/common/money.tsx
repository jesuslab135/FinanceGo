"use client";
import { useLocale } from "next-intl";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useMe } from "@/lib/query/hooks";

export function useFormatMoney() {
  const locale = useLocale();
  const currency = useMe().data?.currency ?? "MXN";
  return useCallback((cents: number) => formatMoney(cents, currency, locale), [currency, locale]);
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  const fmt = useFormatMoney();
  return <span className={cn("num", className)}>{fmt(cents)}</span>;
}
