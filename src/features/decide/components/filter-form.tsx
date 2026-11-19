"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { ChevronDown, Info, ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { countFromPage, FILTER_TOTAL, formQuery, tally, type Tally } from "../lib/filter-count";
import { useSavedProfile } from "../lib/use-decide-store";
import { profileFromParams, profileToParams, profileWithFilters } from "../profile";
import { InfoTip } from "./info-tip";
import { navigating } from "./nav-pending";

/**
 * The GET filter form (FilterBar, Options, Seats): Apply loads the page with the fields as its params. A plain form, a
 * full load. ponytail: next/form's client navigation never commits as of e387871 (no same-route client navigation does);
 * back to next/form once that is fixed.
 */
export function FilterForm({ children, ...props }: ComponentProps<"form"> & { action: string }) {
  // Staff on another exam: its ?exam= goes with the fields (a form sends only them).
  const exam = useSearchParams().get("exam");
  return (
    <form method="get" {...props} onSubmit={(e) => e.currentTarget.querySelector<HTMLDialogElement>("dialog[open]")?.close()}>
      {exam && <input type="hidden" name="exam" value={exam} />}
      {children}
    </form>
  );
}

/**
 * The search box of a toolbar (`children`: its label and input) with its submit, a magnifier inside the box's end, and
 * a clear (×) before it while there is text. Focus selects the text, so what she types next replaces it.
 */
export function ToolbarSearch({ children, className }: { children: React.ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [has, setHas] = useState(false);
  const fresh = useRef(false);
  const input = () => box.current?.querySelector<HTMLInputElement>("input[type=search]") ?? null;
  // On each new search box (a navigation remounts it with the applied text).
  useEffect(() => setHas(!!input()?.value), [children]);
  return (
    <div
      ref={box}
      className={cn("toolbar-search relative min-w-0 flex-1 md:max-w-md", className)}
      onInput={(e) => (e.target as HTMLInputElement).type === "search" && setHas(!!(e.target as HTMLInputElement).value)}
      onFocus={(e) => {
        const t = e.target as HTMLInputElement;
        if (t.type !== "search" || !t.value) return;
        t.select();
        fresh.current = true;
      }}
      // The click that focused it keeps the selection (the browser would put the caret there on mouseup).
      onMouseUp={(e) => {
        if (fresh.current) e.preventDefault();
        fresh.current = false;
      }}
    >
      {children}
      {has && (
        <button
          type="button"
          aria-label="Clear the search box"
          data-search-clear
          onClick={() => {
            const i = input();
            if (!i) return;
            // Through the value setter, so a controlled box (Residents) hears it too.
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(i, "");
            i.dispatchEvent(new Event("input", { bubbles: true }));
            i.focus();
          }}
          className="absolute top-0 right-10 inline-flex h-11 w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
      <button type="submit" aria-label="Search" className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground">
        <Search className="size-5" aria-hidden />
      </button>
    </div>
  );
}

/** The result count at the toolbar's end on phones (md up the results line says it): the number, its noun under it. */
export function ToolbarCount({ total, noun }: { total: number; noun: string }) {
  return (
    <p {...{ [FILTER_TOTAL]: total }} className="ml-auto shrink-0 self-center text-right leading-tight md:hidden">
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
 * "Show N results": `total`, the count applied, then after each change the count for the fields as they are now
 * ("Show results" while it loads, half a second after her last change): from `counts` (the rows the page has whole,
 * lib/filter-count.ts tally), else `recount` (a server action given the query string), else this page fetched with
 * those params (its ToolbarCount). `saveDefaults`: a "Save as my defaults" line above the buttons (SaveDefaults). Render
 * inside a FilterForm; the fields are FilterSections and Fields (one row each).
 */
export function FiltersPanel({ count, clear, total, counts, recount, saveDefaults, children }: {
  count: number;
  clear?: string;
  total?: number;
  counts?: Tally;
  recount?: (query: string) => Promise<number | null>;
  saveDefaults?: boolean;
  children: React.ReactNode;
}) {
  const id = `filters${useId().replace(/[^\w-]/g, "")}`;
  const sheet = useRef<HTMLDialogElement>(null);
  // The count shown: `total` until she changes a field, then the new count (undefined while it loads, null: none).
  const [shown, setShown] = useState<number | null | undefined>(total);
  const pending = useRef<{ timer?: ReturnType<typeof setTimeout>; abort?: AbortController; n: number }>({ n: 0 });
  const stop = () => {
    clearTimeout(pending.current.timer);
    pending.current.abort?.abort();
    pending.current.n++;
  };
  useEffect(() => {
    stop();
    setShown(total);
  }, [total]);
  useEffect(() => stop, []);
  const recountNow = (form: HTMLFormElement | null) => {
    if (total == null || !form) return;
    stop();
    if (!counts) setShown(undefined);
    const n = pending.current.n;
    // Read after React has rendered the change (a controlled field's hidden inputs), then count.
    pending.current.timer = setTimeout(() => {
      const q = formQuery(form);
      if (counts) return setShown(tally(counts, q));
      const abort = (pending.current.abort = new AbortController());
      (recount ? recount(q.toString()) : countFromPage(`${new URL(form.action).pathname}?${q}`, abort.signal))
        .catch(() => null)
        .then((got) => n === pending.current.n && setShown(got));
    }, counts ? 0 : 500);
  };
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
        onChange={(e) => (e.target as Partial<HTMLInputElement>).type !== "search" && recountNow(e.currentTarget.closest("form"))}
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
        {saveDefaults && <SaveDefaults sheet={sheet} />}
        <div className={cn("flex items-center gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", !saveDefaults && "border-t border-border")}>
          {clear ? (
            <Button asChild variant="secondary"><Link href={clear} scroll={false} onClick={close}>Reset</Link></Button>
          ) : (
            <Button type="reset" variant="secondary" onClick={() => (stop(), setShown(total))}>Reset</Button>
          )}
          <Button type="submit" className="flex-1">{shown != null ? `Show ${formatRank(shown)} ${shown === 1 ? "result" : "results"}` : "Show results"}</Button>
        </div>
      </dialog>
    </>
  );
}

/**
 * "Save as my defaults": the sheet's courses, quotas, states, fee cap and bond cap into her saved profile (it follows
 * her account, AccountSync), then this page with them as her profile. Filters without a profile field (college type,
 * stipend…) stay page filters, as the (i) says.
 */
function SaveDefaults({ sheet }: { sheet: React.RefObject<HTMLDialogElement | null> }) {
  const [saved, setStored] = useSavedProfile();
  const [done, setDone] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const save = () => {
    const form = sheet.current?.closest("form");
    const base = saved ?? profileFromParams(new URLSearchParams(location.search));
    if (!form || !base) return;
    const q = new URLSearchParams([...formQuery(form)].filter(([, v]) => v !== ""));
    const fields = new Set([...form.elements].flatMap((e) => ((e as HTMLInputElement).name && (e as HTMLInputElement).type !== "hidden" ? [(e as HTMLInputElement).name] : [])));
    const next = profileWithFilters(base, q, fields);
    setStored(next);
    setDone(true);
    // Her caps now come from the profile: the page's own fee and bond filters give way to them.
    q.delete("maxfee");
    q.delete("bondyrs");
    q.delete("page");
    sheet.current?.close();
    navigating();
    router.push(`${pathname}?${profileToParams(next, q)}`, { scroll: false });
  };
  return (
    <div className="flex items-center gap-1 border-t border-border px-4 pt-2">
      <button type="button" onClick={save} className="inline-flex min-h-11 items-center text-sm font-semibold text-sky underline">{done ? "Saved as your defaults" : "Save as my defaults"}</button>
      <InfoTip label="Save as my defaults">
        Saves the courses, quotas, states, fee cap and bond cap ticked here to your profile (your account keeps it on every device). College type and the other filters
        stay on this page only.
      </InfoTip>
    </div>
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
 * fields, live, or `value` when the caller keeps it), that opens the fields under it (`onOpen` then). One open at a time
 * (a native accordion). `info`: the longer words, behind an (i) beside the summary (phrasing content). `summary`: the
 * server's words for it before the page's script runs.
 */
export function FilterSection({ title, none = "All", info, summary, value, onOpen, children }: {
  title: string;
  none?: string;
  info?: React.ReactNode;
  summary?: string;
  value?: string;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDetailsElement>(null);
  const [read_, setNow] = useState(summary ?? null);
  const now = value ?? read_;
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
        onToggle={(e) => {
          if (!e.currentTarget.open) return;
          onOpen?.();
          revealInSheet(e.currentTarget, true);
        }}
      >
        {/* Fixed sizes (not the phone's compact spacing): a 48px row, and the (i) sits in the gap kept before the chevron. */}
        <summary className="flex min-h-[3rem] cursor-pointer list-none items-center gap-[0.75rem] py-2 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 text-sm font-semibold">{title}</span>
          <span title={now ?? none} className={cn("ml-auto min-w-0 truncate text-right text-sm", now && now !== none ? "font-semibold text-sky" : "text-muted-foreground")}>{now ?? none}</span>
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
