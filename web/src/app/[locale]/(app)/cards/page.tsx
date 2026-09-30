"use client";

import { ArrowLeftRight, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { CardTile } from "@/components/cards/card-tile";
import { PaymentMethodForm } from "@/components/cards/payment-method-form";
import { ConfirmButton } from "@/components/common/confirm-button";
import { EmptyState } from "@/components/common/empty-state";
import { ListRow } from "@/components/common/list-row";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { PaymentMethod } from "@/lib/api/types";
import {
  useCardsOverview, useCreatePaymentMethod, useDeletePaymentMethod, usePaymentMethods, useUpdatePaymentMethod,
} from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";

export default function CardsPage() {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const { data: methods = [], isPending } = usePaymentMethods();
  const { data: overview = [] } = useCardsOverview();
  const create = useCreatePaymentMethod();
  const update = useUpdatePaymentMethod();
  const remove = useDeletePaymentMethod();
  const [dialog, setDialog] = useState<{ pm?: PaymentMethod } | null>(null);
  const summaryOf = (id: number) => overview.find((c) => c.payment_method_id === id);
  const others = methods.filter((m) => m.type !== "credit" && m.type !== "debit");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("cards.title")}</h1>
        <Button size="touch" onClick={() => setDialog({})}><Plus /> {t("cards.new")}</Button>
      </div>
      {!isPending && methods.length === 0 && <EmptyState illustration="cards" action={<Button size="touch" onClick={() => setDialog({})}><Plus /> {t("cards.new")}</Button>}>{t("common.empty")}</EmptyState>}
      {(["credit", "debit"] as const).map((type) => {
        const list = methods.filter((m) => m.type === type);
        return list.length === 0 ? null : (
          <section key={type} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">{t(type === "credit" ? "cards.creditCards" : "cards.debitCards")}</h2>
            <div className="grid justify-items-center gap-4 sm:grid-cols-2 sm:justify-items-start lg:grid-cols-3 [&>*]:w-full [&>*]:min-w-0">
              {list.map((c) => <CardTile key={c.id} pm={c} summary={summaryOf(c.id)} href={`/cards/${c.id}`} />)}
            </div>
          </section>
        );
      })}
      {others.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("cards.otherMethods")}</h2>
          <ul className="space-y-2">
            {others.map((m) => (
              <li key={m.id}>
                <ListRow
                  muted={!m.active}
                  leading={
                    <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--tile)_15%,transparent)] dark:bg-[color-mix(in_srgb,var(--tile)_22%,transparent)]" style={{ ["--tile" as string]: m.color, color: m.color }}>
                      {m.type === "cash" ? <Wallet className="size-5" /> : <ArrowLeftRight className="size-5" />}
                    </span>
                  }
                  title={`${m.nickname}${m.last4 ? ` ···· ${m.last4}` : ""}`}
                  meta={`${t(`cards.types.${m.type}`)}${m.active ? "" : ` · ${t("common.inactive")}`}`}
                  trailing={
                    <div className="flex shrink-0 items-center">
                      <Button size="icon" variant="ghost" className="size-11" aria-label={t("common.edit")} onClick={() => setDialog({ pm: m })}><Pencil /></Button>
                      <ConfirmButton onConfirm={() => remove.mutate(m.id, { onSuccess: () => toast.success(t("common.deleted")), onError: (e) => toast.error(errMsg(e)) })}>
                        <Button size="icon" variant="ghost" className="size-11" aria-label={t("common.delete")}><Trash2 /></Button>
                      </ConfirmButton>
                    </div>
                  }
                />
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
