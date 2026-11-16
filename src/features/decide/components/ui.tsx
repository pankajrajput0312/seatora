import { Fragment } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { EmptyState as AstryxEmptyState } from "@astryxdesign/core/EmptyState";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { keepProfileParams } from "../profile";
import { FilterForm, FiltersPanel, SearchSubmit } from "./filter-form";
import { FocusOnChange } from "./focus-item";
import { InfoTip } from "./info-tip";
import { ViewField } from "./view-toggle";

// Shared building blocks so every Decide screen reads the same way (docs/APP_DESIGN_SYSTEM.md, "Inside-app primitives").

export const tbl = {
  // scroll-px: Tab scrolls a half-hidden link fully into the box, focus ring included.
  wrap: "relative scroll-px-12 overflow-x-auto rounded-xl border border-border bg-card",
  table: "w-full text-sm",
  headRow: "border-b border-border text-left",
  th: "px-3 py-2 text-xs font-semibold text-muted-foreground",
  row: "border-b border-border last:border-0 hover:bg-muted/50",
  td: "px-3 py-2 align-top",
  num: "px-3 py-2 text-right align-top text-[0.875rem] font-semibold tabular-nums md:text-[15px]",
  /**
   * Wide tables: the box scrolls both ways inside the window's height, so the header row (`head`, on the thead) and a
   * sticky first column stay in view; scroll-pt keeps a focused cell clear of the header. On paper the box lets every
   * row through (a window-high box would cut the rest off).
   */
  // Screen only: a media variant like this one comes after print:, so print:max-h-none would lose to it on paper.
  scroll: "overflow-auto overscroll-x-contain scroll-pt-40 [@media_screen_and_(min-height:40rem)]:max-h-[calc(100dvh-9rem)] print:overflow-visible",
  head: "sticky top-0 z-[2] bg-card shadow-[0_1px_0_var(--color-border)] print:static",
};

/**
 * GET filter form that keeps the profile params (every repeated value, comma-joined). The form and its Apply button
 * stay mounted across navigations so focus stays on Apply (Enter in a field moves it there); only the fields remount
 * to show the applied values.
 * Submitting drops `page`, so results start at page 1, and keeps the address's Cards | Table choice (ViewField).
 * `active` (a list page: the number of its active-filter chips): only `search` (the search box, if any) shows, the
 * fields (`children`, laid out by `cols`) open from a Filters button with that count (FiltersPanel; `clear` its Clear all).
 */
export function FilterBar({ action, params, children, cols = "md:grid-cols-4", search, active, clear }: {
  action: string;
  params: URLSearchParams;
  children: React.ReactNode;
  cols?: string;
  search?: React.ReactNode;
  active?: number;
  clear?: string;
}) {
  if (active != null)
    return (
      <FilterForm action={action} role="search" className="relative flex flex-wrap items-end gap-2">
        {[...keepProfileParams(params)].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <ViewField />
        {search && (
          <>
            <Fragment key={`q${params}`}>{search}</Fragment>
            <SearchSubmit />
          </>
        )}
        <FiltersPanel count={active} clear={clear}>
          <div className={cn("grid gap-3 sm:grid-cols-2", cols, "md:items-end")}><Fragment key={params.toString()}>{children}</Fragment></div>
        </FiltersPanel>
      </FilterForm>
    );
  return (
    <FilterForm action={action} role="search" className={cn("grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2", cols, "md:items-end")}>
      {[...keepProfileParams(params)].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <ViewField />
      <Fragment key={params.toString()}>{children}</Fragment>
      <Button type="submit">Apply</Button>
    </FilterForm>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export { ActiveFilters } from "./active-filters";

/** Text inputs and selects in filter bars and forms (same focus and invalid states as the Input primitive). */
export const control = "h-11 max-md:h-[2.375rem] w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-sky aria-invalid:border-ember";

export function Select({ name, value, options, all }: { name: string; value: string | undefined; options: { value: string; label: string }[]; all?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={control}>
      {all && <option value="">{all}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/**
 * The one empty, no-results and unavailable state (Astryx EmptyState on a dashed sheet): a heading, a line of context,
 * and an action — `children`, or a link from `href` + `action` (default "Clear filters"). The title is announced when
 * it appears after the page loaded (e.g. a filter that matches nothing).
 */
export function EmptyState({ title, description, icon: Icon, href, action, children, headingLevel = 2, className }: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  href?: string;
  action?: string;
  children?: React.ReactNode;
  headingLevel?: 1 | 2 | 3;
  className?: string;
}) {
  const actions = children ?? (href ? <Link href={href} className="inline-flex min-h-11 items-center text-sm text-sky underline">{action ?? "Clear filters"}</Link> : undefined);
  return (
    <div className={cn("rounded-xl border border-dashed border-border bg-card px-6 py-12", className)}>
      <AstryxEmptyState title={title} description={description} headingLevel={headingLevel} icon={Icon && <Icon className="size-6 text-muted-foreground" strokeWidth={1.75} />} actions={actions} />
    </div>
  );
}

/**
 * One cell of a StatStrip. Big standalone numbers use proportional figures; pass them through formatRank (Indian
 * grouping). `note`: one short line under the number. `info`: what the number counts, behind an (i) beside the label.
 */
export function StatCell({ label, value, note, info }: { label: string; value: React.ReactNode; note?: React.ReactNode; info?: React.ReactNode }) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground sm:text-sm">{label}{info && <InfoTip label={label}>{info}</InfoTip>}</dt>
      <dd className="mt-1 text-3xl leading-tight font-bold tracking-tight sm:text-[2.5rem]">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

/** Ruled strip of headline numbers: one band split by hairlines, not floating cards. `children` adds extra StatCells. */
export function StatStrip({ items, children }: { items: React.ComponentProps<typeof StatCell>[]; children?: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border xl:grid-cols-4">
      {items.map((s) => <StatCell key={s.label} {...s} />)}
      {children}
    </dl>
  );
}

/** A link inside small text (notes, captions) that still meets the 44px touch target. */
// Compact text link in a line of prose: its 44px touch target is the invisible `hit` box, not its height (a 44px line box
// spread the lines it sits in). gap-x-1 keeps the space between a number and its word ("624 new") inside the flex.
export const smallLink = "hit inline-flex min-h-6 items-center gap-x-1 underline hover:text-foreground";

/** "51–100 of 710" for a page of results. */
export const rangeLabel = (r: { page: number; pageSize: number; total: number; rows: unknown[] }) =>
  r.total ? `${formatRank((r.page - 1) * r.pageSize + 1)}–${formatRank((r.page - 1) * r.pageSize + r.rows.length)} of ${formatRank(r.total)}` : "0";

/**
 * Server-side pagination: Previous / Next links (all other params kept, via `href`) and "Page 2 of 15". The page does
 * not jump; focus moves to `focusId` after a page change, so give the results heading or count `id={focusId}
 * tabIndex={-1}`. Renders nothing when everything fits on one page.
 */
export function Pager({ page, pageSize, total, href, focusId, label = "Results" }: { page: number; pageSize: number; total: number; href: (page: number) => string; focusId: string; label?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const step = (n: number, text: string, rel: "prev" | "next") =>
    n >= 1 && n <= pages ? (
      <Button asChild variant="secondary"><Link href={href(n)} scroll={false} rel={rel}>{text}</Link></Button>
    ) : (
      <Button variant="secondary" disabled>{text}</Button>
    );
  return (
    <nav aria-label={`${label}, pages`} className="flex flex-wrap items-center justify-center gap-3">
      {step(page - 1, "Previous", "prev")}
      <p className="numeric text-sm text-muted-foreground">Page {formatRank(page)} of {formatRank(pages)}</p>
      {step(page + 1, "Next", "next")}
      <FocusOnChange id={focusId} value={page} />
    </nav>
  );
}
