"use client";
import { AnimatePresence, m } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease, stagger as s } from "@/lib/motion";

export function FadeInList({ children, className, as = "ul" }: { children: ReactNode; className?: string; as?: "ul" | "div" }) {
  const Tag = as === "ul" ? m.ul : m.div;
  return (
    <Tag className={className} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: s.chips } } }}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </Tag>
  );
}

/** Every FadeInItem needs a stable `key` from its parent map. */
export function FadeInItem({ children, className, as = "li", layout = true }: { children: ReactNode; className?: string; as?: "li" | "div"; layout?: boolean }) {
  const Tag = as === "li" ? m.li : m.div;
  return (
    <Tag
      layout={layout}
      className={className}
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      exit={{ opacity: 0, height: 0, transition: { duration: duration.small, ease: ease.exit } }}
      transition={{ duration: duration.small, ease: ease.enter }}
    >
      {children}
    </Tag>
  );
}
