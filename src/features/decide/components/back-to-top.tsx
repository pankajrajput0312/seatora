"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Phones, a long list: after two screens down, a small "Top" button above the bottom bar, bottom right. It scrolls to
 * the top (at once under reduced motion) and puts focus on the page's heading. Not on paper, not with Filters open.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 2 * window.innerHeight);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      data-back-to-top
      onClick={() => {
        window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        document.getElementById("main-h1")?.focus({ preventScroll: true });
      }}
      className="fixed right-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-30 inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-card px-3.5 text-sm font-semibold shadow-overlay md:hidden print:hidden"
    >
      <ArrowUp className="size-4" strokeWidth={2} aria-hidden />
      Top<span className="sr-only">: back to the top of the page</span>
    </button>
  );
}
