"use client";

import { useEffect } from "react";

/**
 * Brings the address's #id into view once the streamed page is in: a link like "Full schedule" (#round-R2) arrives while
 * the loading screen shows, before its target exists, so the browser's own jump lands at the top (the finished Round 1).
 * The target's scroll-mt keeps it clear of the sticky top bar.
 */
export function ScrollToHash() {
  useEffect(() => {
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (!el) return;
    // Instant, now and once the browser's own (smooth) jump has run: two glides at once overshot by a screen.
    const go = () => el.scrollIntoView({ block: "start", behavior: "instant" });
    go();
    const t = setTimeout(() => {
      const top = el.getBoundingClientRect().top;
      if (top < 48 || top > window.innerHeight / 2) go();
    }, 800);
    return () => clearTimeout(t);
  }, []);
  return null;
}
