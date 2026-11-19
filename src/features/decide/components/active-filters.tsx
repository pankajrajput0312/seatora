"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSearchParams } from "next/navigation";
import { clears, revealInSheet } from "./filter-form";

/** The chip she removed (its place), until the page without it renders: then focus goes to its neighbour. */
let removed: number | null = null;
/** The last removal, for its Undo across the page load (sessionStorage: a full load or a client navigation alike). */
const UNDO = "decide:removed-filter";

/** Opens the page's Filters sheet at the field named `param` (its section opened), else focuses that field on the page (the search box). */
function edit(param: string) {
  const sheet = document.querySelector<HTMLDialogElement>("dialog[data-filters]");
  const inSheet = sheet?.querySelector<HTMLElement>(`[name="${param}"]:not([type=hidden])`);
  const field = inSheet ?? document.querySelector<HTMLElement>(`form [name="${param}"]:not([type=hidden])`);
  if (inSheet && sheet && !sheet.open) sheet.showModal();
  const section = field?.closest("details");
  if (section) section.open = true;
  if (field && inSheet) revealInSheet(field);
  field?.focus({ preventScroll: !!inSheet });
  if (!field) sheet?.showModal();
}

type Chip = { label: string; href: string; param?: string };

/** A folded group's noun ("50 courses"), by the field its chips share. */
const nouns: Record<string, string> = { course: "courses", c: "courses", sp: "courses", deg: "degrees", degree: "degrees", st: "states", state: "states", quota: "quotas", lquota: "quotas", aq: "quotas", ctype: "college types", scat: "seat categories", acat: "seat categories", round: "rounds", year: "years" };

/**
 * More than `max` chips of one field (`param`, also its address key) fold into one, in the first one's place: "50
 * courses", its words opening that field in the Filters sheet, its × this page without any of them (a chip's own
 * href with that key dropped).
 */
export function foldChips(items: Chip[], max = 6): Chip[] {
  const n = (param?: string) => (param ? items.filter((i) => i.param === param).length : 0);
  return items.flatMap((i, at) => {
    if (n(i.param) <= max) return [i];
    if (items.findIndex((x) => x.param === i.param) !== at) return [];
    const [path, qs = ""] = i.href.split("?");
    const p = new URLSearchParams(qs);
    p.delete(i.param!);
    const q = p.toString();
    return [{ label: `${n(i.param)} ${nouns[i.param!] ?? "filters"}`, param: i.param, href: q ? `${path}?${q}` : path }];
  });
}

/**
 * The filters a page applies, as chips under its toolbar (one row that scrolls sideways on phones), one per value
 * ("Karnataka", "Deemed"), more than six of one field as one ("50 courses", foldChips). The chip's words open that
 * filter in the Filters sheet (`param`: its field's name); its × removes it in one click (`href` = this page without
 * it), and a "Removed Karnataka · Undo" note follows. "Clear all" (`clear`) when there are two or more and it changes
 * the page (not only her profile's defaults, as "Your courses (7)", are set). Nothing when
 * none is set. After a removal focus moves to the chip now in its place (else the one before it), never to <body>; with
 * none left, to the results heading (else the h1).
 */
export function ActiveFilters({ items: all, clear }: { items: Chip[]; clear: string }) {
  const items = foldChips(all);
  const params = useSearchParams();
  const box = useRef<HTMLDivElement>(null);
  const [undo, setUndo] = useState<{ label: string; back: string } | null>(null);
  const sig = items.map((i) => i.label).join("\n");
  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem(UNDO) ?? "null") as { label: string; back: string } | null;
      sessionStorage.removeItem(UNDO);
      if (u?.back && u.back !== location.href) setUndo(u);
    } catch {
      // storage blocked: no Undo
    }
    if (removed == null) return;
    const at = removed;
    removed = null;
    const links = [...(box.current?.querySelectorAll<HTMLElement>("a") ?? [])];
    // (On phones the results line may be folded under "About this data": the next one in view.)
    const to = links[Math.min(at, links.length - 1)] ?? ["results", "options-count", "main-h1"].map((id) => document.getElementById(id)).find((e) => e?.hasAttribute("tabindex") && e.checkVisibility());
    to?.focus();
  }, [sig]);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);
  const remember = (label: string, n: number) => {
    removed = n;
    try {
      sessionStorage.setItem(UNDO, JSON.stringify({ label, back: location.href }));
    } catch {
      // storage blocked: no Undo
    }
  };
  return (
    <>
      <div ref={box} role="group" aria-label="Active filters" className={cn("chip-row flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", !items.length && "hidden")}>
        {items.length > 0 && <span className="text-muted-foreground max-md:sr-only">Filtered by</span>}
        {items.map((i, n) => (
          <span key={`${i.label}|${i.href}`} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card max-md:min-h-[2rem]">
            {i.param ? (
              <button type="button" onClick={() => edit(i.param!)} aria-label={`Change filter: ${i.label}`} className="inline-flex min-h-[inherit] items-center rounded-l-full pr-1 pl-3 hover:text-sky">{i.label}</button>
            ) : (
              <span className="pr-1 pl-3">{i.label}</span>
            )}
            <Link href={i.href} scroll={false} onClick={() => remember(i.label, n)} aria-label={`Remove filter: ${i.label}`} className="hit inline-flex min-h-[inherit] items-center rounded-r-full pr-2.5 pl-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" aria-hidden />
            </Link>
          </span>
        ))}
        {items.length > 1 && clears(clear, params) && <Link href={clear} scroll={false} onClick={() => remember("all filters", 0)} className="inline-flex min-h-11 items-center px-1 text-sky underline hover:text-foreground max-md:min-h-[2rem]">Clear all</Link>}
      </div>
      {undo && (
        <p role="status" className="fixed inset-x-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-lg bg-foreground px-4 py-1 text-sm text-background shadow-overlay md:bottom-6">
          <span className="min-w-0 truncate">Removed {undo.label}</span>
          <a href={undo.back} className="inline-flex min-h-11 shrink-0 items-center font-semibold underline">Undo</a>
        </p>
      )}
    </>
  );
}
