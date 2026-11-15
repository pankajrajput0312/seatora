"use client";

import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocal } from "../lib/local-store";

// Cards | Table for a results page. The choice is `layout=cards|table` in the address (works without JS: two links;
// `layout`, not `view`: Options' and Seats' `view` is their own list view), and
// with JS it is saved per page on the device, so it survives Apply and paging. Nothing chosen: cards below md, the table
// from md up (CSS only, so the first paint is right on every screen).

export type View = "cards" | "table";
const VIEWS = [
  { v: "cards", label: "Cards", Icon: LayoutGrid },
  { v: "table", label: "Table", Icon: Table2 },
] as const;

const storeKey = (page: string) => `medpath.view.${page}`;
/** The address param of the choice. */
export const VIEW_PARAM = "layout";

/** A `layout` value from the address or the device (untrusted): only the two views, else null. */
export const parseView = (v: unknown): View | null => (v === "cards" || v === "table" ? v : null);

/** This page's address with `layout` set, every other param kept (relative: "?…"). */
export const viewHref = (params: URLSearchParams | null, v: View) => {
  const p = new URLSearchParams(params?.toString());
  p.set(VIEW_PARAM, v);
  return `?${p}`;
};

/** A pane's classes: the chosen view shows, the other is hidden; nothing chosen, the breakpoint decides. */
export const paneClass = (chosen: View | null, pane: View) =>
  chosen ? (chosen === pane ? undefined : "hidden") : pane === "cards" ? "md:hidden" : "max-md:hidden";

/** The view she chose for `page`: the address first, then the device; null = not chosen (the breakpoint default). */
export function useView(page: string): View | null {
  const sp = useSearchParams();
  const [saved] = useLocal<unknown>(storeKey(page), null);
  return parseView(sp?.get(VIEW_PARAM)) ?? parseView(saved);
}

const WIDE = "(min-width: 48rem)"; // Tailwind md
const onWide = (cb: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

const item = "inline-flex min-h-11 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:text-foreground first:rounded-l-md last:rounded-r-md";
const ON = "bg-sky/10 font-semibold text-sky hover:text-sky";
// Before JS nothing says which view the breakpoint picked, so the links mark it with CSS.
const ON_NARROW = "max-md:bg-sky/10 max-md:font-semibold max-md:text-sky";
const ON_WIDE = "md:bg-sky/10 md:font-semibold md:text-sky";

/**
 * The Cards | Table control for `page` (a short stable name, e.g. "allotments"; the same one as its ViewPanes). Before
 * hydration (or without JS) two links to `?layout=…`, the chosen one `aria-current`; after, two buttons with
 * `aria-pressed` that switch at once (the address is updated in place, no reload) and save the choice on the device.
 */
export function ViewToggle({ page, className }: { page: string; className?: string }) {
  const sp = useSearchParams();
  const [saved, save, hydrated] = useLocal<unknown>(storeKey(page), null);
  const chosen = parseView(sp?.get(VIEW_PARAM)) ?? parseView(saved);
  const wide = useSyncExternalStore(onWide, () => window.matchMedia(WIDE).matches, () => false);
  const shown = chosen ?? (wide ? "table" : "cards");
  const pick = (v: View) => {
    save(v);
    window.history.replaceState(null, "", viewHref(sp, v));
  };
  return (
    <div role="group" aria-label="View as" className={cn("inline-flex shrink-0 divide-x divide-input rounded-md border border-input bg-card", className)}>
      {VIEWS.map(({ v, label, Icon }) => {
        const body = <><Icon className="size-4" strokeWidth={1.75} aria-hidden />{label}</>;
        return hydrated ? (
          <button key={v} type="button" aria-pressed={shown === v} onClick={() => pick(v)} className={cn(item, shown === v && ON)}>{body}</button>
        ) : (
          <a key={v} href={viewHref(sp, v)} aria-current={chosen === v ? "true" : undefined} className={cn(item, chosen ? chosen === v && ON : v === "cards" ? ON_NARROW : ON_WIDE)}>{body}</a>
        );
      })}
    </div>
  );
}

/**
 * Both views of the same results, one shown (`paneClass`): pages render `cards` and `table` from the same rows, so the
 * toggle switches without a round trip. Give ids (a Pager focus target) to elements outside the panes, never inside.
 */
export function ViewPanes({ page, cards, table }: { page: string; cards: React.ReactNode; table: React.ReactNode }) {
  const chosen = useView(page);
  // ponytail: a device-saved choice that differs from the breakpoint default applies after hydration (one repaint);
  // a cookie read on the server would remove it if that ever shows.
  return (
    <>
      <div data-view-pane="cards" className={paneClass(chosen, "cards")}>{cards}</div>
      <div data-view-pane="table" className={paneClass(chosen, "table")}>{table}</div>
    </>
  );
}
