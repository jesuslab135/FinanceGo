"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useCreateExpense } from "@/lib/query/hooks";
import { ExpenseForm } from "./expense-form";

export function QuickAdd({ variant }: { variant: "fab" | "button" }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const create = useCreateExpense();
  return (
    <>
      {variant === "fab" ? (
        <Button size="icon" className="-mt-6 size-14 rounded-full shadow-lg" aria-label={t("nav.quickAdd")} onClick={() => setOpen(true)}>
          <Plus className="size-6" />
        </Button>
      ) : (
        <Button className="w-full" onClick={() => setOpen(true)}><Plus /> {t("nav.quickAdd")}</Button>
      )}
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t("expenses.new")}>
        <ExpenseForm
          onCancel={() => setOpen(false)}
          onSubmit={async (v) => {
            await create.mutateAsync(v);
            toast.success(t("common.saved"));
            setOpen(false);
          }}
        />
      </ResponsiveDialog>
    </>
  );
}
