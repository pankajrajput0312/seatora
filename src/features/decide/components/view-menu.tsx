"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The toolbar's "View" disclosure: a page's view, round and list pickers (links) in a panel under one button, so the
 * results come first. A native <details> (its summary is announced as expanded or collapsed); Escape, a click outside or
 * following one of its links closes it, focus back on the button after Escape. `current`: what is picked, beside "View"
 * (md up; phones: in the button's name only).
 */
export function ViewMenu({ current, children, className }: { current?: string; children: React.ReactNode; className?: string }) {
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => {
      const d = box.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("pointerdown", out);
    return () => document.removeEventListener("pointerdown", out);
  }, []);
  return (
    <details
      ref={box}
      data-view-menu
      className={cn("view-menu group/vm relative shrink-0 max-md:static", className)}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !e.currentTarget.open) return;
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }}
      onClick={(e) => (e.target as Element).closest("a[href]") && (e.currentTarget.open = false)}
    >
      {/* Phones: the icon alone (the toolbar's row is the search box's); its name stays "View". */}
      <summary className="inline-flex h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-input bg-secondary text-sm font-medium whitespace-nowrap hover:bg-raised md:px-4 [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="size-4" aria-hidden />
        <span className="max-md:sr-only">View</span>
        {current && <span className="max-w-56 truncate font-normal text-muted-foreground max-md:sr-only">{current}</span>}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open/vm:rotate-180 max-md:hidden" aria-hidden />
      </summary>
      {/* Phones: across the pinned toolbar (its box is the panel's), under it. */}
      <div className="absolute right-0 z-30 mt-1 grid max-h-[70dvh] w-[34rem] gap-3 overflow-auto rounded-xl border border-border bg-card p-3 shadow-overlay max-md:inset-x-4 max-md:top-full max-md:w-auto">
        {children}
      </div>
    </details>
  );
}

/** One labelled group of a ViewMenu's panel. */
export function ViewMenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
