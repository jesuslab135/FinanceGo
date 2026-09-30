"use client";
import { CreditCard, Landmark } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { Segmented } from "@/components/motion/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentMethodInput } from "@/lib/api/types";
import { applyApiError } from "@/lib/forms";
import { useCreatePaymentMethod } from "@/lib/query/hooks";
import { StepActions } from "./progress";

export type AddedCard = { id: number; nickname: string; type: "credit" | "debit"; last4: string };
type Values = { nickname: string; type: "credit" | "debit"; last4: string; statement_day: string; payment_due_day: string };
const EMPTY: Values = { nickname: "", type: "credit", last4: "", statement_day: "1", payment_due_day: "20" };

export function StepCards({ cards, onAdded, onBack, onFinish }: {
  cards: AddedCard[]; onAdded: (c: AddedCard) => void; onBack: () => void; onFinish: () => void;
}) {
  const t = useTranslations();
  const create = useCreatePaymentMethod();
  const form = useForm<Values>({ defaultValues: EMPTY });
  const type = useWatch({ control: form.control, name: "type" });
  const { errors } = form.formState;
  const [busy, setBusy] = useState(false);
  const credit = type === "credit";

  /** Returns true when the card was saved. */
  const add = async (): Promise<boolean> => {
    if (busy) return false;
    form.clearErrors();
    const v = form.getValues();
    const nickname = v.nickname.trim();
    const last4 = v.last4.trim();
    const sDay = Number(v.statement_day);
    const dDay = Number(v.payment_due_day);
    let bad = false;
    if (!nickname) { form.setError("nickname", { message: t("validation.required") }); bad = true; }
    if (last4 !== "" && !/^\d{4}$/.test(last4)) { form.setError("last4", { message: t("validation.last4") }); bad = true; }
    if (v.type === "credit") {
      if (!Number.isInteger(sDay) || sDay < 1 || sDay > 31) { form.setError("statement_day", { message: t("validation.day") }); bad = true; }
      if (!Number.isInteger(dDay) || dDay < 1 || dDay > 31) { form.setError("payment_due_day", { message: t("validation.day") }); bad = true; }
    }
    if (bad) return false;
    // Generated types are `T | undefined`; the Go API takes JSON null for these pointer fields.
    const body = {
      nickname, type: v.type, bank: null, network: null, last4: last4 || null, color: "#64748b", active: true,
      credit_limit: null, statement_day: v.type === "credit" ? sDay : null, payment_due_day: v.type === "credit" ? dDay : null,
      opening_balance: 0, opening_balance_date: null,
    } as unknown as PaymentMethodInput;
    setBusy(true);
    try {
      const saved = await create.mutateAsync(body);
      onAdded({ id: saved.id, nickname, type: v.type, last4 });
      form.reset({ ...EMPTY, type: v.type });
      return true;
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m), t);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // A half-filled card is saved by Finish rather than silently dropped; an empty form just finishes.
  const finish = async () => {
    if (form.getValues("nickname").trim() && !(await add())) return;
    onFinish();
  };

  return (
    <div className="space-y-5">
      {cards.length > 0 && (
        <ul aria-label={t("welcome.cardsAdded")} className="grid grid-cols-2 gap-2">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-2xl border bg-card p-3">
              {c.type === "credit" ? <CreditCard className="size-5 shrink-0 text-brand" aria-hidden /> : <Landmark className="size-5 shrink-0 text-brand" aria-hidden />}
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium">{c.nickname}</span>
                {c.last4 && <span className="block text-xs text-muted-foreground tabular-nums">···· {c.last4}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void add(); }} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="welcome-card-nickname">{t("cards.nickname")}</Label>
          <Input id="welcome-card-nickname" aria-invalid={!!errors.nickname} {...form.register("nickname")} />
          <FieldError message={errors.nickname?.message} />
        </div>
        <div className="space-y-2">
          <span id="welcome-card-type" className="text-sm font-medium">{t("welcome.cardType")}</span>
          <div>
            <Segmented
              ariaLabel={t("welcome.cardType")}
              value={type}
              onChange={(v) => form.setValue("type", v)}
              options={[{ value: "credit", label: t("cards.types.credit") }, { value: "debit", label: t("cards.types.debit") }]}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="welcome-card-last4">{t("cards.last4")}</Label>
          <Input id="welcome-card-last4" inputMode="numeric" maxLength={4} autoComplete="off" aria-invalid={!!errors.last4} {...form.register("last4")} />
          <FieldError message={errors.last4?.message} />
        </div>
        {credit && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="welcome-card-statement">{t("cards.statementDay")}</Label>
              <Input id="welcome-card-statement" type="number" inputMode="numeric" min={1} max={31} aria-invalid={!!errors.statement_day} {...form.register("statement_day")} />
              <FieldError message={errors.statement_day?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="welcome-card-due">{t("cards.paymentDueDay")}</Label>
              <Input id="welcome-card-due" type="number" inputMode="numeric" min={1} max={31} aria-invalid={!!errors.payment_due_day} {...form.register("payment_due_day")} />
              <FieldError message={errors.payment_due_day?.message} />
            </div>
          </div>
        )}
        <Button type="submit" variant="outline" className="min-h-11 px-4" disabled={busy}>
          {cards.length > 0 ? t("welcome.addCard") : t("welcome.cardAdd")}
        </Button>
      </form>
      <StepActions onBack={onBack}>
        <Button type="button" className="min-h-11 px-6" disabled={busy} onClick={() => void finish()}>{t("welcome.finish")}</Button>
      </StepActions>
    </div>
  );
}
