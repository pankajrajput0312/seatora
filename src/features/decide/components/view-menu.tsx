"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { navigating } from "./nav-pending";
import type { View } from "./view-toggle";
import { ViewToggle } from "./view-toggle-client";

/** One way to sort a list: `href` is this page with it (the server's own sort params, `page` dropped); `short`: phones' words. */
export type SortChoice = { value: string; label: string; short?: string; href: string };

/**
 * The toolbar's "Sort: <current> ▾", beside View: a native <select> (labelled "Sort", the keyboard's and the screen
 * reader's own control) over the words she sees, so the current sort is always on the page (phones: the icon and its
 * short word; md: "Sort:" and the short word; lg up the whole choice, its full words in the tooltip when cut). Picking one loads its
 * `href` (the sort lives in the address: Back, a shared link, the CSV); the new order is announced ("Sorted by …").
 * With the keyboard (arrows change a closed select at once on some systems) it waits until she stops. Inside a filter
 * form, the address's `sort` and `dir` ride along as hidden fields, so Apply keeps the order. `value`: the current
 * choice's (a value no choice has: the first).
 */
export function SortMenu({ choices, value, className }: { choices: SortChoice[]; value: string; className?: string }) {
  const id = useId();
  const router = useRouter();
  const sp = useSearchParams();
  const on = choices.find((c) => c.value === value) ?? choices[0];
  // What she picked, shown at once while its page loads; the page's own once it has.
  const [v, setV] = useState(on.value);
  useEffect(() => setV(on.value), [on.value]);
  const shown = choices.find((c) => c.value === v) ?? on;
  const keyed = useRef(false);
  const wait = useRef<ReturnType<typeof setTimeout>>(undefined);
  const picked = useRef(false);
  const [said, setSaid] = useState("");
  // Said once the page shows the new order (this control stays mounted across the navigation).
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    setSaid(`Sorted by ${on.label}`);
  }, [on.label]);
  useEffect(() => () => clearTimeout(wait.current), []);
  const go = (href: string) => {
    picked.current = true;
    navigating();
    router.push(href, { scroll: false });
  };
  return (
    <div
      data-sort-menu
      className={cn(
        "relative inline-flex h-11 min-w-0 shrink-0 items-center gap-2 rounded-md border border-edge bg-secondary px-3 text-sm font-medium whitespace-nowrap shadow-xs hover:border-input hover:bg-muted has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-ring md:px-4",
        className,
      )}
    >
      {(["sort", "dir"] as const).map((k) => sp.get(k) && <input key={k} type="hidden" name={k} value={sp.get(k)!} />)}
      <ArrowUpDown className="size-4 shrink-0" aria-hidden />
      <span aria-hidden className="max-md:hidden">Sort:</span>
      <span aria-hidden className="min-w-0 truncate font-normal text-muted-foreground lg:max-w-56">
        <span className="lg:hidden">{shown.short ?? shown.label}</span>
        <span className="max-lg:hidden">{shown.label}</span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <label htmlFor={id} className="sr-only">Sort</label>
      <select
        id={id}
        value={shown.value}
        title={shown.label}
        onKeyDown={() => (keyed.current = true)}
        onPointerDown={() => (keyed.current = false)}
        onChange={(e) => {
          const href = choices.find((c) => c.value === e.currentTarget.value)?.href;
          setV(e.currentTarget.value);
          if (!href) return;
          clearTimeout(wait.current);
          if (keyed.current) wait.current = setTimeout(() => go(href), 700);
          else go(href);
        }}
        // Over the whole box (the words under it are what it shows): a tap or click opens the browser's own list.
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
      >
        {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <span role="status" className="sr-only">{said}</span>
    </div>
  );
}

/**
 * The toolbar's "View" disclosure: a page's view, round and list pickers (links) in a panel under one button, so the
 * results come first. A native <details> (its summary is announced as expanded or collapsed); Escape, a click outside or
 * following one of its links closes it, focus back on the button after Escape or a link (the page stays where it was). `current`: what is picked, beside "View"
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
      onClick={(e) => {
        if (!(e.target as Element).closest("a[href]")) return;
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }}
    >
      {/* Phones: the icon alone (the toolbar's row is the search box's); its name stays "View". */}
      <summary className="inline-flex h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-edge bg-secondary text-sm font-medium whitespace-nowrap shadow-xs hover:border-input hover:bg-muted group-open/vm:border-input group-open/vm:bg-muted md:px-4 [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="size-4" aria-hidden />
        <span className="max-md:sr-only">View</span>
        {current && <span className="max-w-56 truncate font-normal text-muted-foreground max-md:sr-only">{current}</span>}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open/vm:rotate-180 max-md:hidden" aria-hidden />
      </summary>
      {/* Phones: across the pinned toolbar (its box is the panel's), under it. */}
      <div className="absolute right-0 z-30 mt-1.5 grid max-h-[70dvh] w-[34rem] gap-4 overflow-auto rounded-lg border border-border bg-popover p-4 shadow-overlay max-md:inset-x-4 max-md:top-full max-md:w-auto">
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

/** The View menu of a results page whose view choice is Cards | Table (`page`: ViewToggle's key); `children`: its other choices (Expand all). */
export function LayoutMenu({ page, view, children }: { page: string; view: View; children?: React.ReactNode }) {
  return (
    <ViewMenu current={view === "cards" ? "Cards" : "Table"}>
      <ViewMenuGroup label="Layout">
        <ViewToggle page={page} view={view} className="justify-self-start" />
      </ViewMenuGroup>
      {children}
    </ViewMenu>
  );
}
