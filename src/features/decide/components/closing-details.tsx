"use client";

import type { ComponentProps } from "react";

/**
 * A native <details> overlay that closes on Escape (focus back on its summary), on a click or tap outside it and when
 * focus leaves it (Tab), so it never stays over the content beneath. Give the panel tabIndex={-1} so a click on its text
 * keeps focus inside, and the panel open.
 */
export function ClosingDetails(props: ComponentProps<"details">) {
  return (
    <details
      {...props}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !e.currentTarget.open) return;
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.open = false;
      }}
      onToggle={(e) => {
        // Safari doesn't focus a clicked summary, so blur alone can miss an outside click: listen while open.
        const d = e.currentTarget;
        if (!d.open) return;
        const outside = (ev: PointerEvent) => {
          if (!d.contains(ev.target as Node)) d.open = false;
        };
        document.addEventListener("pointerdown", outside);
        d.addEventListener("toggle", () => document.removeEventListener("pointerdown", outside), { once: true });
      }}
    />
  );
}
