"use client";
import * as React from "react";
import type { ReactNode } from "react";

// `ViewTransition` ships in the React canary that Next's App Router bundles, not in the stable React that
// vitest and jsdom load, so resolve it at runtime and fall back to a plain fragment (navigation just swaps).
type VTProps = { name?: string; share?: string; enter?: string; exit?: string; default?: string; children?: ReactNode };
const ViewTransition = (React as { ViewTransition?: React.ComponentType<VTProps> }).ViewTransition;

/** Route boundary: the outgoing page fades out and the incoming one rises in (classes in globals.css). Named children still morph. */
export function PageTransition({ children }: { children: ReactNode }) {
  return ViewTransition ? <ViewTransition enter="vt-rise-in" exit="vt-fade-out" default="none">{children}</ViewTransition> : <>{children}</>;
}

/** A shared element: the same `name` on two routes morphs between them. `default="none"` keeps it still on unrelated transitions. */
export function SharedElement({ name, children }: { name: string; children: ReactNode }) {
  return ViewTransition ? <ViewTransition name={name} share="vt-morph" default="none">{children}</ViewTransition> : <>{children}</>;
}
