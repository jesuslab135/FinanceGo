"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/errors";
import type { Category, CategoryInput } from "@/lib/api/types";

export function CategoryForm({ initial, onSubmit, onCancel }: {
  initial?: Partial<Category>; onSubmit: (v: CategoryInput) => Promise<void>; onCancel?: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"expense" | "income">((initial?.kind as "expense" | "income") ?? "expense");
  const [color, setColor] = useState(initial?.color ?? "#64748b");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: t("validation.required") });
    setErrors({});
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), kind, color, icon: initial?.icon ?? "tag" });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="cat-name">{t("categories.name")}</Label>
        <Input id="cat-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
        <FieldError message={errors.name} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cat-kind">{t("categories.kind")}</Label>
          <select id="cat-kind" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-60" disabled={initial?.id !== undefined}
            value={kind} onChange={(e) => setKind(e.target.value as "expense" | "income")}>
            <option value="expense">{t("categories.kinds.expense")}</option>
            <option value="income">{t("categories.kinds.income")}</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-color">{t("categories.color")}</Label>
          <input id="cat-color" type="color" className="h-9 w-full rounded border" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={busy}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
