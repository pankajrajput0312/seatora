"use client";

import { useEffect } from "react";

/** Opens the closed <details> around the element the URL's #hash names and moves there (where the browser doesn't itself). */
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const el = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      if (!el) return;
      for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
      el.scrollIntoView({ block: "start" });
      el.focus({ preventScroll: true });
    };
    open();
    addEventListener("hashchange", open);
    return () => removeEventListener("hashchange", open);
  }, []);
  return null;
}
