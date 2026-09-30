"use client";

import { addMonths, format, subMonths } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/common/confirm-button";
import { Meter } from "@/components/common/meter";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CardPayment } from "@/lib/api/types";
import { parseISODate, parseMonthKey, toMonthKey } from "@/lib/dates";
import { useDeleteCardPayment, useStatement } from "@/lib/query/hooks";
import { CardPaymentForm } from "./card-payment-form";

export function StatementView({ cardId }: { cardId: number }) {
  const t = useTranslations();
  const locale = useLocale();
  const [cycle, setCycle] = useState<string | undefined>();
  const [paying, setPaying] = useState(false);
  const q = useStatement(cardId, cycle);
  const del = useDeleteCardPayment();
  const s = q.data;
  const fmt = (d: string, p = "d MMM") => format(parseISODate(d), p, { locale: locale === "en" ? enUS : es });

  const shift = (n: number) =>
    setCycle(toMonthKey((n > 0 ? addMonths : subMonths)(parseMonthKey(cycle ?? s?.cycle ?? toMonthKey(new Date())), Math.abs(n))));

  const paymentRow = (p: CardPayment) => (
    <li key={p.id} className="flex items-center gap-3 p-3 text-sm">
      <span className="w-16 text-muted-foreground">{fmt(p.paid_on)}</span>
      <span className="min-w-0 flex-1 truncate">{p.note}</span>
      <Money cents={p.amount} />
      <ConfirmButton onConfirm={() => del.mutate(p.id, { onSuccess: () => toast.success(t("common.deleted")), onError: (e) => toast.error(e.message) })}>
        <Button variant="ghost" size="icon" aria-label={t("common.delete")}><Trash2 /></Button>
      </ConfirmButton>
    </li>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label={t("common.previous")} onClick={() => shift(-1)}><ChevronLeft /></Button>
          <span className="text-sm font-medium">{s ? t("cards.cycle", { from: fmt(s.opens_on), to: fmt(s.closes_on) }) : "…"}</span>
          <Button variant="outline" size="icon" aria-label={t("common.next")} onClick={() => shift(1)}><ChevronRight /></Button>
        </div>
        <Button onClick={() => setPaying(true)}>{t("cards.recordPayment")}</Button>
      </div>
      {!s ? (
        q.isError ? <p role="alert" className="text-sm text-destructive">{q.error.message}</p> : <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
      <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-lg border p-4 lg:col-span-1">
          <dt className="text-xs text-muted-foreground">{t("cards.amountDue")}</dt>
          <dd className="text-2xl font-semibold"><Money cents={s.amount_due} /></dd>
          <dd className="text-xs text-muted-foreground">{t("cards.dueOn")}: {fmt(s.due_on, "PPP")}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-xs text-muted-foreground">{t("cards.billed")}</dt>
          <dd className="text-lg font-semibold"><Money cents={s.billed_balance} /></dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-xs text-muted-foreground">{t("cards.currentBalance")}</dt>
          <dd className="text-lg font-semibold"><Money cents={s.current_balance} /></dd>
        </div>
        {s.credit_limit != null && (
          <div className="col-span-2 space-y-2 rounded-lg border p-4 lg:col-span-1">
            <Meter value={s.current_balance} max={s.credit_limit} label={t("cards.utilization")} />
            <p className="text-xs text-muted-foreground">{t("cards.available")}: <Money cents={s.available_credit ?? 0} /></p>
          </div>
        )}
      </dl>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t("cards.charges")}</h3>
          {(s.charges ?? []).length === 0 && (s.installments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cards.noCharges")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {(s.charges ?? []).map((c, i) => (
                <li key={`c${i}`} className="flex items-center gap-3 p-3 text-sm">
                  <span className="w-16 text-muted-foreground">{fmt(c.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.description}</span>
                  <Badge variant="outline">{t(`cards.source.${c.source}`)}</Badge>
                  <Money cents={c.amount} />
                </li>
              ))}
              {(s.installments ?? []).map((m) => (
                <li key={`m${m.plan_id}`} className="flex items-center gap-3 p-3 text-sm">
                  <span className="w-16 text-muted-foreground">{t("cards.msiShort")}</span>
                  <span className="min-w-0 flex-1 truncate">{m.description}</span>
                  <Badge variant="outline">{t("cards.installmentOf", { no: m.no, of: m.of })}</Badge>
                  <Money cents={m.amount} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t("cards.payments")}</h3>
          <ul className="divide-y rounded-lg border">{(s.payments ?? []).map(paymentRow)}</ul>
          {(s.payments_after_close ?? []).length > 0 && (
            <>
              <h4 className="pt-2 text-xs font-medium text-muted-foreground">{t("cards.paymentsAfterClose")}</h4>
              <ul className="divide-y rounded-lg border">{(s.payments_after_close ?? []).map(paymentRow)}</ul>
            </>
          )}
        </div>
      </div>
      </>
      )}
      <ResponsiveDialog open={paying} onOpenChange={setPaying} title={t("cards.recordPayment")}>
        <CardPaymentForm cardId={cardId} defaultAmount={s?.amount_due ?? 0} onDone={() => setPaying(false)} />
      </ResponsiveDialog>
    </section>
  );
}
