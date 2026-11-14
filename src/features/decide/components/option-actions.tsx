"use client";

import { useState } from "react";
import Link from "next/link";
import { GitCompareArrows, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { MAX_COMPARE, toggleItem, type ChoiceItem } from "../lib/choices";
import type { DecideLinks } from "../lib/links";
import { useChoices, useCompare, useDecideLinks } from "../lib/use-decide-store";
import type { OptionRow } from "../service";
import type { SeatList } from "../types";
import { ReachBadge, TermText } from "./bits";
import { FocusItem } from "./focus-item";
import { ClosingCell, courseName, FeeText, RoundGrid, SeatsBelowNote, SeatsCell, SeatsHead, toChoiceItem } from "./options-view";
import { smallLink } from "./ui";

export function ChoiceStar({ item }: { item: ChoiceItem }) {
  const [state, setState] = useChoices();
  const active = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const on = !!active?.items.some((i) => i.id === item.id);
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-pressed={on}
      aria-label={`In ${active?.name ?? "choices"}: ${item.institute}, ${item.course}, ${item.quota}`}
      onClick={() => setState((s) => toggleItem(s, item))}
    >
      <Star className={cn("size-5", on && "fill-sky text-sky")} strokeWidth={1.75} aria-hidden />
    </Button>
  );
}

/** Adds or removes an option from the compare tray. When the tray is full it stays focusable and says so. */
export function CompareToggle({ id, label }: { id: string; label: string }) {
  const [ids, setIds] = useCompare();
  const on = ids.includes(id);
  const full = !on && ids.length >= MAX_COMPARE;
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-pressed={on}
      aria-disabled={full || undefined}
      aria-label={full ? `Compare is full (${MAX_COMPARE}): ${label}` : `In compare: ${label}`}
      onClick={() => !full && setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]))}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      <GitCompareArrows className={cn("size-5", on && "text-sky")} strokeWidth={1.75} aria-hidden />
    </Button>
  );
}

// ---------- Options list ----------

/**
 * `includeLatest` false: labels made without the latest R1. `seatLists`: the round's lists behind each row's `seatsBy`
 * (clear, virtual, new), one column each, never added (none: no columns).
 */
type Years = { latestYear: number; pastYears: [number, number]; includeLatest: boolean; seatLists: SeatList[] };

function FeeBond({ r }: { r: OptionRow }) {
  return (
    <span className="numeric">
      <FeeText t={r.terms.fee} />
      <span className="block text-xs text-muted-foreground">Bond: <TermText term={r.terms.bond} /></span>
    </span>
  );
}

/** Cross-links for one option, each a 44px target (a new option has no closing ranks or allotments to link). */
function Related({ r, L }: { r: OptionRow; L: DecideLinks }) {
  const link = cn(smallLink, "text-sky");
  return (
    <>
      {r.reach !== "new" && (
        <>
          <Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className={link}>Last ranks</Link>
          <Link href={L.allotments({ course: r.course.slug, inst: r.college.slug })} className={link}>Allotments</Link>
        </>
      )}
      <Link href={L.institute(r.college.slug, "fees")} className={link}>Fees & bond</Link>
    </>
  );
}

const summary = "inline-flex min-h-11 cursor-pointer items-center text-sky";

/**
 * Options as a table (md and up) and as cards (phones). A row's "Rounds by year" grid is rendered only once she opens
 * it (it is most of a row's markup). `start` = rows before these, for data-item numbering (focus after Show more).
 */
function OptionsTable({ rows, caption, start, L, latestYear, pastYears, includeLatest, seatLists }: { rows: OptionRow[]; caption: string; start: number; L: DecideLinks } & Years) {
  const [older, last] = pastYears;
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string, on: boolean) =>
    setOpen((s) => {
      if (s.has(id) === on) return s;
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const gridCaption = (r: OptionRow) => `${r.college.name}, ${courseName(r)}, ${r.quota}: closing ranks by year and round`;
  const label = (r: OptionRow) => `${r.college.name}, ${courseName(r)}, ${r.quota}`;
  return (
    <>
      <div role="region" aria-label={caption} tabIndex={0} className="relative hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
              <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Add to choices</span></th>
              <th scope="col" className="px-3 py-3">Institute and course</th>
              <th scope="col" className="px-3 py-3">Reach</th>
              {seatLists.map((l) => <th key={l.key} scope="col" className="px-1.5 py-3 text-right"><SeatsHead list={l} short /></th>)}
              <th scope="col" className="px-3 py-3 text-right">{latestYear} R1 closing</th>
              <th scope="col" className="px-3 py-3 text-right">{last} deepest</th>
              <th scope="col" className="hidden px-3 py-3 text-right xl:table-cell">{older} deepest</th>
              <th scope="col" className="px-3 py-3">Fee and bond</th>
              <th scope="col" className="px-3 py-3">Details</th>
              <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Compare</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((r, i) => [
              <tr key={r.id} data-item={start + i + 1} tabIndex={-1} className="border-t border-border align-top hover:bg-muted/40">
                <td className="px-2 py-2"><ChoiceStar item={toChoiceItem(r)} /></td>
                {/* Row header: only what names the option, so it reads short for every cell. */}
                <th scope="row" className="px-3 py-3 text-left font-normal">
                  <Link href={L.institute(r.college.slug)} className="font-semibold hover:text-sky hover:underline">{r.college.name}</Link>
                  <span className="block">{courseName(r)}<span className="text-muted-foreground">, {r.quota}, {r.college.state ?? "state not listed"}</span></span>
                </th>
                <td className="px-3 py-3"><ReachBadge reach={r.reach} provisional={r.reachProvisional} includeLatest={includeLatest} /><SeatsBelowNote r={r} includeLatest={includeLatest} /></td>
                {seatLists.map((l) => <td key={l.key} className="px-1.5 py-1 text-right"><SeatsCell r={r} list={l} L={L} n={r.seatsBy?.[l.kind]} /></td>)}
                <td className="px-3 py-3 text-right"><ClosingCell d={r.latest} /></td>
                <td className="px-3 py-3 text-right"><ClosingCell d={r.byYear[last]} /></td>
                <td className="hidden px-3 py-3 text-right xl:table-cell"><ClosingCell d={r.byYear[older]} /></td>
                <td className="px-3 py-3"><FeeBond r={r} /></td>
                <td className="px-3 py-1 text-xs">
                  <span className="flex min-w-[10rem] flex-wrap items-center gap-x-4">
                    {/* Opens the grid in the full-width row below, so this row stays narrow. */}
                    <details open={open.has(r.id)} onToggle={(e) => toggle(r.id, e.currentTarget.open)}>
                      <summary className={summary}>Rounds by year</summary>
                    </details>
                    <Related r={r} L={L} />
                  </span>
                </td>
                <td className="px-2 py-2"><CompareToggle id={r.id} label={label(r)} /></td>
              </tr>,
              open.has(r.id) && (
                <tr key={`${r.id}-rounds`} className="bg-muted/30">
                  <td />
                  <td colSpan={8 + seatLists.length} className="px-3 pb-4"><RoundGrid row={r} caption={gridCaption(r)} /></td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden" aria-label={caption}>
        {rows.map((r, i) => (
          <li key={r.id} data-item={start + i + 1} tabIndex={-1} className="min-w-0">
            <article className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium"><Link href={L.institute(r.college.slug)} className="hover:text-sky hover:underline">{r.college.name}</Link></h2>
                  <p className="text-xs text-muted-foreground">{courseName(r)} · {r.college.state ?? "state not listed"} · {r.quota}</p>
                </div>
                <div className="flex shrink-0">
                  <ChoiceStar item={toChoiceItem(r)} />
                  <CompareToggle id={r.id} label={label(r)} />
                </div>
              </div>
              <div className="mt-2"><ReachBadge reach={r.reach} provisional={r.reachProvisional} includeLatest={includeLatest} /><SeatsBelowNote r={r} includeLatest={includeLatest} /></div>
              {seatLists.length > 0 && (
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  {seatLists.map((l) => (
                    <div key={l.key}><dt className="text-xs text-muted-foreground"><SeatsHead list={l} short /></dt><dd><SeatsCell r={r} list={l} L={L} n={r.seatsBy?.[l.kind]} end={false} /></dd></div>
                  ))}
                </dl>
              )}
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">{latestYear} R1 closing</dt><dd><ClosingCell d={r.latest} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">{last} deepest</dt><dd><ClosingCell d={r.byYear[last]} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">{older} deepest</dt><dd><ClosingCell d={r.byYear[older]} /></dd></div>
              </dl>
              <p className="mt-3 text-sm">Fee: <FeeBond r={r} /></p>
              <details open={open.has(r.id)} onToggle={(e) => toggle(r.id, e.currentTarget.open)} className="mt-1 text-xs">
                <summary className={summary}>Rounds by year</summary>
                {open.has(r.id) && <div className="mt-1"><RoundGrid row={r} caption={gridCaption(r)} /></div>}
              </details>
              <p className="flex flex-wrap gap-x-4 text-xs"><Related r={r} L={L} /></p>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * One server-rendered page of options; "Show more" appends the next page from /api/v1/options (`query` = the same
 * profile and filters) and moves focus to the first new row. The page never holds more rows than she asked to see.
 */
export function OptionsResults({ initial, page, pageSize, total, query, caption, firstPageHref, latestYear, pastYears, includeLatest, seatLists }: {
  initial: OptionRow[];
  page: number;
  pageSize: number;
  total: number;
  query: string;
  caption: string;
  firstPageHref?: string;
} & Years) {
  const L = useDecideLinks();
  const [rows, setRows] = useState(initial);
  const [next, setNext] = useState(page + 1);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [focusN, setFocusN] = useState<number | null>(null);
  const start = (page - 1) * pageSize;
  const shown = start + rows.length;

  const more = async () => {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/v1/options?${query}&page=${next}&pageSize=${pageSize}`);
      const body = (await res.json()) as { ok: boolean; data?: { rows: OptionRow[] } };
      if (!body.ok || !body.data) throw new Error("options request failed");
      setRows((r) => [...r, ...body.data!.rows]);
      setNext((n) => n + 1);
      setFocusN(shown + 1);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <p id="options-count" aria-live="polite" className="text-sm text-muted-foreground">
        Showing <span className="numeric font-semibold text-foreground">{formatRank(start + 1)}–{formatRank(shown)}</span> of <span className="numeric">{formatRank(total)}</span> options
        {firstPageHref && <> · <Link href={firstPageHref} className={`${smallLink} text-sky`}>Back to the first</Link></>}
      </p>
      <OptionsTable rows={rows} caption={caption} start={start} L={L} latestYear={latestYear} pastYears={pastYears} includeLatest={includeLatest} seatLists={seatLists} />
      {shown < total && (
        <div className="grid justify-items-center gap-2">
          {/* aria-disabled, not disabled: the button keeps focus while the next page loads. */}
          <Button variant="secondary" onClick={more} aria-disabled={status === "loading" || undefined} aria-describedby="options-count">
            {status === "loading" ? "Loading…" : `Show ${formatRank(Math.min(pageSize, total - shown))} more`}
          </Button>
          {status === "error" && <p role="alert" className="text-sm text-ember">Couldn&apos;t load more options. Check your connection and try again.</p>}
        </div>
      )}
      <FocusItem n={focusN} />
    </>
  );
}
