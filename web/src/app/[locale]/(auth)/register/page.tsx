"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { ApiError } from "@/lib/api/errors";
import { applyApiError } from "@/lib/forms";
import { CURRENCIES, timezones } from "@/lib/locale-options";

export default function RegisterPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { register: signup } = useAuth();
  const router = useRouter();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("validation.required")).max(80),
        email: z.string().email(t("validation.email")),
        password: z.string().min(8, t("validation.min8")).max(128),
        currency: z.string().regex(/^[A-Z]{3}$/),
        timezone: z.string().min(1, t("validation.required")),
      }),
    [t],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", email: "", password: "", currency: "MXN",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await signup({ ...v, locale });
      router.replace("/dashboard");
    } catch (e) {
      if (e instanceof ApiError && e.code === "email_taken") form.setError("email", { type: "server", message: t("auth.emailTaken") });
      else applyApiError(e, form.setError, (m) => toast.error(m));
    }
  });

  const field = (name: "name" | "email" | "password", label: string, type = "text", auto?: string) => (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={type} autoComplete={auto} aria-invalid={!!errors[name]} {...form.register(name)} />
      {errors[name] && <p className="text-sm text-destructive">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.registerTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {field("name", t("auth.name"), "text", "name")}
          {field("email", t("auth.email"), "email", "email")}
          {field("password", t("auth.password"), "password", "new-password")}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="currency">{t("auth.currency")}</Label>
              <select id="currency" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm" {...form.register("currency")}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">{t("auth.timezone")}</Label>
              <Input id="timezone" list="tz-list" aria-invalid={!!errors.timezone} {...form.register("timezone")} />
              <datalist id="tz-list">{timezones().map((z) => <option key={z} value={z} />)}</datalist>
              {errors.timezone && <p className="text-sm text-destructive">{errors.timezone.message}</p>}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>{t("auth.register")}</Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")} <Link href="/login" className="text-foreground underline underline-offset-4">{t("auth.login")}</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
