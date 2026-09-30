"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/common/confirm-button";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/lib/api/error-messages";
import { useDeletePaymentMethod } from "@/lib/query/hooks";

/** Deletes a payment method after confirmation; a method with records (409) gets the "deactivate instead" message. */
export function DeleteCardButton({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const t = useTranslations("common");
  const errMsg = useErrorMessage();
  const remove = useDeletePaymentMethod();
  return (
    <ConfirmButton
      onConfirm={() =>
        remove.mutate(id, {
          onSuccess: () => {
            toast.success(t("deleted"));
            onDeleted();
          },
          onError: (e) => toast.error(errMsg(e)),
        })
      }
    >
      <Button variant="outline" disabled={remove.isPending}><Trash2 /> {t("delete")}</Button>
    </ConfirmButton>
  );
}
