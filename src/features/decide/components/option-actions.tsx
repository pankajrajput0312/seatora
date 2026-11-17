"use client";

import { useState } from "react";
import { ColourLegend } from "./colour-legend";
import Link from "next/link";
import { GitCompareArrows, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { MAX_COMPARE, toggleItem, type ChoiceItem } from "../lib/choices";
import type { DecideLinks } from "../lib/links";
import { useChoices, useCompare, useDecideLinks } from "../lib/use-decide-store";
import { latestText, type Latest } from "../lib/reach";
import { statKeys, statLabel } from "../lib/stat-format";
import { roundLabel, type SeatList } from "../types";
import { Dash, HistoryNote, InstName, Provisional, ReachBadge } from "./bits";
import { AboutData } from "./filter-form";
import { FocusItem } from "./focus-item";
import { toast } from "./nav-pending";
import { Beds } from "./pages/beds";
import { cardClosing, ClosingCell, courseName, RoundGrid, SeatsBelowNote, SeatsCell, SeatsHead, seatKindShort, toChoiceItem, type ListRow } from "./options-view";
import { ResultCard, ResultCards } from "./result-card";
import { TermStatCells } from "./stat-cells";
import { TypeBadge } from "./type-badge";
import { smallLink, tbl } from "./ui";
import { ViewPanes, ViewToggle, type View } from "./view-toggle";
import { ScrollTable } from "./scroll-table";

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
      onClick={() => {
        setState((s) => toggleItem(s, item));
        toast(on ? `Removed from ${active?.name ?? "choices"}` : `Added to ${active?.name ?? "choices"}`);
      }}
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
      aria-disabled={full || undefined}
      aria-label={full ? `Compare is full (${MAX_COMPARE}): ${label}` : on ? `Remove from compare: ${label}` : `Add to compare: ${label}`}
      onClick={() => !full && setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]))}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      <GitCompareArrows className={cn("size-5", on && "text-sky")} strokeWidth={1.75} aria-hidden />
    </Button>
  );
}

// ---------- Options list ----------

/**
 * `latest`: lib/reach.ts latestRound; `includeLatest` false: labels made without it. `seatLists`: the round's lists
 * behind each row's `seatsBy` (clear, virtual, new), one column each, never added (none: no columns).
 */
type Years = { latest: Latest; pastYears: [number, number]; includeLatest: boolean; seatLists: SeatList[] };

/** Cross-links for one option, each a 44px target (a new option has no closing ranks or allotments to link). */
function Related({ r, L }: { r: ListRow; L: DecideLinks }) {
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
// The star and the row header stay in view while the table scrolls sideways (the star column is w-12, 3rem; on phones
// both scale with the spacing). Phones: the row header is narrow (tbl.pin: the short name, the course) and carries the
// latest closing rank, so swiping to the fee or stipend keeps the star, the option and its closing rank in view.
const stick = "sticky left-0 z-[1] bg-card max-md:w-11 max-md:min-w-11 max-md:max-w-11 max-md:px-0!";
const stickName = cn("sticky left-12 z-[1] min-w-52 max-w-72 border-r border-border bg-card max-md:left-11", tbl.pin);
// Phones: the deepest closing comes right after the row header (from md, after the terms and seats, where it was).
const phoneOnly = "px-3 py-3 text-right md:hidden";
const notPhone = "px-3 py-3 text-right max-md:hidden";


/** The table row header's type badge and beds (the cards put them in their meta line); nothing when the import has neither. */
function HospitalLine({ h, of }: { h: ListRow["hospital"]; of: string }) {
  if (!h?.type && !h?.beds) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      {h.type && <TypeBadge type={h.type} of={of} />}
      {h.beds && <Beds b={h.beds} inst={of} unit />}
    </span>
  );
}

type Open = { open: ReadonlySet<string>; toggle: (id: string, on: boolean) => void };
const gridCaption = (r: ListRow) => `${r.college.name}, ${courseName(r)}, ${r.quota}: closing ranks by year and round`;
const rowLabel = (r: ListRow) => `${r.college.name}, ${courseName(r)}, ${r.quota}`;

/**
 * One option as a ResultCard: the closing's year · round, quota and seat category on top (a new option: the round's
 * seats); the closing rank big with her label under it; institute, course, state • type • beds; the past two years'
 * deepest closings; the round's seats per list; the term stat cells; Rounds by year and the cross-links.
 */
function OptionCard({ r, L, n, latest, pastYears, includeLatest, seatLists, open, toggle }: { r: ListRow; L: DecideLinks; n: number } & Years & Open) {
  const c = cardClosing(r, latest.year, pastYears, includeLatest);
  const [older, last] = pastYears;
  const list = seatLists[0];
  const strip = !!(r.byYear[last] || r.byYear[older]);
  const mcc = r.hospital?.mccProfileUrl;
  return (
    <div data-item={n} tabIndex={-1} className="grid min-w-0 rounded-xl">
      <ResultCard
        chips={[
          c ? `${c.year} · ${roundLabel[c.d.round]}` : list && `${list.year} ${roundLabel[list.round]} seats`,
          r.quota,
          c && `${c.d.category} seat`,
          c?.d.provisional && <Provisional when />,
        ]}
        actions={<><ChoiceStar item={toChoiceItem(r, latest)} /><CompareToggle id={r.id} label={rowLabel(r)} /></>}
        stat={{
          // The big number's year and round, so it never reads against the label under it (which counts other rounds).
          label: c ? `${c.year} ${roundLabel[c.d.round]} closing` : "Closing rank",
          value: (
            <>
              <span className="numeric">{c ? formatRank(c.d.closing) : <Dash />}</span>
              <span className="mt-1 block max-w-28 text-xs leading-normal font-normal tracking-normal">
                <ReachBadge reach={r.reach} provisional={r.reachProvisional} latest={latest} includeLatest={includeLatest} />
              </span>
            </>
          ),
        }}
        title={r.college.name}
        href={L.institute(r.college.slug)}
        external={mcc ? { href: mcc, label: `MCC profile: ${r.college.name}` } : undefined}
        subtitle={courseName(r)}
        meta={[r.college.state ?? "State not listed", r.hospital?.type && <TypeBadge type={r.hospital.type} of={r.college.name} />, r.hospital?.beds && <Beds b={r.hospital.beds} inst={r.college.name} unit />]}
        footer={
          <>
            {/* The past years' deepest closings, as the table's columns (the big number is the newest); none at all: left out. */}
            {strip && (
              <dl className="grid grid-cols-2 gap-x-4 px-4 py-2 text-sm">
                {[last, older].map((y) => (
                  <div key={y}><dt className="text-xs text-muted-foreground">{y} deepest</dt><dd><ClosingCell d={r.byYear[y]} /></dd></div>
                ))}
              </dl>
            )}
            {list && (
              <p className={cn("flex flex-wrap items-center gap-x-3 px-4 text-xs", strip && "border-t border-border")}>
                <span className="text-muted-foreground">{roundLabel[list.round]} seats</span>
                {seatLists.map((l) => (
                  <span key={l.key} className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground">{seatKindShort(l.kind)}</span>
                    <SeatsCell r={r} list={l} L={L} n={r.seatsBy?.[l.kind]} end={false} />
                  </span>
                ))}
              </p>
            )}
            {r.seatsBelow?.length ? <div className="px-4 pb-2"><SeatsBelowNote r={r} latest={latest} includeLatest={includeLatest} /></div> : null}
            {/* Nothing above the cells: they sit on the footer's own rule (one line, not two). */}
            <TermStatCells t={r.fees} of={rowLabel(r)} className={strip || list || r.seatsBelow?.length ? undefined : "-mt-px"} />
            <div className="flex flex-wrap items-center gap-x-4 border-t border-border px-4 text-xs">
              <details open={open.has(r.id)} onToggle={(e) => toggle(r.id, e.currentTarget.open)} className="min-w-0 max-w-full open:basis-full">
                <summary className={summary}>Rounds by year</summary>
                {open.has(r.id) && <div className="pb-2"><RoundGrid row={r} caption={gridCaption(r)} /></div>}
              </details>
              <Related r={r} L={L} />
            </div>
          </>
        }
      />
    </div>
  );
}

/**
 * Options as cards or as a table (ViewPanes `view`). A row's
 * "Rounds by year" grid is rendered only once she opens it (it is most of a row's markup). `start` = rows before these,
 * for data-item numbering (focus after Show more: FocusItem picks the visible pane's).
 */
function OptionsList({ rows, caption, start, L, view, latest, pastYears, includeLatest, seatLists }: { rows: ListRow[]; caption: string; start: number; L: DecideLinks; view: View } & Years) {
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
  const years = { latest, pastYears, includeLatest, seatLists };
  const table = (
    <ScrollTable label={caption} scrollClassName="scroll-pl-72 max-md:scroll-pl-[8.5rem]">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className={tbl.head}>
          {/* Fee…Leaving sit right after Reach (tight px-2 cells), so they are in view from 1280px wide; the seat lists and closings follow. */}
          <tr className="text-left text-xs font-semibold text-muted-foreground">
            <th scope="col" className={cn(stick, "w-12 px-2 py-3 print:hidden")}><span className="sr-only">Add to choices</span></th>
            <th scope="col" className={cn(stickName, "px-3 py-3")}>Institute and course<span className="md:hidden">, {latestText(latest)} closing</span></th>
            <th scope="col" className={phoneOnly}>{last} deepest</th>
            <th scope="col" className="px-3 py-3">Reach</th>
            {statKeys.map((k) => <th key={k} scope="col" data-col={k} className="px-2 py-3 text-right">{statLabel[k]}</th>)}
            {seatLists.map((l) => <th key={l.key} scope="col" className="px-1.5 py-3 text-right"><SeatsHead list={l} short /></th>)}
            <th scope="col" className={notPhone}>{latestText(latest)} closing</th>
            <th scope="col" className={notPhone}>{last} deepest</th>
            <th scope="col" className="hidden px-3 py-3 text-right xl:table-cell">{older} deepest</th>
            {/* Controls, not data: not on paper. */}
            <th scope="col" className="px-3 py-3 print:hidden">Details</th>
            <th scope="col" className="w-12 px-2 py-3 print:hidden"><span className="sr-only">Compare</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((r, i) => [
            <tr key={r.id} data-item={start + i + 1} tabIndex={-1} className="border-t border-border align-top hover:bg-muted/40">
              <td className={cn(stick, "px-2 py-2 print:hidden")}><ChoiceStar item={toChoiceItem(r, latest)} /></td>
              {/* Row header: only what names the option, so it reads short for every cell. */}
              <th scope="row" className={cn(stickName, "px-3 py-3 text-left font-normal")}>
                <Link href={L.institute(r.college.slug)} title={r.college.name} className="font-semibold hover:text-sky hover:underline"><InstName name={r.college.name} state={r.college.state} /></Link>
                <span className={cn("block max-md:text-xs", tbl.clamp)}>{courseName(r)}<span className="text-muted-foreground">, {r.quota}<span className="max-md:hidden">, {r.college.state ?? "state not listed"}</span></span></span>
                <span className="block max-md:hidden"><HospitalLine h={r.hospital} of={r.college.name} /></span>
                <span className="mt-1 block text-xs text-muted-foreground md:hidden">
                  {latestText(latest)} <span className="numeric text-sm font-semibold text-foreground">{r.latest ? formatRank(r.latest.closing) : "—"}</span>
                  {r.latest?.provisional && <span className="mt-0.5 block"><Provisional when /></span>}
                </span>
              </th>
              <td className={phoneOnly}><ClosingCell d={r.byYear[last]} /></td>
              <td className="px-3 py-3"><ReachBadge reach={r.reach} provisional={r.reachProvisional} latest={latest} includeLatest={includeLatest} /><SeatsBelowNote r={r} latest={latest} includeLatest={includeLatest} /></td>
              <TermStatCells t={r.fees} variant="table" of={rowLabel(r)} tdClassName="px-2!" />
              {seatLists.map((l) => <td key={l.key} className="px-1.5 py-1 text-right"><SeatsCell r={r} list={l} L={L} n={r.seatsBy?.[l.kind]} /></td>)}
              <td className={notPhone}><ClosingCell d={r.latest} /></td>
              <td className={notPhone}><ClosingCell d={r.byYear[last]} /></td>
              <td className="hidden px-3 py-3 text-right xl:table-cell"><ClosingCell d={r.byYear[older]} /></td>
              <td className="px-3 py-1 text-xs print:hidden">
                <span className="flex min-w-[10rem] flex-wrap items-center gap-x-4">
                  {/* Opens the grid in the full-width row below, so this row stays narrow. */}
                  <details open={open.has(r.id)} onToggle={(e) => toggle(r.id, e.currentTarget.open)}>
                    <summary className={summary}>Rounds by year</summary>
                  </details>
                  <Related r={r} L={L} />
                </span>
              </td>
              <td className="px-2 py-2 print:hidden"><CompareToggle id={r.id} label={rowLabel(r)} /></td>
            </tr>,
            open.has(r.id) && (
              <tr key={`${r.id}-rounds`} className="bg-muted/30">
                <td />
                <td colSpan={8 + statKeys.length + seatLists.length} className="px-3 pb-4"><RoundGrid row={r} caption={gridCaption(r)} /></td>
              </tr>
            ),
          ])}
        </tbody>
      </table>
    </ScrollTable>
  );
  const cards = (
    <ResultCards title={caption} hideTitle>
      {rows.map((r, i) => <OptionCard key={r.id} r={r} L={L} n={start + i + 1} {...years} open={open} toggle={toggle} />)}
    </ResultCards>
  );
  return <ViewPanes page="options" view={view} cards={cards} table={table} />;
}

/**
 * One server-rendered page of options; "Show more" appends the next page from /api/v1/options (`query` = the same
 * profile and filters) and moves focus to the first new row. The page never holds more rows than she asked to see.
 * `tools`: after the Cards | Table toggle beside the count (the CSV download). `historyMore`: what the closing
 * ranks count, behind the history note's (i).
 */
export function OptionsResults({ initial, page, pageSize, total, query, caption, firstPageHref, tools, notes, historyMore, view, latest, pastYears, includeLatest, seatLists }: {
  initial: ListRow[];
  page: number;
  pageSize: number;
  total: number;
  query: string;
  caption: string;
  firstPageHref?: string;
  tools?: React.ReactNode;
  /** Beside the history note: the seat lists' "as printed" and a later MCC notice chip (SeatSource). */
  notes?: React.ReactNode;
  historyMore?: React.ReactNode;
  /** Cards or table on show (chosenView "options"). */
  view: View;
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
      const body = (await res.json()) as { ok: boolean; data?: { rows: ListRow[] } };
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
      {/* csv-link.tsx toolbarRow (that module is server-only). Phones: "About this data" (the count line and notes) and the tools on one row. */}
      <div className="flex flex-wrap items-center justify-between gap-2 md:gap-x-4">
        <AboutData className="flex flex-wrap items-center gap-x-3 gap-y-1 md:flex-1">
          <p id="options-count" aria-live="polite" className="text-sm text-muted-foreground">
            Showing <span className="numeric font-semibold text-foreground">{formatRank(start + 1)}–{formatRank(shown)}</span> of <span className="numeric">{formatRank(total)}</span> options
            {firstPageHref && <> · <Link href={firstPageHref} className={`${smallLink} text-sky`}>Back to the first</Link></>}
           <ColourLegend className="ml-1 align-middle" /></p>
          <HistoryNote more={historyMore} />
          {notes}
        </AboutData>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ViewToggle page="options" view={view} />
          {tools}
        </div>
      </div>
      <OptionsList rows={rows} caption={caption} start={start} L={L} view={view} latest={latest} pastYears={pastYears} includeLatest={includeLatest} seatLists={seatLists} />
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
