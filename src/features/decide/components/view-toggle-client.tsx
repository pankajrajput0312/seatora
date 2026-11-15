"use client";

import { useSearchParams } from "next/navigation";
import { LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { parseView, VIEW_PARAM, viewCookie, viewHref, type View } from "./view-toggle";

// The client half of view-toggle.tsx (import from there).

const VIEWS = [
  { v: "cards", label: "Cards", Icon: LayoutGrid },
  { v: "table", label: "Table", Icon: Table2 },
] as const;

/** The choice as a cookie, for the server (one year, the Decide pages only). */
const writeCookie = (page: string, v: View) => {
  document.cookie = `${viewCookie(page)}=${v}; path=/decide; max-age=31536000; samesite=lax`;
};

const item = "inline-flex min-h-11 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:text-foreground first:rounded-l-md last:rounded-r-md";
const ON = "bg-sky/10 font-semibold text-sky hover:text-sky";

/**
 * The Cards | Table control for `page` (a short stable name, e.g. "allotments"), `view` the one on show. Two links to
 * `?layout=…` (every other param kept; the one on show `aria-current`): following one loads the page in that view (the
 * shell dims it meanwhile), and with JS also saves the choice in a cookie for her next visit. Plain links, a full load:
 * ponytail: a next/link here never commits (as of e387871 no same-route client navigation does: Pager, Apply); back to
 * <Link scroll={false}> once that is fixed. Pass `view` (chosenView):
 * without it only the address's choice is marked.
 */
export function ViewToggle({ page, view: shown, className }: { page: string; view?: View; className?: string }) {
  const sp = useSearchParams();
  const view = shown ?? parseView(sp?.get(VIEW_PARAM));
  return (
    <div role="group" aria-label="View as" className={cn("inline-flex shrink-0 divide-x divide-input rounded-md border border-input bg-card", className)}>
      {VIEWS.map(({ v, label, Icon }) => (
        <a key={v} href={viewHref(sp, v)} aria-current={view === v ? "true" : undefined} onClick={() => writeCookie(page, v)} className={cn(item, view === v && ON)}>
          <Icon className="size-4" strokeWidth={1.75} aria-hidden />{label}
        </a>
      ))}
    </div>
  );
}

/** The address's Cards | Table choice as a hidden field (FilterBar renders it), so Apply keeps it without JS too. */
export function ViewField() {
  const v = parseView(useSearchParams()?.get(VIEW_PARAM));
  return v && <input type="hidden" name={VIEW_PARAM} value={v} />;
}
