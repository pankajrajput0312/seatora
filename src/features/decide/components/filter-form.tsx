"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { ChevronDown, Info, ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { InfoTip } from "./info-tip";

/**
 * The GET filter form (FilterBar, Options, Seats): Apply loads the page with the fields as its params. A plain form, a
 * full load. ponytail: next/form's client navigation never commits as of e387871 (no same-route client navigation does);
 * back to next/form once that is fixed.
 */
export function FilterForm(props: ComponentProps<"form"> & { action: string }) {
  return <form method="get" {...props} onSubmit={(e) => e.currentTarget.querySelector<HTMLDialogElement>("dialog[open]")?.close()} />;
}

/** The search box of a toolbar (`children`: its label and input) with its submit, a magnifier inside the box's end. */
export function ToolbarSearch({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("toolbar-search relative min-w-0 flex-1 md:max-w-md", className)}>
      {children}
      <button type="submit" aria-label="Search" className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground">
        <Search className="size-5" aria-hidden />
      </button>
    </div>
  );
}

/** The result count at the toolbar's end on phones (md up the results line says it): the number, its noun under it. */
export function ToolbarCount({ total, noun }: { total: number; noun: string }) {
  return (
    <p className="ml-auto shrink-0 self-center text-right leading-tight md:hidden">
      <span className="numeric block text-sm font-semibold">{formatRank(total)}</span>
      <span className="block text-xs text-muted-foreground">{noun}</span>
    </p>
  );
}

/**
 * The filters behind a "Filters" button (its badge: `count`, the filters applied), so a list page shows only its search
 * box, this button and the active-filter chips. A modal <dialog>: a bottom sheet on phones (drag its handle down, ×,
 * Escape or a tap outside closes it), a side sheet from md up; focus stays inside while open and goes back to the button
 * after. The fields scroll between the title and a pinned footer: Reset (`clear`, this page without its filters) and
 * "Show N results" (`total`, the count now applied; "Show results" once she changes a field). Render inside a FilterForm;
 * the fields are FilterSections and Fields (one row each).
 */
export function FiltersPanel({ count, clear, total, children }: { count: number; clear?: string; total?: number; children: React.ReactNode }) {
  const id = `filters${useId().replace(/[^\w-]/g, "")}`;
  const sheet = useRef<HTMLDialogElement>(null);
  const [changed, setChanged] = useState(false);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const close = () => sheet.current?.close();
  const move = (dy: number) => sheet.current?.style.setProperty("translate", dy ? `0 ${dy}px` : "");
  // The app's top bar height, where the toolbar pins on phones (globals.css --app-top).
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".astryx-app-shell-header");
    if (!bar) return;
    const set = () => document.documentElement.style.setProperty("--app-top", `${bar.offsetHeight}px`);
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        // Opens before hydration too where the browser has invoker commands; with JS, this click.
        {...({ commandfor: id, command: "show-modal" } as object)}
        onClick={(e) => {
          e.preventDefault();
          if (!sheet.current?.open) sheet.current?.showModal();
        }}
        className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-secondary px-3 text-sm font-medium hover:bg-raised md:px-4"
      >
        <ListFilter className="size-4" aria-hidden />
        Filters
        {count > 0 && (
          <span className="numeric inline-flex min-w-5 items-center justify-center rounded-full bg-sky px-1.5 text-xs font-semibold text-background">
            {count}<span className="sr-only"> applied</span>
          </span>
        )}
      </button>
      <dialog
        ref={sheet}
        id={id}
        data-filters
        aria-label="Filters"
        {...({ closedby: "any" } as object)}
        onClick={(e) => e.target === e.currentTarget && close()}
        // Tab past the last control comes back to the first (and Shift+Tab the other way): focus never leaves the sheet.
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const all = [...e.currentTarget.querySelectorAll<HTMLElement>("a[href], button, input, select, summary, [tabindex='0']")].filter((el) => el.checkVisibility() && !(el as HTMLButtonElement).disabled && el.tabIndex >= 0);
          const [first, last] = [all[0], all.at(-1)];
          if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
            e.preventDefault();
            (e.shiftKey ? last : first)?.focus();
          }
        }}
        onChange={(e) => (e.target as Partial<HTMLInputElement>).type !== "search" && setChanged(true)}
        onClose={() => move(0)}
        className="filter-sheet fixed m-0 flex max-h-none max-w-none flex-col border-0 border-border bg-card p-0 text-foreground shadow-overlay outline-none backdrop:bg-foreground/45 not-open:hidden max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:h-[calc(100dvh-0.75rem)] max-md:w-full max-md:rounded-t-2xl max-md:border-t md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-[28rem] md:rounded-l-2xl md:border-l"
      >
        {/* The handle and title: drag down (phones) to close. */}
        <div
          className="touch-none border-b border-border md:touch-auto"
          onPointerDown={(e) => {
            if (!matchMedia("(width < 48rem)").matches || (e.target as HTMLElement).closest("button")) return;
            drag.current = { y: e.clientY, dy: 0 };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            drag.current.dy = Math.max(0, e.clientY - drag.current.y);
            move(drag.current.dy);
          }}
          onPointerUp={() => {
            const dy = drag.current?.dy ?? 0;
            drag.current = null;
            if (dy > 80) close();
            else move(0);
          }}
          onPointerCancel={() => {
            drag.current = null;
            move(0);
          }}
        >
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border md:hidden" />
          <div className="flex items-center justify-between py-1 pr-2 pl-4">
            <h2 className="text-base font-semibold">Filters</h2>
            <Button type="button" variant="ghost" size="icon" aria-label="Close filters" onClick={close}><X className="size-5" aria-hidden /></Button>
          </div>
        </div>
        <div data-sheet-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        <div className="flex items-center gap-3 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {clear ? (
            <Button asChild variant="secondary"><Link href={clear} scroll={false} onClick={close}>Reset</Link></Button>
          ) : (
            <Button type="reset" variant="secondary" onClick={() => setChanged(false)}>Reset</Button>
          )}
          <Button type="submit" className="flex-1">{total != null && !changed ? `Show ${formatRank(total)} ${total === 1 ? "result" : "results"}` : "Show results"}</Button>
        </div>
      </dialog>
    </>
  );
}

/**
 * Brings `el` into view inside the Filters sheet's scrolling body, a third of the way down (`nearest`: only if it is not
 * all in view, then its top at the top), never scrolling the page behind it (scrollIntoView would: the sheet is fixed).
 */
export function revealInSheet(el: HTMLElement, nearest = false) {
  const box = el.closest<HTMLElement>("[data-sheet-body]");
  if (!box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (nearest && r.top >= b.top && r.bottom <= b.bottom) return;
  box.scrollTop += r.top - b.top - (nearest ? 0 : box.clientHeight / 3);
}

/** What a section's fields are set to, from the fields themselves: ticked boxes, chosen options, typed numbers. */
function summarize(el: HTMLElement, none: string) {
  const parts: string[] = [];
  let ticks = 0;
  for (const f of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input:not([type=hidden], [type=search]), select")) {
    if (f instanceof HTMLSelectElement) {
      if (f.value) parts.push(f.selectedOptions[0]?.text ?? f.value);
    } else if (f.type === "checkbox" || f.type === "radio") {
      if (f.checked) {
        ticks++;
        parts.push(f.closest("label")?.textContent?.trim() || f.value);
      }
    } else if (f.value.trim()) parts.push(f.value.trim());
  }
  return !parts.length ? none : parts.length === 1 ? parts[0] : `${parts.length} ${ticks === parts.length ? "selected" : "set"}`;
}

/**
 * One section of the Filters sheet: a row with its `title` and what it is set to (`none` when nothing is; read from its
 * fields, live), that opens the fields under it. One open at a time (a native accordion). `info`: the longer words,
 * behind an (i) beside the summary (phrasing content). `summary`: the server's words for it before the page's script runs.
 */
export function FilterSection({ title, none = "All", info, summary, children }: { title: string; none?: string; info?: React.ReactNode; summary?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDetailsElement>(null);
  const [now, setNow] = useState(summary ?? null);
  const read = () => box.current && setNow(summarize(box.current, none));
  useEffect(() => {
    read();
  }, [none]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative border-b border-border">
      <details
        ref={box}
        name="filter-section"
        className="group/sec"
        onChange={read}
        onInput={read}
        onToggle={(e) => e.currentTarget.open && revealInSheet(e.currentTarget, true)}
      >
        {/* Fixed sizes (not the phone's compact spacing): a 48px row, and the (i) sits in the gap kept before the chevron. */}
        <summary className="flex min-h-[3rem] cursor-pointer list-none items-center gap-[0.75rem] py-2 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 text-sm font-semibold">{title}</span>
          <span className={cn("ml-auto min-w-0 truncate text-right text-sm", now && now !== none ? "font-semibold text-sky" : "text-muted-foreground")}>{now ?? none}</span>
          {!!info && <span aria-hidden className="w-[1.25rem] shrink-0" />}
          <ChevronDown className="size-[1.25rem] shrink-0 text-muted-foreground transition-transform group-open/sec:rotate-180" aria-hidden />
        </summary>
        <div className="grid gap-1 pb-3">{children}</div>
      </details>
      {/* Beside the summary, outside the <summary> (no button inside a button). */}
      {info && <InfoTip label={title} className="absolute top-[0.875rem] right-[2rem]">{info}</InfoTip>}
    </div>
  );
}

/**
 * Phones: the lines above the results (the count, colour key, history and source notes) fold behind one "About this
 * data" row, so the first result is in the first screen; md up they show as they are. `children` stays in the page
 * (its sources are cited) and opens under the row.
 */
export function AboutData({ children, className }: { children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn("min-w-0 max-md:contents", className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground md:hidden">
        <Info className="size-4" aria-hidden />About<span className="max-[25rem]:sr-only"> this data</span><ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div id={id} className={cn("min-w-0 max-md:order-last max-md:basis-full", !open && "max-md:hidden")}>{children}</div>
    </div>
  );
}
