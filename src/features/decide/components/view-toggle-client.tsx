"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLocal } from "../lib/local-store";
import { SourcesOn } from "./page-sources";
import { paneClass, parseView, VIEW_PARAM, viewCookie, viewHref, type View } from "./view-toggle";

// The client half of view-toggle.tsx (import from there): the toggle, the saved choice and the panes.

const VIEWS = [
  { v: "cards", label: "Cards", Icon: LayoutGrid },
  { v: "table", label: "Table", Icon: Table2 },
] as const;

const storeKey = (page: string) => `medpath.view.${page}`;
/** The choice as a cookie too, for the server (one year, the Decide pages only). */
const writeCookie = (page: string, v: View) => {
  document.cookie = `${viewCookie(page)}=${v}; path=/decide; max-age=31536000; samesite=lax`;
};

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
/** From md up; null on the server and at hydration, where CSS alone picks the pane. */
const useWide = () => useSyncExternalStore(onWide, () => window.matchMedia(WIDE).matches, () => null);

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
  const wide = useWide();
  const shown = chosen ?? (wide ? "table" : "cards");
  // A choice saved before the cookie existed: tell the server too.
  useEffect(() => {
    const v = parseView(saved);
    if (v && !document.cookie.includes(`${viewCookie(page)}=${v}`)) writeCookie(page, v);
  }, [page, saved]);
  const pick = (v: View) => {
    save(v);
    writeCookie(page, v);
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
 * The address's Cards | Table choice as a hidden field (FilterBar renders it), so Apply keeps it without JS. Read from
 * the address as it is now (the toggle updates it in place), never a server copy that would undo a switch made after load.
 */
export function ViewField() {
  const v = parseView(useSearchParams()?.get(VIEW_PARAM));
  return v && <input type="hidden" name={VIEW_PARAM} value={v} />;
}

/** Fetches the page again with `layout=want` (the server rendered the other pane only). */
function Refetch({ want }: { want: View }) {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    // The toggle already put `layout` in the address (no reload): fetch it again; else go to it with `layout`.
    if (sp?.get(VIEW_PARAM) === want) router.refresh();
    else router.replace(viewHref(sp, want), { scroll: false });
  }, [want, router, sp]);
  return null;
}

/**
 * ViewPanes' client half. Both panes (`cards`, `table`): the chosen one shows, the other is hidden, and only the one on
 * show registers its sources (at hydration both, until the breakpoint is read). `only`: the server rendered
 * that pane alone (`children`); when she picks the other, the page is fetched again with it, this one dimmed meanwhile.
 */
export function ViewPanesClient({ page, only, children, cards, table }: { page: string; only?: View; children?: React.ReactNode; cards?: React.ReactNode; table?: React.ReactNode }) {
  const chosen = useView(page);
  const wide = useWide();
  const want = only && chosen && chosen !== only ? chosen : null;
  if (only) {
    return (
      <>
        {want && <Refetch want={want} />}
        <div data-view-pane={only} aria-busy={want ? true : undefined} className={want ? "opacity-60 transition-opacity" : undefined}>{children}</div>
      </>
    );
  }
  // ponytail: a device-saved choice that differs from the breakpoint default applies after hydration (one repaint).
  const shown = chosen ?? (wide == null ? null : wide ? "table" : "cards");
  const pane = (v: View, body: React.ReactNode) => (
    <div data-view-pane={v} className={paneClass(chosen, v)}>
      <SourcesOn on={!shown || shown === v}>{body}</SourcesOn>
    </div>
  );
  return <>{pane("cards", cards)}{pane("table", table)}</>;
}
