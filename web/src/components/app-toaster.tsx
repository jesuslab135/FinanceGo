"use client";

import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { Toaster, type ToasterProps } from "sonner";
import { useMediaQuery } from "@/lib/use-media-query";

/** Clears the mobile bottom nav (about 56px plus the FAB's rise) and the home-indicator inset. */
export const MOBILE_TOAST_OFFSET = "calc(80px + env(safe-area-inset-bottom))";

/** Spec §4.12: bottom-center on phones (thumb reach for "Deshacer"), top-right on desktop. */
export function toastPlacement(desktop: boolean): Pick<ToasterProps, "position" | "offset" | "mobileOffset"> {
  return desktop
    ? { position: "top-right" }
    : { position: "bottom-center", offset: { bottom: MOBILE_TOAST_OFFSET }, mobileOffset: { bottom: MOBILE_TOAST_OFFSET } };
}

// Brand styling through sonner's own CSS variables, so it follows the light/dark tokens.
const BRAND_STYLE = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "16px",
} as CSSProperties;

export function AppToaster() {
  const { theme } = useTheme();
  const desktop = useMediaQuery("(min-width: 768px)");
  return (
    <Toaster
      {...toastPlacement(desktop)}
      theme={(theme as "light" | "dark" | "system" | undefined) ?? "system"}
      style={BRAND_STYLE}
      toastOptions={{
        className: "font-sans shadow-card",
        actionButtonStyle: { background: "var(--primary)", color: "var(--primary-foreground)", borderRadius: "9999px" },
        classNames: { error: "[&_[data-icon]]:text-destructive", success: "[&_[data-icon]]:text-accent-teal" },
      }}
    />
  );
}
