"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { Meter } from "@/components/common/meter";
import { useFormatMoney } from "@/components/common/money";
import { Link } from "@/i18n/navigation";
import type { CardSummary, PaymentMethod } from "@/lib/api/types";
import { cardPalette } from "@/lib/contrast";
import { parseISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const NETWORK_LABEL: Record<string, string> = { visa: "VISA", mastercard: "MASTERCARD", amex: "AMEX" };

/** A payment card drawn as a physical card; credit cards add balance, amount due and a utilization bar. */
export function CardTile({ pm, summary, href }: { pm: PaymentMethod; summary?: CardSummary; href?: string }) {
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fmt = useFormatMoney();
  const color = /^#[0-9a-f]{6}$/i.test(pm.color) ? pm.color : "#8a7766";
  const { from, ink } = cardPalette(color);
  const network = (pm.network && NETWORK_LABEL[pm.network]) || t(`types.${pm.type}`);
  const due = summary ? format(parseISODate(summary.due_on), "d MMM", { locale: locale === "en" ? enUS : es }) : "";

  const tile = (
    <div
      className={cn(
        "flex aspect-[1.586] w-full max-w-sm flex-col justify-between rounded-2xl p-5 shadow-card transition motion-reduce:transform-none",
        href && "hover:-translate-y-0.5 hover:shadow-lg",
      )}
      style={{ background: `linear-gradient(135deg, ${from}, color-mix(in srgb, ${from} 55%, #000))`, color: ink }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate font-display font-bold">{pm.nickname}</span>
        <span className="shrink-0 text-xs tracking-widest">{network}</span>
      </div>
      <div className="space-y-2">
        <p className="num text-lg tracking-[0.2em]">{pm.last4 ? `···· ${pm.last4}` : "····"}</p>
        {!pm.active && <span className="inline-block rounded-full border border-current px-2 text-[10px] font-medium uppercase">{tc("inactive")}</span>}
      </div>
      {pm.type === "credit" && summary ? (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="num truncate font-display text-xl font-bold">{fmt(summary.current_balance)}</span>
            <span className="num shrink-0 text-xs">{t("payShort", { amount: fmt(summary.amount_due), date: due })}</span>
          </div>
          {summary.credit_limit != null && <Meter tone="onDark" ink={ink} value={summary.current_balance} max={summary.credit_limit} label={t("utilization")} />}
        </div>
      ) : (
        <span aria-hidden />
      )}
    </div>
  );

  return href ? <Link href={href} aria-label={`${pm.nickname}${pm.last4 ? ` ···· ${pm.last4}` : ""}`} className="block max-w-sm rounded-2xl">{tile}</Link> : tile;
}
