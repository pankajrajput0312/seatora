"use client";

import { useCallback, useSyncExternalStore } from "react";

// Tiny localStorage store shared by every component on the page (same key → same value, updates broadcast).
// Values are untrusted: callers validate them with Zod (useChoices, useCompare, the shell's profile).
const EVENT = "medpath-local";
const cache = new Map<string, { raw: string | null; value: unknown }>();

/** localStorage can throw (Safari with storage blocked, quota): treat that as "nothing saved". */
function getRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The stored value now, outside React (the exam switcher reads the next exam's profile with it). */
export const readLocal = <T,>(key: string, fallback: T) => read(key, fallback);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = getRaw(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  try {
    if (raw) value = JSON.parse(raw) as T;
  } catch {}
  cache.set(key, { raw, value });
  return value;
}

export function writeLocal<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return; // not saved; the page keeps working for this visit
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

export function useLocal<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void, boolean] {
  const subscribe = useCallback((cb: () => void) => {
    const on = () => cb();
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  const value = useSyncExternalStore(subscribe, () => read(key, fallback), () => fallback);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const set = useCallback((v: T | ((prev: T) => T)) => writeLocal(key, typeof v === "function" ? (v as (p: T) => T)(read(key, fallback)) : v), [key, fallback]);
  return [value, set, hydrated];
}
