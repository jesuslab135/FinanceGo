"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-provider";
import { applyApiError } from "@/lib/forms";

export default function LoginPage() {
  const t = useTranslations();
  const { login, status } = useAuth();
  const router = useRouter();
  const schema = useMemo(
    () => z.object({ email: z.string().email(t("validation.email")), password: z.string().min(1, t("validation.required")) }),
    [t],
  );
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await login(v.email, v.password);
      router.replace("/dashboard");
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_credentials") form.setError("root", { message: t("auth.invalidCredentials") });
      else applyApiError(e, form.setError, (m) => toast.error(m), t);
    }
  });

  return (
    <Card className="gap-6 rounded-[20px] border-0 py-8 shadow-card sm:px-2">
      <CardHeader>
        <CardTitle className="font-display text-2xl font-extrabold tracking-tight">{t("auth.loginTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("auth.loginSubtitle")}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input className="h-11" id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <PasswordInput className="h-11" id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          {errors.root && <p role="alert" className="text-sm text-destructive">{errors.root.message}</p>}
          <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>{t("auth.login")}</Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("auth.noAccount")} <Link href="/register" className="text-foreground underline underline-offset-4">{t("auth.register")}</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
