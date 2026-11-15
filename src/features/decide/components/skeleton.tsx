import { cn } from "@/lib/cn";

// Loading placeholders for the Decide routes' loading.tsx: blocks sized like the page they stand in for (AppPage frame,
// PageHead, FilterBar, StatStrip, tables, cards) so nothing jumps when the data arrives. The shimmer is globals.css
// `.skeleton` (a static block under prefers-reduced-motion). Blocks are decorative; LoadingPage announces the wait.

/** One shimmering block. Size it with classes (height, width). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

/** A loading.tsx's frame: AppPage's padding and grid (`className` as the page passes it), busy, with a hidden status. */
export function LoadingPage({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={cn("w-full min-w-0 max-w-[110rem] px-4 py-6 md:px-6 xl:px-10", className)}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** PageHead: the title (its width roughly the title's), and the line under it when the page has one. */
export function SkHead({ w = "w-56", sub }: { w?: string; sub?: string }) {
  return (
    <div className="max-w-3xl">
      <Skeleton className={cn("h-11 max-w-full", w)} />
      {sub && <Skeleton className={cn("mt-3 h-5 max-w-full", sub)} />}
    </div>
  );
}

/** FilterBar: `n` controls (field labels above them when `labels`) in a 4-column card, Apply included. */
export function SkFilters({ n = 8, labels, cols = "md:grid-cols-4" }: { n?: number; labels?: boolean; cols?: string }) {
  return (
    <div aria-hidden className={cn("grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 md:items-end", cols)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="grid gap-1.5">
          {labels && <Skeleton className="h-4 w-20" />}
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  );
}

/** The line above results ("1–25 of 1,065 options") and the Cards/Table toggle. */
export function SkToolbar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Skeleton className="h-5 w-52" />
      <Skeleton className="h-11 w-40" />
    </div>
  );
}

/** Chips or tabs: a row of `n` pills (rounded) or tab labels. */
export function SkChips({ n = 5, tabs }: { n?: number; tabs?: boolean }) {
  return (
    <div className={cn("flex flex-wrap gap-2", tabs && "gap-6 border-b border-border pb-3")}>
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} className={tabs ? "h-5 w-20" : "h-11 w-36 rounded-full"} />)}
    </div>
  );
}

/** StatStrip: `n` headline numbers in one ruled band. */
export function SkStats({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border xl:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="bg-card p-4 sm:p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-10 w-24 sm:h-12" />
          <Skeleton className="mt-4 mb-3 h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

/** A table (ui.tsx `tbl`): a header row and `rows` rows of `cols` cells, the first one wider and two lines tall. */
export function SkTable({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex gap-6 border-b border-border px-4 py-4">
        {Array.from({ length: cols }, (_, i) => <Skeleton key={i} className={cn("h-4", i === 0 ? "w-1/4" : "flex-1")} />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-6 border-b border-border px-4 py-4 last:border-0">
          <div className="grid w-1/4 gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          {Array.from({ length: cols - 1 }, (_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  );
}

/** Result cards: `n` sheets in a 1/2-column grid (`cols` overrides), each a heading, two lines and a stat row. */
export function SkCards({ n = 6, cols = "md:grid-cols-2" }: { n?: number; cols?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4", cols)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-6 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <Skeleton className="mt-6 h-20 w-full" />
        </div>
      ))}
    </div>
  );
}

/** A card with a heading and `lines` text lines (panels, notes, empty states). */
export function SkPanel({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn("mt-4 h-4", i % 2 ? "w-2/3" : "w-full")} />)}
    </div>
  );
}

/** The usual list page: title, filter bar, result line with the view toggle, then a table. */
export function SkListPage({ title, sub, filters = 11, labels = true, rows = 8, cols = 6 }: { title?: string; sub?: string; filters?: number; labels?: boolean; rows?: number; cols?: number }) {
  return (
    <LoadingPage className="grid grid-cols-1 gap-6">
      <SkHead w={title} sub={sub} />
      <SkFilters n={filters} labels={labels} />
      <SkToolbar />
      <SkTable rows={rows} cols={cols} />
    </LoadingPage>
  );
}
