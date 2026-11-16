"use client";

import { useEffect, useRef } from "react";

/** After "Show more", focus the first new row or card, whichever is visible at this width. */
export function FocusItem({ n }: { n: number | null }) {
  useEffect(() => {
    if (!n) return;
    const el = [...document.querySelectorAll<HTMLElement>(`[data-item="${n}"]`)].find((e) => e.offsetParent !== null);
    el?.focus();
  }, [n]);
  return null;
}

/** Moves focus to #id when `value` changes after the first render (e.g. a new page of results); focus scrolls it into view. */
export function FocusOnChange({ id, value }: { id: string; value: string | number }) {
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    document.getElementById(id)?.focus();
  }, [id, value]);
  return null;
}

/** In a sideways-scrolling row (SubTabs), brings its current item (aria-current) into view, centred, on mount. */
export function ScrollToCurrent() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const row = ref.current?.parentElement;
    const cur = row?.querySelector<HTMLElement>("[aria-current]");
    if (!row || !cur) return;
    row.scrollLeft += cur.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - cur.offsetWidth) / 2;
  }, []);
  return <span ref={ref} hidden />;
}
