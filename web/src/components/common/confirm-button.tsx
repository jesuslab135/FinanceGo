"use client";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** Asks for confirmation before `onConfirm`. Defaults describe a delete; pass labels for other actions. */
export function ConfirmButton({ onConfirm, children, description, actionLabel, cancelLabel }: {
  onConfirm: () => void;
  children: ReactNode;
  description?: string;
  actionLabel?: string;
  cancelLabel?: string;
}) {
  const t = useTranslations("common");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{description ?? t("confirmDelete")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel ?? t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{actionLabel ?? t("delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
