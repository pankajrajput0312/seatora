"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PROFILE_KEY, profileSchema, type Profile } from "../profile";
import { CHOICES_KEY, compareSchema, COMPARE_KEY, defaultChoices, parseChoices, type ChoicesState } from "./choices";
import { decideLinks } from "./links";
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

/** decideLinks for client components, from the current URL (keeps every repeated profile value). */
export function useDecideLinks() {
  const sp = useSearchParams();
  return useMemo(() => decideLinks(sp.toString()), [sp]);
}

/** The saved profile, Zod-validated (null when missing or malformed). */
export function useSavedProfile(): [Profile | null, (p: Profile) => void, boolean] {
  const [raw, setRaw, hydrated] = useLocal<unknown>(PROFILE_KEY, null);
  const profile = useMemo(() => {
    const r = profileSchema.safeParse(raw);
    return r.success ? r.data : null;
  }, [raw]);
  return [profile, setRaw, hydrated];
}
