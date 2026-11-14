"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { profileParamKeys } from "../profile";
import { CHOICES_KEY, compareSchema, COMPARE_KEY, defaultChoices, parseChoices, type ChoicesState } from "./choices";
import { useLocal } from "./local-store";

/** Choice lists from localStorage, Zod-validated (a malformed value falls back instead of crashing). */
export function useChoices(): [ChoicesState, (fn: (s: ChoicesState) => ChoicesState) => void, boolean] {
  const [raw, setRaw, hydrated] = useLocal<unknown>(CHOICES_KEY, defaultChoices);
  const state = useMemo(() => parseChoices(raw), [raw]);
  const update = useCallback((fn: (s: ChoicesState) => ChoicesState) => setRaw((prev: unknown) => fn(parseChoices(prev))), [setRaw]);
  return [state, update, hydrated];
}

/** Compare tray ids, validated and de-duplicated. */
export function useCompare(): [string[], (fn: (ids: string[]) => string[]) => void] {
  const [raw, setRaw] = useLocal<unknown>(COMPARE_KEY, []);
  const ids = useMemo(() => {
    const r = compareSchema.safeParse(raw);
    return r.success ? [...new Set(r.data)] : [];
  }, [raw]);
  const update = useCallback((fn: (ids: string[]) => string[]) => setRaw((prev: unknown) => {
    const r = compareSchema.safeParse(prev);
    return [...new Set(fn(r.success ? r.data : []))];
  }), [setRaw]);
  return [ids, update];
}

/** Adds the current profile params to an in-app href (client side). */
export function useProfileHref() {
  const sp = useSearchParams();
  return (path: string, extra: Record<string, string> = {}, hash = "") => {
    const p = new URLSearchParams();
    for (const k of profileParamKeys) if (sp.get(k)) p.set(k, sp.get(k)!);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const qs = p.toString();
    return `${path}${qs ? `?${qs}` : ""}${hash}`;
  };
}
