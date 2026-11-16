"use client";

import { useCallback, useEffect, useMemo } from "react";
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

/**
 * useChoices, with the first list, still under its default name ("Round 2 · 2026"), renamed for the choice filling she
 * fills next (`nextRound`, MCC's schedule: "Round 3 · 2026"). A list she named or duplicated keeps its own name, and no
 * two lists end up with one. Choices and Home both read it, so the list never has two names.
 */
export function useChoicesFor(nextRound: string | null | undefined) {
  const [state, setState, hydrated] = useChoices();
  const first = defaultChoices.lists[0];
  const rename = !!nextRound && nextRound !== first.name && !state.lists.some((l) => l.name === nextRound) && state.lists.some((l) => l.id === first.id && l.name === first.name);
  useEffect(() => {
    if (hydrated && rename) setState((s) => ({ ...s, lists: s.lists.map((l) => (l.id === first.id && l.name === first.name ? { ...l, name: nextRound! } : l)) }));
  }, [hydrated, rename, nextRound, first, setState]);
  return [state, setState, hydrated] as const;
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
