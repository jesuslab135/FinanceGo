"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentMethodForm } from "@/components/cards/payment-method-form";
import { ConfirmButton } from "@/components/common/confirm-button";
import { EmptyState } from "@/components/common/empty-state";
import { Meter } from "@/components/common/meter";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { PaymentMethod } from "@/lib/api/types";
import { parseISODate } from "@/lib/dates";
import {
  useCardsOverview, useCreatePaymentMethod, useDeletePaymentMethod, usePaymentMethods, useUpdatePaymentMethod,
} from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";

export default function CardsPage() {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const locale = useLocale();
  const { data: methods = [], isPending } = usePaymentMethods();
  const { data: overview = [] } = useCardsOverview();
  const create = useCreatePaymentMethod();
  const update = useUpdatePaymentMethod();
  const remove = useDeletePaymentMethod();
  const [dialog, setDialog] = useState<{ pm?: PaymentMethod } | null>(null);
  const summaryOf = (id: number) => overview.find((c) => c.payment_method_id === id);
  const credit = methods.filter((m) => m.type === "credit");
  const others = methods.filter((m) => m.type !== "credit");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("cards.title")}</h1>
        <Button onClick={() => setDialog({})}><Plus /> {t("cards.new")}</Button>
      </div>
      {!isPending && methods.length === 0 && <EmptyState>{t("common.empty")}</EmptyState>}
      {credit.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("cards.creditCards")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            {credit.map((c) => {
              const s = summaryOf(c.id);
              return (
                <Link key={c.id} href={`/cards/${c.id}`} className="block space-y-3 rounded-xl border p-4 hover:bg-accent/50" style={{ borderTopColor: c.color, borderTopWidth: 4 }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{c.nickname}</span>
                    {c.last4 && <span className="text-xs tabular-nums text-muted-foreground">···· {c.last4}</span>}
                  </div>
                  {!c.active && <Badge variant="outline">{t("common.inactive")}</Badge>}
                  {s && (
                    <>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("cards.currentBalance")}</p>
                        <p className="text-xl font-semibold"><Money cents={s.current_balance} /></p>
                      </div>
                      <p className="break-words text-xs text-muted-foreground">
                        {t("cards.amountDue")}: <Money cents={s.amount_due} className="text-foreground" /> · {format(parseISODate(s.due_on), "d MMM", { locale: locale === "en" ? enUS : es })}
                      </p>
                      {s.credit_limit != null && <Meter value={s.current_balance} max={s.credit_limit} label={t("cards.utilization")} />}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
      {others.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("cards.otherMethods")}</h2>
          <ul className="space-y-2">
            {others.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                <span className="size-3 rounded-full" style={{ background: m.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{m.nickname}{m.last4 ? ` ···· ${m.last4}` : ""}</span>
                <Badge variant="outline">{t(`cards.types.${m.type}`)}</Badge>
                {!m.active && <Badge variant="outline">{t("common.inactive")}</Badge>}
                <Button size="icon" variant="ghost" aria-label={t("common.edit")} onClick={() => setDialog({ pm: m })}><Pencil /></Button>
                <ConfirmButton onConfirm={() => remove.mutate(m.id, { onSuccess: () => toast.success(t("common.deleted")), onError: (e) => toast.error(errMsg(e)) })}>
                  <Button size="icon" variant="ghost" aria-label={t("common.delete")}><Trash2 /></Button>
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ResponsiveDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} title={t(dialog?.pm ? "cards.edit" : "cards.new")}>
        {dialog && (
          <PaymentMethodForm
            initial={dialog.pm}
            onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              if (dialog.pm) await update.mutateAsync({ id: dialog.pm.id, ...v });
              else await create.mutateAsync(v);
              toast.success(t("common.saved"));
              setDialog(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
