import { Children, Fragment, useId } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

// One result as a compact card (the Rank & Seats layout): a header row of chips and actions, a big number on the left,
// the institute, its course and a meta line, and a footer (the term stat cells). Slots only: pages bring the badges,
// cells and buttons. Server-safe (no client hooks), so server and client pages both use it.

type Node = React.ReactNode;
const present = (n: Node) => n != null && n !== false && n !== "";

/** Items with a visual separator that reads as a pause: the mark is hidden, a comma is there for screen readers. */
function Joined({ items, mark }: { items: Node[]; mark: Node }) {
  return items.filter(present).map((n, i) => (
    <Fragment key={i}>
      {i > 0 && <>{mark}<span className="sr-only">, </span></>}
      {n}
    </Fragment>
  ));
}

const newTab = <span className="sr-only"> (opens in a new tab)</span>;

/**
 * `chips`: the header row, left to right ("2026 · R1", "All India Quota", "Open"); empty ones are skipped.
 * `actions`: icon buttons at the header's right (wishlist, compare; 44px each).
 * `stat`: the big number on the left, e.g. `{ label: "Rank", value: formatRank(1) }` (proportional figures).
 * `title` + `href`: the institute (an in-app link). `external`: its page elsewhere (MCC profile, website), an icon link
 * beside the title, or the title itself when there is no `href`; both open in a new tab and say so.
 * `subtitle`: the course. `meta`: "Delhi • <TypeBadge/> • 1,538 beds"; empty ones are skipped.
 * `footer`: TermStatCells (no padding here: the cells bring their own rules). `level`: the title's heading level.
 *
 * Reading order puts the title first (heading navigation lands on it, then the course, meta, number, chips, footer);
 * CSS puts the chips on top and the number on the left.
 */
export function ResultCard({ chips, actions, stat, title, href, external, subtitle, meta, footer, level = 3, className }: {
  chips?: Node[];
  actions?: Node;
  stat?: { label: string; value: Node };
  title: string;
  href?: string;
  external?: { href: string; label: string };
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
  const head = chips?.some(present) || actions;
  return (
    <article className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-card", className)}>
      <div className="flex flex-row-reverse items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <H className="text-[15px] leading-snug font-semibold break-words">
            {href ? (
              <Link href={href} className={link}>{title}</Link>
            ) : external ? (
              <a href={external.href} target="_blank" rel="noopener noreferrer" className={link}>
                {title}<span className="ml-1 inline-flex align-[-0.125em] text-muted-foreground">{icon}</span>{newTab}
              </a>
            ) : (
              title
            )}
            {href && external && (
              <a
                href={external.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${external.label} (opens in a new tab)`}
                title={external.label}
                className="relative ml-1.5 inline-flex size-5 items-center justify-center align-middle text-muted-foreground before:absolute before:-inset-3 before:content-[''] hover:text-sky"
              >
                {icon}
              </a>
            )}
          </H>
          {present(subtitle) && <div className="mt-0.5 text-sm">{subtitle}</div>}
          {meta?.some(present) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
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
      </div>
      {head && (
        <div className="order-first flex min-h-11 items-center justify-between gap-2 border-b border-border pl-4 pr-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-xs font-medium text-muted-foreground">
            <Joined items={chips ?? []} mark={<span aria-hidden className="h-3 w-px bg-border" />} />
          </div>
          {actions && <div className="flex shrink-0 items-center">{actions}</div>}
        </div>
      )}
      {present(footer) && <div className="border-t border-border">{footer}</div>}
    </article>
  );
}

/**
 * A list of ResultCards under a heading that names it, with the count beside it ("Allotments (25 of 1,234)").
 * `id`: the heading's id (a Pager focus target; it takes focus). `hideTitle`: the heading for screen readers only
 * (the page shows its own). Inside ViewPanes leave `id` out: both panes are in the page, so an id would repeat.
 */
export function ResultCards({ title, count, id, level = 2, hideTitle, children, className }: {
  title: string;
  count?: Node;
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
      <ul role="list" className="grid gap-3 lg:grid-cols-2">
        {Children.map(children, (c) => present(c) && <li className="grid min-w-0">{c}</li>)}
      </ul>
    </section>
  );
}
