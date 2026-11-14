"use client";

import { useEffect } from "react";

/** After "Show more", focus the first new row or card, whichever is visible at this width. */
export function FocusItem({ n }: { n: number | null }) {
  useEffect(() => {
    if (!n) return;
    const el = [...document.querySelectorAll<HTMLElement>(`[data-item="${n}"]`)].find((e) => e.offsetParent !== null);
    el?.focus();
  }, [n]);
  return null;
}
