"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** The chip she removed (its place), until the page without it renders: then focus goes to its neighbour. */
let removed: number | null = null;

/**
 * The filters a page applies, as chips: each removes its filter in one click (`href` = this page without it), and
 * "Clear all" (`clear`) when there are two or more. Nothing when none is set. After a removal focus moves to the chip
 * now in its place (else the one before it), never to <body>; with none left, to the results heading (else the h1).
 */
export function ActiveFilters({ items, clear }: { items: { label: string; href: string }[]; clear: string }) {
  const box = useRef<HTMLDivElement>(null);
  const sig = items.map((i) => i.label).join("\n");
  useEffect(() => {
    if (removed == null) return;
    const at = removed;
    removed = null;
    const links = [...(box.current?.querySelectorAll<HTMLElement>("a") ?? [])];
    const to = links[Math.min(at, links.length - 1)] ?? ["results", "options-count", "main-h1"].map((id) => document.getElementById(id)).find((e) => e?.hasAttribute("tabindex"));
    to?.focus();
  }, [sig]);
  return (
    <div ref={box} role="group" aria-label="Active filters" className={cn("chip-row flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", !items.length && "hidden")}>
      {items.length > 0 && <span className="text-muted-foreground">Filtered by</span>}
      {items.map((i, n) => (
        <Link key={i.label} href={i.href} scroll={false} onClick={() => (removed = n)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-card px-3 hover:border-foreground/70">
          <span className="sr-only">Remove filter: </span>{i.label}<X className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      ))}
      {items.length > 1 && <Link href={clear} scroll={false} onClick={() => (removed = 0)} className="inline-flex min-h-11 items-center px-1 text-sky underline hover:text-foreground">Clear all</Link>}
    </div>
  );
}
