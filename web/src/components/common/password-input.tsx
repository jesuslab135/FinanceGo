"use client";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A password field with a button to show what is being typed. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const t = useTranslations("auth");
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-11", className)} />
      <button
        type="button"
        aria-label={t(shown ? "hidePassword" : "showPassword")}
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-(--focus)"
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
