import { Fragment } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { EmptyState as AstryxEmptyState } from "@astryxdesign/core/EmptyState";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { keepProfileParams } from "../profile";
import { FilterForm } from "./filter-form";
import { FocusOnChange } from "./focus-item";

// Shared building blocks so every Decide screen reads the same way (docs/APP_DESIGN_SYSTEM.md, "Inside-app primitives").

export const tbl = {
  // scroll-px: Tab scrolls a half-hidden link fully into the box, focus ring included.
  wrap: "relative scroll-px-12 overflow-x-auto rounded-xl border border-border bg-card",
  table: "w-full text-sm",
  headRow: "border-b border-border text-left",
  th: "px-4 py-3 text-xs font-semibold text-muted-foreground",
  row: "border-b border-border last:border-0 hover:bg-muted/50",
  td: "px-4 py-3 align-top",
  num: "px-4 py-3 text-right align-top text-[15px] font-semibold tabular-nums",
};

/**
 * GET filter form that keeps the profile params (every repeated value, comma-joined). The form and its Apply button
 * stay mounted across navigations so focus stays on Apply (Enter in a field moves it there); only the fields remount
 * to show the applied values.
 * Submitting drops `page`, so results start at page 1.
 */
export function FilterBar({ action, params, children, cols = "md:grid-cols-4" }: { action: string; params: URLSearchParams; children: React.ReactNode; cols?: string }) {
  return (
    <FilterForm action={action} scroll={false} role="search" className={cn("grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2", cols, "md:items-end")}>
      {[...keepProfileParams(params)].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Fragment key={params.toString()}>{children}</Fragment>
      <Button type="submit">Apply</Button>
    </FilterForm>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Text inputs and selects in filter bars and forms (same focus and invalid states as the Input primitive). */
export const control = "h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-sky aria-invalid:border-ember";

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

/** One cell of a StatStrip. Big standalone numbers use proportional figures; pass them through formatRank (Indian grouping). */
export function StatCell({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
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
export const smallLink = "inline-flex min-h-11 items-center underline hover:text-foreground";

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
