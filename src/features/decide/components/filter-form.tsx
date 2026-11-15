"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The GET filter form (FilterBar, Options, Seats): Apply loads the page with the fields as its params. A plain form, a
 * full load. ponytail: next/form's client navigation never commits as of e387871 (no same-route client navigation does);
 * back to next/form (focus then stays on the Filters button, below) once that is fixed.
 */
export function FilterForm(props: ComponentProps<"form"> & { action: string }) {
  return (
    <form
      method="get"
      {...props}
      onSubmit={(e) => {
        const form = e.currentTarget;
        const panel = form.querySelector<HTMLDetailsElement>("details[data-filters][open]");
        form.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((d) => (d.open = false));
        const to = panel?.querySelector("summary") ?? (e.nativeEvent as SubmitEvent).submitter ?? form.querySelector<HTMLElement>("[type=submit]");
        (to as HTMLElement | null)?.focus();
      }}
    />
  );
}

/**
 * The filters behind a "Filters" button (its badge: `count`, the filters applied), so a list page shows only its search
 * box, this button and the active-filter chips. A native <details>: it opens and Apply submits without JS. Opens as a
 * sheet from the bottom on phones and a panel under the bar from md up; Escape, Close or a click outside closes it,
 * focus back on the button. `clear`: this page with its filters cleared. Render inside a FilterForm.
 */
export function FiltersPanel({ count, clear, children }: { count: number; clear?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const close = (focus = true) => {
    if (!box.current?.open) return;
    box.current.open = false;
    if (focus) box.current.querySelector("summary")?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <details
      ref={box}
      data-filters
      className="group/filters"
      onToggle={(e) => setOpen(e.currentTarget.open)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && box.current?.open) {
          e.preventDefault();
          close();
        }
      }}
    >
      <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-input bg-secondary px-4 text-sm font-medium hover:bg-raised group-open/filters:border-sky [&::-webkit-details-marker]:hidden">
        <ListFilter className="size-4" aria-hidden />
        Filters
        {count > 0 && (
          <span className="numeric inline-flex min-w-5 items-center justify-center rounded-full bg-sky/15 px-1.5 text-xs font-semibold text-sky">
            {count}<span className="sr-only"> applied</span>
          </span>
        )}
      </summary>
      {/* tabIndex -1: a click on the panel's text keeps focus inside it. */}
      <div
        role="group"
        aria-label="Filters"
        tabIndex={-1}
        className="z-50 grid gap-4 border border-border bg-card p-4 shadow-overlay outline-none max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[85dvh] max-md:overflow-y-auto max-md:rounded-t-2xl md:absolute md:inset-x-0 md:top-full md:mt-2 md:rounded-xl"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Filters</p>
          <Button type="button" variant="ghost" size="icon" aria-label="Close filters" onClick={() => close()}><X className="size-5" aria-hidden /></Button>
        </div>
        {children}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <Button type="submit">Apply</Button>
          {clear && count > 0 && <Link href={clear} scroll={false} className="inline-flex min-h-11 items-center text-sm text-sky underline">Clear all</Link>}
        </div>
      </div>
    </details>
  );
}

/** The search box's own submit, before the panel's Apply: Enter in it submits even while the panel is closed. */
export function SearchSubmit() {
  return <Button type="submit" variant="secondary">Search</Button>;
}
