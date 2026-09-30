"use client";
import * as React from "react";
import type { ReactNode } from "react";

// `ViewTransition` ships in the React canary that Next's App Router bundles, not in the stable React that
// vitest and jsdom load, so resolve it at runtime and fall back to a plain fragment (navigation just swaps).
// `default="none"`: the page-level cross-fade is the ::view-transition(root) CSS in globals.css; this boundary
// only lets named children (the hero amount) morph.
const ViewTransition = (React as { ViewTransition?: React.ComponentType<{ default?: string; children?: ReactNode }> }).ViewTransition;

export function PageTransition({ children }: { children: ReactNode }) {
  return ViewTransition ? <ViewTransition default="none">{children}</ViewTransition> : <>{children}</>;
}
