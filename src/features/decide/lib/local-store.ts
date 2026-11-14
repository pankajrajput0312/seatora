"use client";

import { useCallback, useSyncExternalStore } from "react";

// Tiny localStorage store shared by every component on the page (same key → same value, updates broadcast).
const EVENT = "medpath-local";
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
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
  localStorage.setItem(key, JSON.stringify(value));
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
