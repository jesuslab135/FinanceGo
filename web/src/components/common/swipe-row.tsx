"use client";
import { animate, m, useMotionValue, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { spring } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media-query";
import type { RowAction } from "./row-menu";

const ACTION_W = 72;
const PRIMARY_THRESHOLD = 96;

/** Touch-only swipe: left reveals actions, right runs `primary`. The same actions must also be in a RowMenu. */
export function SwipeRow({ children, actions, primary }: { children: ReactNode; actions: RowAction[]; primary?: { label: string; onRun: () => void } }) {
  const coarse = useMediaQuery("(pointer: coarse)");
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  if (!coarse) return <>{children}</>;
  const snap = (to: number) => animate(x, to, reduce ? { duration: 0 } : spring);
  const width = actions.length * ACTION_W;
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 flex" aria-hidden>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={-1}
            onClick={() => { snap(0); a.onSelect(); }}
            className={`flex w-[72px] flex-col items-center justify-center gap-1 text-xs font-medium text-white ${a.destructive ? "bg-critical" : "bg-foreground/70"}`}
          >
            <a.icon className="size-5" /> {a.label}
          </button>
        ))}
      </div>
      {primary && (
        <div className="absolute inset-y-0 left-0 flex w-40 items-center bg-accent-teal px-4 text-sm font-semibold text-white" aria-hidden>
          {primary.label}
        </div>
      )}
      <m.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -width, right: primary ? 140 : 0 }}
        dragElastic={0.08}
        style={{ x, touchAction: "pan-y" }}
        onDragEnd={(_, info) => {
          if (primary && info.offset.x > PRIMARY_THRESHOLD) {
            if ("vibrate" in navigator) navigator.vibrate?.(10);
            primary.onRun();
            snap(0);
            return;
          }
          snap(info.offset.x < -ACTION_W / 2 ? -width : 0);
        }}
        className="relative"
      >
        {children}
      </m.div>
    </div>
  );
}
