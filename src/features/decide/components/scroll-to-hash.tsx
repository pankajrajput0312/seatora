"use client";

import { useEffect } from "react";

/**
 * Brings the address's #id into view once the streamed page is in: a link like "Full schedule" (#round-R2) arrives while
 * the loading screen shows, before its target exists, so the browser's own jump lands at the top (the finished Round 1).
 * The target's scroll-mt keeps it clear of the sticky top bar.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    // Instant: the page's smooth scrolling would add its glide to the browser's own jump (it overshot by a screen).
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);
  return null;
}
