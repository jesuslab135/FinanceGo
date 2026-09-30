"use client";

import { ArrowLeft, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteCardButton } from "@/components/cards/delete-card-button";
import { PaymentMethodForm } from "@/components/cards/payment-method-form";
import { PlansList } from "@/components/cards/plans-list";
import { StatementView } from "@/components/cards/statement-view";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { usePaymentMethods, useUpdatePaymentMethod } from "@/lib/query/hooks";

export default function CardPage() {
  const t = useTranslations();
  const id = Number(useParams<{ id: string }>().id);
  const { data: methods, isPending } = usePaymentMethods();
  const update = useUpdatePaymentMethod();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const pm = methods?.find((m) => m.id === id);

  if (isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!pm) return <p role="alert">{t("common.error")}</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("nav.cards")}><Link href="/cards"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{pm.nickname}{pm.last4 ? ` ···· ${pm.last4}` : ""}</h1>
        <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> {t("common.edit")}</Button>
        <DeleteCardButton id={id} onDeleted={() => router.replace("/cards")} />
      </div>
      {pm.type === "credit" ? (
        <>
          <StatementView cardId={id} cardName={pm.nickname} />
          <PlansList cardId={id} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("cards.notCredit")}</p>
      )}
      <ResponsiveDialog open={editing} onOpenChange={setEditing} title={t("cards.edit")}>
        <PaymentMethodForm
          initial={pm}
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            await update.mutateAsync({ id, ...v });
            toast.success(t("common.saved"));
            setEditing(false);
          }}
        />
      </ResponsiveDialog>
    </div>
  );
}
