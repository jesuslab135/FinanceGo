"use client";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease, stagger as s } from "@/lib/motion";

export function FadeInList({ children, className, as = "ul" }: { children: ReactNode; className?: string; as?: "ul" | "div" }) {
  const reduce = useReducedMotion();
  const Tag = as === "ul" ? m.ul : m.div;
  return (
    <Tag className={className} initial={reduce ? false : "hidden"} animate="show" variants={{ show: { transition: { staggerChildren: reduce ? 0 : s.chips } } }}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </Tag>
  );
}

/** Every FadeInItem needs a stable `key` from its parent map. Instant under reduced motion. */
export function FadeInItem({ children, className, as = "li", layout = true }: { children: ReactNode; className?: string; as?: "li" | "div"; layout?: boolean }) {
  const reduce = useReducedMotion();
  const Tag = as === "li" ? m.li : m.div;
  const d = reduce ? 0 : duration.small;
  return (
    <Tag
      layout={reduce ? false : layout}
      className={className}
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      exit={{ opacity: 0, height: 0, transition: { duration: d, ease: ease.exit } }}
      transition={{ duration: d, ease: ease.enter }}
    >
      {children}
    </Tag>
  );
}
