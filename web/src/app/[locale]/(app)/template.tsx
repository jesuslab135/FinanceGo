"use client";
import type { ReactNode } from "react";
import { PageTransition } from "@/components/motion/page-transition";

// Unlike the layout, a template remounts on every navigation, so the boundary's enter/exit fire for each route change.
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
