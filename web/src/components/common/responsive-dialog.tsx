"use client";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useMediaQuery } from "@/lib/use-media-query";

/** Dialog on desktop, draggable bottom sheet (Vaul) on mobile; `size="full"` skips the 55% snap for tall forms. Without a visible `description` a screen-reader-only hint is announced. */
export function ResponsiveDialog({ open, onOpenChange, title, description, size = "auto", children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; size?: "auto" | "full"; children: ReactNode;
}) {
  const t = useTranslations("common");
  const desktop = useMediaQuery("(min-width: 768px)");
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" closeLabel={t("close")}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : "sr-only"}>{description ?? t("dialogHint")}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  const content = (
    <DrawerContent className="max-h-[96dvh] rounded-t-[20px] bg-card px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <DrawerHeader className="px-0 text-left">
        <DrawerTitle className="font-display text-lg">{title}</DrawerTitle>
        <DrawerDescription className={description ? undefined : "sr-only"}>{description ?? t("dialogHint")}</DrawerDescription>
      </DrawerHeader>
      <div className="overflow-y-auto">{children}</div>
    </DrawerContent>
  );
  return size === "auto" ? (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={[0.55, 1]} fadeFromIndex={0}>{content}</Drawer>
  ) : (
    <Drawer open={open} onOpenChange={onOpenChange}>{content}</Drawer>
  );
}
