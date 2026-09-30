"use client";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useMediaQuery } from "@/lib/use-media-query";

/** Dialog on desktop, draggable bottom sheet (Vaul) on mobile; sized to its content (max 96dvh) with a scrolling body. Without a visible `description` a screen-reader-only hint is announced. */
export function ResponsiveDialog({ open, onOpenChange, title, description, children, onOpenAutoFocus }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode;
  /** Pass-through to the content: call `preventDefault()` and focus something else to steer initial focus. */
  onOpenAutoFocus?: (e: Event) => void;
}) {
  const t = useTranslations("common");
  const desktop = useMediaQuery("(min-width: 768px)");
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" closeLabel={t("close")} onOpenAutoFocus={onOpenAutoFocus}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : "sr-only"}>{description ?? t("dialogHint")}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-card px-4" onOpenAutoFocus={onOpenAutoFocus}>
        <DrawerHeader className="px-0">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className={description ? undefined : "sr-only"}>{description ?? t("dialogHint")}</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
