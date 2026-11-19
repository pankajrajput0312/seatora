import { Children, Fragment, useId } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

// One result as a compact card (the Rank & Seats layout): a header row of chips and actions, a big number on the left,
// the institute, its course and a meta line, and a footer (the term stat cells). Slots only: pages bring the badges,
// cells and buttons. Server-safe (no client hooks), so server and client pages both use it.

type Node = React.ReactNode;
const present = (n: Node) => n != null && n !== false && n !== "";

/**
 * Items with a visual separator that reads as a pause: the mark is hidden, a comma is there for screen readers. Each
 * mark shares a box with the item after it, so a wrapped line never ends on a mark ("Delhi • Government •").
 */
function Joined({ items, mark }: { items: Node[]; mark: Node }) {
  return items.filter(present).map((n, i) =>
    i === 0 ? (
      <Fragment key={i}>{n}</Fragment>
    ) : (
      <span key={i} className="inline-flex min-w-0 items-center gap-[inherit]">
        {mark}<span className="sr-only">, </span>
        {n}
      </span>
    ),
  );
}

const newTab = <span className="sr-only"> (opens in a new tab)</span>;

/**
 * `chips`: the header row, left to right ("2026 · R1", "All India Quota", "Open"); empty ones are skipped.
 * `actions`: icon buttons at the header's right (wishlist, compare; 44px each); with no chip to show, at the body's top
 * right instead (stacked on phones), so a card never spends a row on two icons.
 * `stat`: the big number on the left, e.g. `{ label: "Rank", value: formatRank(1) }` (proportional figures).
 * `title` + `href`: the institute (an in-app link). `external`: its MCC profile, a small "MCC ↗" link beside the heading
 * (outside it, so the heading is named by the institute alone; one name on every card: "Open on MCC: <title>"), or the title
 * itself when there is no `href`; both open in a new tab and say so.
 * `subtitle`: the course. `meta`: "Delhi • <TypeBadge/> • 1,538 beds"; empty ones are skipped.
 * `footer`: TermStatCells (no padding here: the cells bring their own rules). `level`: the title's heading level.
 *
 * Reading order puts the title first (heading navigation lands on it, then the course, meta, number, chips, footer);
 * CSS puts the chips on top and the number on the left.
 */
export function ResultCard({ chips, actions, stat, title, href, external, subtitle, meta, footer, level = 3, className }: {
  chips?: Node[];
  actions?: Node;
  stat?: { label: Node; value: Node };
  title: string;
  href?: string;
  /** `label` is not read: every card names the link "Open on MCC: <title>" (kept optional so callers still compile). */
  external?: { href: string; label?: string };
  subtitle?: Node;
  meta?: Node[];
  footer?: Node;
  level?: 2 | 3 | 4;
  className?: string;
}) {
  const H = `h${level}` as const;
  const icon = <ExternalLink className="size-4" strokeWidth={2} aria-hidden />;
  // Inline vertical padding widens the link's hit area to 44px without moving the lines around it.
  const link = "py-3 hover:text-sky hover:underline";
  // The header row is for chips; actions alone sit in the body (bodyActions).
  const head = chips?.some(present);
  const bodyActions = !!actions && !head;
  return (
    <article className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-card", className)}>
      <div className="flex flex-row-reverse items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {/* The icon link beside the heading, not in it, and never on a line of its own under the title. */}
          <div className="flex items-start gap-1.5">
            <H className="min-w-0 text-[15px] leading-snug font-semibold break-words">
              {href ? (
                <Link href={href} className={link}>{title}</Link>
              ) : external ? (
                <a href={external.href} target="_blank" rel="noopener noreferrer" className={link}>
                  {title}<span className="ml-1 inline-flex align-[-0.125em] text-muted-foreground">{icon}</span>{newTab}
                </a>
              ) : (
                title
              )}
            </H>
            {/* Worded "MCC", so the ↗ never reads as "open this college" (the title link does that). */}
            {href && external && (
              <a
                href={external.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open on MCC: ${title} (opens in a new tab)`}
                title="Open on MCC"
                className="hit inline-flex h-5 shrink-0 items-center gap-0.5 text-xs font-semibold text-muted-foreground hover:text-sky"
              >
                MCC<ExternalLink className="size-3.5" strokeWidth={2} aria-hidden />
              </a>
            )}
          </div>
          {present(subtitle) && <div className="mt-0.5 text-sm">{subtitle}</div>}
          {meta?.some(present) && (
            // An (i)'s hit area reaches down and sideways, not up (a wrapped line's (i) never covers the one above it), and
            // stays 44px tall: 20px icon + 24px below.
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground [&_button]:before:top-0 [&_button]:before:bottom-[-1.5rem]">
              <Joined items={meta} mark={<span aria-hidden>•</span>} />
            </div>
          )}
        </div>
        {stat && (
          <div className="grid shrink-0 justify-items-start">
            <span className="text-xs text-muted-foreground">{stat.label}</span>
            <span className="text-2xl leading-tight font-bold tracking-tight">{stat.value}</span>
          </div>
        )}
        {/* After the title and number in reading order; order-first puts it rightmost (the row is reversed). */}
        {bodyActions && <div className="order-first -mt-2 -mr-3 flex shrink-0 flex-col sm:flex-row">{actions}</div>}
      </div>
      {head && (
        // The row's height is its action buttons' (44px); chips alone keep the compact phone height.
        <div className={cn("order-first flex min-h-11 items-center justify-between gap-2 border-b border-border pl-4 pr-1", !actions && "max-md:min-h-[2.2rem]")}>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-xs font-medium text-muted-foreground">
            <Joined items={chips ?? []} mark={<span aria-hidden className="h-3 w-px bg-border" />} />
          </div>
          {actions && <div className="flex shrink-0 items-center">{actions}</div>}
        </div>
      )}
      {/* mt-auto: cards side by side keep their cells on one line at the bottom. */}
      {present(footer) && <div className="mt-auto border-t border-border">{footer}</div>}
    </article>
  );
}

/**
 * A list of ResultCards under a heading that names it, with the count beside it ("Allotments (25 of 1,234)").
 * `id`: the heading's id (a Pager focus target; it takes focus). `hideTitle`: the heading for screen readers only
 * (the page shows its own). Inside ViewPanes leave `id` out: both panes are in the page, so an id would repeat.
 */
export function ResultCards({ title, count, note, id, level = 2, hideTitle, children, className }: {
  title: string;
  count?: Node;
  /** A line under the heading (what the cards have in common). */
  note?: Node;
  id?: string;
  level?: 2 | 3;
  hideTitle?: boolean;
  children?: Node;
  className?: string;
}) {
  const auto = useId();
  const hid = id ?? `cards${auto.replace(/[^\w-]/g, "")}`;
  const H = `h${level}` as const;
  return (
    <section aria-labelledby={hid} className={cn("grid gap-3", className)}>
      <H id={hid} tabIndex={-1} className={cn("text-sm font-semibold", hideTitle && "sr-only")}>
        {title}
        {present(count) && <> <span className="numeric font-normal text-muted-foreground">({count})</span></>}
      </H>
      {present(note) && <p className="-mt-2 text-sm text-muted-foreground">{note}</p>}
      <ul role="list" className="grid gap-3 lg:grid-cols-2">
        {Children.map(children, (c) => present(c) && <li className="grid min-w-0">{c}</li>)}
      </ul>
    </section>
  );
}
