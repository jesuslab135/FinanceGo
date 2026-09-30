"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/common/confirm-button";
import { Meter } from "@/components/common/meter";
import { Money, useFormatMoney } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InstallmentPlan } from "@/lib/api/types";
import { useCancelPlan, useCreatePlan, usePlans, useUpdatePlan } from "@/lib/query/hooks";
import { PlanForm } from "./plan-form";
import { useErrorMessage } from "@/lib/api/error-messages";

export function PlansList({ cardId }: { cardId: number }) {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const fmt = useFormatMoney();
  const { data: plans = [] } = usePlans(cardId);
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const cancel = useCancelPlan();
  const [dialog, setDialog] = useState<{ plan?: InstallmentPlan } | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("cards.msi")}</h2>
        <Button variant="outline" onClick={() => setDialog({})}><Plus /> {t("cards.newMsi")}</Button>
      </div>
      <ul className="space-y-2">
        {plans.map((p) => (
          <li key={p.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-medium">{p.description}</p>
              {p.cancelled_on && <Badge variant="outline">{t("cards.cancelled")}</Badge>}
              <span className="text-sm text-muted-foreground">{t("cards.perMonth", { amount: fmt(p.installment_amount) })}</span>
              {!p.cancelled_on && (
                <>
                  <Button size="icon" variant="ghost" aria-label={t("common.edit")} onClick={() => setDialog({ plan: p })}><Pencil /></Button>
                  <ConfirmButton
                    actionLabel={t("cards.cancelPlan")}
                    cancelLabel={t("cards.keepPlan")}
                    description={t("cards.cancelPlanConfirm")}
                    onConfirm={() =>
                      cancel.mutate(p.id, {
                        onSuccess: () => toast.success(t("common.saved")),
                        onError: (e) => toast.error(errMsg(e)),
                      })
                    }
                  >
                    <Button size="sm" variant="ghost">{t("cards.cancelPlan")}</Button>
                  </ConfirmButton>
                </>
              )}
            </div>
            <Meter value={p.billed_count} max={p.installments} label={t("cards.installmentOf", { no: p.billed_count, of: p.installments })} />
            <p className="text-xs text-muted-foreground">
              {t("cards.totalAmount")}: <Money cents={p.total_amount} /> · {t("cards.remaining")}: <Money cents={p.remaining_amount} />
            </p>
          </li>
        ))}
      </ul>
      <ResponsiveDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} title={t(dialog?.plan ? "cards.editMsi" : "cards.newMsi")}>
        {dialog && (
          <PlanForm
            cardId={cardId}
            initial={dialog.plan}
            onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              if (dialog.plan) await update.mutateAsync({ id: dialog.plan.id, ...v });
              else await create.mutateAsync(v);
              toast.success(t("common.saved"));
              setDialog(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </section>
  );
}
