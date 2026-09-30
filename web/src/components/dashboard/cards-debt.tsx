"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { Meter } from "@/components/common/meter";
import { Money } from "@/components/common/money";
import { QueryError } from "@/components/common/query-error";
import { Link } from "@/i18n/navigation";
import { parseISODate } from "@/lib/dates";
import { useCardsOverview } from "@/lib/query/hooks";

export function CardsDebt() {
  const t = useTranslations("cards");
  const td = useTranslations("dashboard");
  const locale = useLocale();
  const { data = [], error } = useCardsOverview();
  return (
    <section className="h-full min-w-0 space-y-3 rounded-2xl bg-card p-4 shadow-card md:p-5">
      <h2 className="font-display text-base font-bold">{td("cardsDebt")}</h2>
      {error ? (
        <QueryError error={error} />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{td("noData")}</p>
      ) : (
        <ul className="space-y-4">
          {data.map((c) => (
            <li key={c.payment_method_id}>
              <Link href={`/cards/${c.payment_method_id}`} className="block space-y-1 rounded-md hover:bg-accent/40">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{c.nickname}{c.last4 ? ` ···· ${c.last4}` : ""}</span>
                  <Money cents={c.current_balance} className="font-semibold" />
                </div>
                <p className="break-words text-xs text-muted-foreground">
                  {t("amountDue")}: <Money cents={c.amount_due} className="text-foreground" /> · {t("dueOn")} {format(parseISODate(c.due_on), "d MMM yyyy", { locale: locale === "en" ? enUS : es })}
                </p>
                {c.credit_limit != null && <Meter value={c.current_balance} max={c.credit_limit} label={t("utilization")} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
