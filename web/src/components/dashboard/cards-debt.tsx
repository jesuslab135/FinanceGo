"use client";

import { useTranslations } from "next-intl";
import { Meter } from "@/components/common/meter";
import { Money } from "@/components/common/money";
import { Link } from "@/i18n/navigation";
import { useCardsOverview } from "@/lib/query/hooks";

export function CardsDebt() {
  const t = useTranslations("cards");
  const td = useTranslations("dashboard");
  const { data = [] } = useCardsOverview();
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">{td("cardsDebt")}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-4">
          {data.map((c) => (
            <li key={c.payment_method_id}>
              <Link href={`/cards/${c.payment_method_id}`} className="block space-y-1 rounded-md hover:bg-accent/40">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{c.nickname}{c.last4 ? ` ···· ${c.last4}` : ""}</span>
                  <Money cents={c.current_balance} className="font-semibold" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("amountDue")}: <Money cents={c.amount_due} className="text-foreground" /> · {t("dueOn")} {c.due_on}
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
