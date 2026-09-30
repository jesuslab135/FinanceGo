"use client";
import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { readJSON, userKey, writeJSON } from "./storage";

export type Recents = { categories: number[]; cardByCategory: Record<string, number | null>; lastCard: number | null };
export const emptyRecents: Recents = { categories: [], cardByCategory: {}, lastCard: null };

export function recordUse(r: Recents, categoryId: number, cardId: number | null): Recents {
  return {
    categories: [categoryId, ...r.categories.filter((id) => id !== categoryId)].slice(0, 12),
    cardByCategory: { ...r.cardByCategory, [categoryId]: cardId },
    lastCard: cardId,
  };
}

export function defaultCard(r: Recents, categoryId: number): number | null {
  return categoryId in r.cardByCategory ? r.cardByCategory[categoryId] : r.lastCard;
}

export function orderCategories<T extends { id: number }>(cats: T[], recent: number[], top = 6): T[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const head = recent.map((id) => byId.get(id)).filter((c): c is T => !!c).slice(0, top);
  const headIds = new Set(head.map((c) => c.id));
  return [...head, ...cats.filter((c) => !headIds.has(c.id))];
}

export function useRecents(): [Recents, (categoryId: number, cardId: number | null) => void] {
  const { user } = useAuth();
  const key = user ? userKey(user.id, "recents") : null;
  const [state, setState] = useState<Recents>(() => (key ? readJSON(key, emptyRecents) : emptyRecents));
  const record = useCallback((categoryId: number, cardId: number | null) => {
    setState((r) => {
      const next = recordUse(r, categoryId, cardId);
      if (key) writeJSON(key, next);
      return next;
    });
  }, [key]);
  return [state, record];
}
