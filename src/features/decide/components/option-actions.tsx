"use client";

import { useState } from "react";
import { ColourLegend } from "./colour-legend";
import Link from "next/link";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, GitCompareArrows, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { choiceListTitle, MAX_COMPARE, toggleItem, type ChoiceItem } from "../lib/choices";
import type { DecideLinks } from "../lib/links";
import { quotaIn, roundIn, type Exam } from "@/features/exams/exam";
import { authorityOf, sessionExams, yearName } from "@/features/exams/keys";
import { useChoices, useCompare, useDecideLinks, useExamInfo } from "../lib/use-decide-store";
import { latestText, NEVER_ALLOTTED, reachWindow, type Latest, type Reach } from "../lib/reach";
import { statCells, statLabel, type StatKey } from "../lib/stat-format";
import { roundShort, type SeatList } from "../types";
import { Dash, HistoryNote, InstName, Provisional, ReachBadge } from "./bits";
import { AboutData } from "./filter-form";
import { FocusItem } from "./focus-item";
import { toast } from "./nav-pending";
import { Beds } from "./pages/beds";
import { cardClosing, ClosingCell, courseName, R1Line, r1Of, RoundGrid, SeatsBelowNote, SeatsCell, SeatsHead, seatKindShort, toChoiceItem, type ListRow } from "./options-view";
import { ResultCard, ResultCards } from "./result-card";
import { BeCareful, summaryKeys, summaryText, TermStatCells, TermSummary, type SummaryKey } from "./stat-cells";
import { typeCategoryLabel } from "./institute/college-type";
import { TypeBadge } from "./type-badge";
import { smallLink, tbl } from "./ui";
import { ViewPanes, ViewToggle, type View } from "./view-toggle";
import { ScrollTable } from "./scroll-table";
import { QuotaName } from "./round-name";
import { CourseKindTag, QuotaTerm, RoundTerm, Term } from "./term";

export function ChoiceStar({ item }: { item: ChoiceItem }) {
  const [state, setState] = useChoices();
  const active = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const on = !!active?.items.some((i) => i.id === item.id);
  const E = useExamInfo();
  const list = choiceListTitle(active?.name ?? "");
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-pressed={on}
      aria-label={`In your ${list}: ${item.institute}, ${item.course}, ${quotaIn(E, item.quota)}`}
      onClick={() => {
        setState((s) => toggleItem(s, item));
        toast(on ? `Removed from your ${list}` : `Added to your ${list}`);
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
  const { has } = useExamInfo();
  const link = cn(smallLink, "text-sky");
  return (
    <>
      {r.reach !== "new" && (
        <>
          <Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className={link}>Last ranks</Link>
          <Link href={L.allotments({ course: r.course.slug, inst: r.college.slug })} className={link}>Allotments</Link>
        </>
      )}
      {has.fees && <Link href={L.institute(r.college.slug, "fees")} className={link}>Fees & bond</Link>}
    </>
  );
}

const summary = "inline-flex min-h-11 cursor-pointer items-center text-sky";
// The star and the row header stay in view while the table scrolls sideways (the star column is w-12, 3rem; on phones
// both scale with the spacing). Phones: the row header is narrow (tbl.pin: the short name, the course) and carries the
// latest closing rank, so swiping to the fee or stipend keeps the star, the option and its closing rank in view.
const stick = "sticky left-0 z-[1] bg-card max-md:w-11 max-md:min-w-11 max-md:max-w-11 max-md:px-0!";
const stickName = cn("sticky left-12 z-[1] min-w-48 max-w-72 border-r border-border bg-card max-md:left-11", tbl.pin);
// Phones: the deepest closing comes right after the row header (from md, after the terms and seats, where it was).
const phoneOnly = "px-3 py-3 text-right md:hidden";
const notPhone = "px-2 py-3 text-right max-md:hidden";


/** The table row header's type badge ("Type not known" when the data has none) and beds (the cards put them in their meta line). */
function HospitalLine({ h, of }: { h: ListRow["hospital"]; of: string }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <TypeBadge type={h?.type} of={of} />
      {h?.beds && <Beds b={h.beds} inst={of} unit />}
    </span>
  );
}

type Open = { open: ReadonlySet<string>; toggle: (id: string, on: boolean) => void };
const gridCaption = (r: ListRow, E: Exam) => `${r.college.name}, ${courseName(r)}, ${quotaIn(E, r.quota)}: closing ranks by year and round`;
const rowLabel = (r: ListRow, E: Exam) => `${r.college.name}, ${courseName(r)}, ${quotaIn(E, r.quota)}`;

/** What every card on show shares (a quota, a seat category, a fee, the bond flag, a stipend): said once above them, left off each (Shared). */
type Same = Partial<Record<"quota" | "category" | SummaryKey, string>>;

/**
 * Round 1's closing this year against last year's (the latest year and the later past year, her seat categories; the
 * Rounds by year grid's cells): "2026 R1 went deeper than 2025 R1 by 1,443". Nothing when either has none.
 */
function R1Trend({ r, latest, pastYears }: { r: ListRow; latest: Latest; pastYears: [number, number] }) {
  const E = useExamInfo();
  const [now, then] = [r.grid[latest.year]?.R1, r.grid[pastYears[1]]?.R1];
  if (!now || !then || now.closing === then.closing) return null;
  const R1 = (y: number) => `${yearName(E.key, y)} ${roundIn(E, y, "R1")}`;
  return (
    <p className="text-xs text-muted-foreground">
      {R1(latest.year)} went {now.closing > then.closing ? "deeper" : "tighter"} than {R1(pastYears[1])} by <span className="numeric font-semibold text-foreground">{formatRank(Math.abs(now.closing - then.closing))}</span>
      <span className="numeric"> ({formatRank(now.closing)} vs {formatRank(then.closing)})</span>
      {now.provisional && <> <Provisional when /></>}
    </p>
  );
}

/** A never-allotted option: other colleges' closings for the same course (OptionRow.similar), as a comparison only. */
function SimilarNote({ r }: { r: ListRow }) {
  const E = useExamInfo();
  const s = r.similar;
  if (!s) return null;
  const range = s.min === s.max ? formatRank(s.max) : `${formatRank(s.min)}–${formatRank(s.max)}`;
  return (
    <p className="text-xs text-muted-foreground">
      For comparison, not a prediction: {typeCategoryLabel[s.type]} {courseName(r)}, {quotaIn(E, r.quota)}, in {s.state} closed{" "}
      <span className="numeric font-semibold text-foreground">{range}</span> in {yearName(E.key, s.year)} R1{s.last !== "R1" && ` to ${roundShort(s.last, E.key)}`} ({s.colleges} {s.colleges === 1 ? "other college" : "other colleges"}).
    </p>
  );
}

/** Under a cap: the caps that hide this option with its figure ("Show them"), or "Fee not published: kept under …". */
function CapNote({ r }: { r: ListRow }) {
  if (!r.capNote) return null;
  return <p className={cn("text-xs", r.capNote.startsWith("Hidden") ? "text-sun" : "text-muted-foreground")}>{r.capNote}.</p>;
}

const chevron = <ChevronDown className="size-4 transition-transform group-open/d:rotate-180 motion-reduce:transition-none" strokeWidth={2} aria-hidden />;

/**
 * One option as a ResultCard, answer first: the closing big (its year and round over it, Round 1's under a later
 * round's) with her label and the round that first reached her rank; institute, course, state • type • beds; one line
 * of the terms (fee, the bond flag, stipend: TermSummary), last year's Round 1 against this year's, the round's seats.
 * Details (`details`: open on every card) holds the past years' deepest closings, the five term cells with their words
 * and sources, and Rounds by year. `same`: what every card shares, left off this one (the list says it once).
 */
function OptionCard({ r, L, n, latest, pastYears, includeLatest, seatLists, open, toggle, details, same }: { r: ListRow; L: DecideLinks; n: number; details: boolean; same: Same } & Years & Open) {
  const E = useExamInfo();
  const c = cardClosing(r, latest.year, pastYears, includeLatest);
  const [older, last] = pastYears;
  const list = seatLists[0];
  const strip = !!(r.byYear[last] || r.byYear[older]);
  const mcc = r.hospital?.mccProfileUrl;
  return (
    <div data-item={n} tabIndex={-1} className="grid min-w-0 rounded-xl">
      <ResultCard
        chips={[
          // The closing's year and round are over the big number; a new option's chip names the round's seats.
          !c && list && `${yearName(E.key, list.year)} ${roundIn(E, list.year, list.round)} seats`,
          !same.quota && <QuotaTerm key="quota" quota={r.quota} shown={quotaIn(E, r.quota)} />,
          c && !same.category && `${c.d.category} seat`,
          c?.d.provisional && <Provisional when />,
        ]}
        actions={<><ChoiceStar item={toChoiceItem(r, latest)} /><CompareToggle id={r.id} label={rowLabel(r, E)} /></>}
        stat={{
          // The big number's year and round, so it never reads against the label under it (which counts other rounds).
          label: c ? <>{yearName(E.key, c.year)} <RoundTerm shown={roundIn(E, c.year, c.d.round)} /> <Term k="closing">closing</Term></> : <Term k="closing">Closing rank</Term>,
          value: (
            <>
              <span className="numeric">{c ? formatRank(c.d.closing) : <Dash />}</span>
              {/* A deepest closing from a later round: Round 1's own beside it. */}
              {c && c.d.round !== "R1" && <span className="block leading-normal tracking-normal"><R1Line r1={r1Of(r, c.year)} /></span>}
              <span className="mt-1 block max-w-28 text-xs leading-normal font-normal tracking-normal">
                <ReachBadge reach={r.reach} provisional={r.reachProvisional} latest={latest} includeLatest={includeLatest} from={r.reachFrom} seats={r} />
              </span>
            </>
          ),
        }}
        title={r.college.name}
        href={L.institute(r.college.slug)}
        external={mcc ? { href: mcc, label: `MCC profile: ${r.college.name}` } : undefined}
        subtitle={<>{courseName(r)} <CourseKindTag specialty={r.course.specialty} /></>}
        meta={[r.college.state ?? "State not listed", <TypeBadge key="type" type={r.hospital?.type} of={r.college.name} />, r.hospital?.beds && <Beds b={r.hospital.beds} inst={r.college.name} unit />]}
        footer={
          <>
            <div className="grid gap-1 px-4 py-2 empty:hidden">
              {E.has.fees && <TermSummary t={r.fees} hide={same} />}
              {E.has.fees && <BeCareful cells={statCells(r.fees)} />}
              <R1Trend r={r} latest={latest} pastYears={pastYears} />
              <SimilarNote r={r} />
              <CapNote r={r} />
            </div>
            {list && (
              <p className="flex flex-wrap items-center gap-x-3 border-t border-border px-4 text-xs">
                <span className="text-muted-foreground">{roundIn(E, list.year, list.round)} seats</span>
                {seatLists.map((l) => (
                  <span key={l.key} className="inline-flex items-center gap-1">
                    <span className="text-muted-foreground">{seatKindShort(l.kind, E.key) === "seat position" ? "seat position" : <Term k={l.kind === "new" ? "newly-added" : l.kind}>{seatKindShort(l.kind, E.key)}</Term>}</span>
                    <SeatsCell r={r} list={l} L={L} n={r.seatsBy?.[l.kind]} end={false} />
                  </span>
                ))}
              </p>
            )}
            {r.seatsBelow?.length ? <div className="px-4 pb-2"><SeatsBelowNote r={r} latest={latest} includeLatest={includeLatest} /></div> : null}
            <div className="flex flex-wrap items-center gap-x-4 border-t border-border px-4 text-xs">
              {/* Native disclosure: the summary is its button (Enter / Space), its state read out. Closed, its content
                  stays in the page (found by find-in-page) but Rounds by year, rendered only once that is opened. */}
              <details open={details || undefined} className="group/d min-w-0 max-w-full open:basis-full">
                <summary className={cn(summary, "gap-1 font-semibold")}>Details{chevron}</summary>
                <div className="-mx-4 border-t border-border">
                  {/* The past years' deepest closings, as the table's columns (the big number is the newest); none at all: left out. */}
                  {strip && (
                    <dl className="grid grid-cols-2 gap-x-4 px-4 py-2 text-sm">
                      {[last, older].map((y) => (
                        <div key={y}><dt className="text-xs text-muted-foreground">{yearName(E.key, y)} deepest</dt><dd><ClosingCell d={r.byYear[y]} year={y} /></dd></div>
                      ))}
                    </dl>
                  )}
                  <TermStatCells t={r.fees} of={rowLabel(r, E)} className={strip ? undefined : "border-t-0"} />
                  <details open={open.has(r.id)} onToggle={(e) => toggle(r.id, e.currentTarget.open)} className="border-t border-border px-4">
                    <summary className={summary}>Rounds by year</summary>
                    {open.has(r.id) && <div className="pb-2"><RoundGrid row={r} caption={gridCaption(r, E)} /></div>}
                  </details>
                </div>
              </details>
              <Related r={r} L={L} />
            </div>
          </>
        }
      />
    </div>
  );
}

/** Above the cards: what every one of them shares (Same), said once. */
function Shared({ same }: { same: Same }) {
  const E = useExamInfo();
  // The cost parts name themselves ("3-year fee ₹1.26 L", "no bond"): no label of their own.
  const items: [keyof Same, string][] = [["quota", "Quota"], ["category", "Seat category"], ["fee", ""], ["stipend", ""], ["bond", ""], ["leaving", ""]];
  const shown = items.filter(([k]) => same[k] && (E.has.fees || !(summaryKeys as string[]).includes(k)));
  if (!shown.length) return null;
  return (
    <div className="mb-3 grid gap-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">Same on every option below (the words and sources: each card&apos;s Details)</p>
      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        {shown.map(([k, label]) => (
          <div key={k} className="flex items-baseline gap-1.5">
            <dt className={label ? "text-xs text-muted-foreground" : "sr-only"}>{label || k}</dt>
            <dd className="font-semibold">{same[k]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Each of Same's items that every row gives alike (two rows or more; rows without one, e.g. no closing, don't count). */
function sameOf(rows: ListRow[], E: Exam, latest: Latest, pastYears: [number, number], includeLatest: boolean): Same {
  if (rows.length < 2) return {};
  const texts = rows.map((r) => {
    const c = cardClosing(r, latest.year, pastYears, includeLatest);
    return { quota: quotaIn(E, r.quota), category: c ? `${c.d.category}` : undefined, ...summaryText(r.fees) };
  });
  const one = (k: keyof Same) => {
    const xs = texts.map((t) => t[k]).filter((x): x is string => x != null);
    return xs.length >= 2 && xs.every((x) => x === xs[0]) ? xs[0] : undefined;
  };
  return Object.fromEntries((["quota", "category", ...summaryKeys] as const).flatMap((k) => (one(k) ? [[k, one(k)]] : []))) as Same;
}

/**
 * Options as cards or as a table (ViewPanes `view`). A row's
 * "Rounds by year" grid is rendered only once she opens it (it is most of a row's markup). `start` = rows before these,
 * for data-item numbering (focus after Show more: FocusItem picks the visible pane's).
 */
/**
 * Options' groups that never read as seats she can get: no allotment on her seat categories (nothing to compare her
 * rank with), closed before her rank, and never allotted before (no closing of its own; the round view lists it last).
 * In the label order (Options' default sort) each is one run of rows, headed by its title and count; `counts`: per
 * label, as the reach chips.
 */
type Grouping = { counts: Record<Reach, number> } | null;
const grouped = ["no-data", "closed-before", "new"] as const satisfies Reach[];
const groupOf = (r: ListRow) => (grouped as readonly Reach[]).includes(r.reach) ? (r.reach as (typeof grouped)[number]) : null;
function groupWords(g: (typeof grouped)[number], { latest, pastYears, includeLatest }: Years) {
  if (g === "new") return { title: NEVER_ALLOTTED, note: `${authorityOf(latest.exam)} allotted nobody to these in any result Seatora has, so there is no closing rank of their own. Where Seatora has them, each shows what the same course closed at similar colleges (same type and state), for comparison, not a prediction.` };
  return g === "no-data"
    ? { title: "No allotment in your seat categories", note: `${authorityOf(latest.exam)} allotted none of your seat categories on these in ${reachWindow(latest, pastYears, includeLatest, true)}, so there is no closing rank to compare with yours. Not a sign of a seat you can take.` }
    : { title: "Closed before your rank", note: `The closing rank came before yours in every round of ${reachWindow(latest, pastYears, includeLatest)}.` };
}
/** Each row's group heading where a group's run starts (the page's first row too), else null. */
const groupStarts = (rows: ListRow[], grouping: Grouping) => rows.map((r, i) => (grouping && groupOf(r) && (i === 0 || groupOf(rows[i - 1]) !== groupOf(r)) ? groupOf(r) : null));

/** The table's term columns, in the cards' summary order: Fee, the bond three, Stipend. */
const tableKeys: StatKey[] = ["fee", "bond", "bondInr", "leaving", "stipend"];

function OptionsList({ rows, caption, start, L, view, latest, pastYears, includeLatest, seatLists, grouping, details }: { rows: ListRow[]; caption: string; start: number; L: DecideLinks; view: View; grouping: Grouping; details: boolean } & Years) {
  const E = useExamInfo();
  const heads = groupStarts(rows, grouping);
  const head = (g: (typeof grouped)[number]) => {
    const w = groupWords(g, { latest, pastYears, includeLatest, seatLists });
    return { ...w, n: grouping!.counts[g] };
  };
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
  const sessionCols = sessionExams.includes(E.key);
  // Rounds by year (it opens the grid in the full-width row below, so the row stays narrow) and the cross-links.
  const rowTools = (r: ListRow) => (
    <>
      <details open={open.has(r.id)} onToggle={(e) => toggle(r.id, e.currentTarget.open)}>
        <summary className={summary}>Rounds by year</summary>
      </details>
      <Related r={r} L={L} />
    </>
  );
  const table = (
    <ScrollTable label={caption} scrollClassName="scroll-pl-72 max-md:scroll-pl-[8.5rem]">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className={tbl.head}>
          {/* The latest closing beside the option (from md; a phone has it in the row header), then Reach and Fee…Leaving (tight
              px-2 cells), so all are in view from 1280px wide; the seat lists and the past years' closings follow. */}
          <tr className="text-left text-xs font-semibold text-muted-foreground">
            <th scope="col" className={cn(stick, "w-12 px-2 py-3 print:hidden")}><span className="sr-only">Add to your Choice list or compare</span></th>
            <th scope="col" className={cn(stickName, "px-3 py-3")}>Institute and course{!sessionCols && <span className="md:hidden">, {latestText(latest)} closing</span>}</th>
            {/* An exam with sessions (INI-CET): on a phone too the newest session's closing is the first column, the one
                before it next (newest first), not the older one beside a closing in the row header. */}
            {!sessionCols && <th scope="col" className={phoneOnly}>{yearName(E.key, last)} deepest</th>}
            <th scope="col" className={sessionCols ? "px-3 py-3 text-right" : notPhone}>{latestText(latest)} closing</th>
            {sessionCols && <th scope="col" className={phoneOnly}>{yearName(E.key, last)} deepest</th>}
            <th scope="col" className="px-2 py-3"><Term k="reach">Reach</Term></th>
            {tableKeys.map((k) => <th key={k} scope="col" data-col={k} className="px-2 py-3 text-right">{statLabel[k]}</th>)}
            {seatLists.map((l) => <th key={l.key} scope="col" className="px-1.5 py-3 text-right"><SeatsHead list={l} short /></th>)}
            <th scope="col" className={notPhone}>{yearName(E.key, last)} deepest</th>
            <th scope="col" className="hidden px-3 py-3 text-right 2xl:table-cell">{yearName(E.key, older)} deepest</th>
            {/* Controls, not data: not on paper. From md they sit under the option's name (the table fits 1440px). */}
            <th scope="col" className="px-3 py-3 md:hidden print:hidden">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((r, i) => [
            heads[i] && (
              <tr key={`${r.id}-group`} className="border-t border-border bg-muted/40">
                <th scope="colgroup" colSpan={8 + tableKeys.length + seatLists.length} className="px-3 py-2 text-left font-normal">
                  {/* Sticky: the heading stays in view while the row scrolls sideways. */}
                  <span className="sticky left-3 block max-w-[min(42rem,calc(100vw-3rem))]">
                    <span className="font-semibold">{head(heads[i]).title}</span> <span className="numeric text-muted-foreground">({formatRank(head(heads[i]).n)})</span>
                    <span className="block text-xs text-muted-foreground">{head(heads[i]).note}</span>
                  </span>
                </th>
              </tr>
            ),
            <tr key={r.id} data-item={start + i + 1} tabIndex={-1} className="border-t border-border align-top hover:bg-muted/40">
              {/* Star and compare stacked in the pinned column: both stay in view while the row scrolls sideways. */}
              <td className={cn(stick, "px-2 py-2 print:hidden")}><span className="grid justify-items-center"><ChoiceStar item={toChoiceItem(r, latest)} /><CompareToggle id={r.id} label={rowLabel(r, E)} /></span></td>
              {/* Row header: only what names the option, so it reads short for every cell. */}
              <th scope="row" className={cn(stickName, "px-3 py-3 text-left font-normal")}>
                <Link href={L.institute(r.college.slug)} title={r.college.name} className="font-semibold hover:text-sky hover:underline"><InstName name={r.college.name} state={r.college.state} /></Link>
                <span className={cn("block max-md:text-xs", tbl.clamp)}>{courseName(r)} <CourseKindTag specialty={r.course.specialty} /><span className="text-muted-foreground">, <QuotaName quota={r.quota} /><span className="max-md:hidden">, {r.college.state ?? "state not listed"}</span></span></span>
                <span className="block max-md:hidden"><HospitalLine h={r.hospital} of={r.college.name} /></span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs max-md:hidden print:hidden">{rowTools(r)}</span>
                <span className={cn("mt-1 block text-xs text-muted-foreground md:hidden", sessionCols && "hidden")}>
                  {/* The closing's own round (the deepest of the year's rounds), and R1's when it is a later round's. */}
                  {r.latest ? `${yearName(E.key, latest.year)} ${roundIn(E, latest.year, r.latest.round)}` : latestText(latest)} <span className="numeric text-sm font-semibold text-foreground">{r.latest ? formatRank(r.latest.closing) : "—"}</span>
                  {r.latest && r.latest.round !== "R1" && <R1Line r1={r1Of(r, latest.year)} />}
                  {r.latest?.provisional && <span className="mt-0.5 block"><Provisional when /></span>}
                </span>
              </th>
              {!sessionCols && <td className={phoneOnly}><ClosingCell d={r.byYear[last]} year={last} /></td>}
              <td className={sessionCols ? "px-3 py-3 text-right" : notPhone}><ClosingCell d={r.latest} year={latest.year} r1={r1Of(r, latest.year)} /></td>
              {sessionCols && <td className={phoneOnly}><ClosingCell d={r.byYear[last]} year={last} /></td>}
              <td className="px-2 py-3">
                <ReachBadge reach={r.reach} provisional={r.reachProvisional} latest={latest} includeLatest={includeLatest} from={r.reachFrom} seats={r} />
                <SeatsBelowNote r={r} latest={latest} includeLatest={includeLatest} />
                {E.has.fees && <BeCareful cells={statCells(r.fees)} className="mt-1 max-w-xs" />}
                {r.similar && <span className="mt-1 block max-w-xs"><SimilarNote r={r} /></span>}
                {r.capNote && <span className="mt-1 block max-w-xs"><CapNote r={r} /></span>}
              </td>
              {/* The cards' short values (read out in full), so the summary columns fit beside the seats at 1440px. */}
              <TermStatCells t={r.fees} variant="table" short wrap of={rowLabel(r, E)} tdClassName="px-2! max-w-28" keys={tableKeys} />
              {seatLists.map((l) => <td key={l.key} className="px-1.5 py-1 text-right"><SeatsCell r={r} list={l} L={L} n={r.seatsBy?.[l.kind]} /></td>)}
              <td className={notPhone}><ClosingCell d={r.byYear[last]} year={last} /></td>
              <td className="hidden px-3 py-3 text-right 2xl:table-cell"><ClosingCell d={r.byYear[older]} year={older} /></td>
              <td className="px-3 py-1 text-xs md:hidden print:hidden">
                <span className="flex min-w-[10rem] flex-wrap items-center gap-x-4">{rowTools(r)}</span>
              </td>
            </tr>,
            open.has(r.id) && (
              <tr key={`${r.id}-rounds`} className="bg-muted/30">
                <td />
                <td colSpan={7 + tableKeys.length + seatLists.length} className="px-3 pb-4"><RoundGrid row={r} caption={gridCaption(r, E)} /></td>
              </tr>
            ),
          ])}
        </tbody>
      </table>
    </ScrollTable>
  );
  // A group's run is its own titled list (a heading over its cards); the rows before the first group, the page's list.
  const runs = rows.reduce<{ g: (typeof grouped)[number] | null; at: number; rows: ListRow[] }[]>((xs, r, i) => {
    if (heads[i] || !xs.length) xs.push({ g: heads[i], at: i, rows: [] });
    xs.at(-1)!.rows.push(r);
    return xs;
  }, []);
  // Cards only (the table has a column for each): what every card shares, said once above them.
  const same = view === "cards" ? sameOf(rows, E, latest, pastYears, includeLatest) : {};
  const cards = [<Shared key="same" same={same} />, ...runs.map((run) => (
    <ResultCards
      key={run.at}
      title={run.g ? head(run.g).title : caption}
      count={run.g && formatRank(head(run.g).n)}
      note={run.g && head(run.g).note}
      hideTitle={!run.g}
      className={run.g ? "mt-2" : undefined}
    >
      {run.rows.map((r, i) => <OptionCard key={r.id} r={r} L={L} n={start + run.at + i + 1} {...years} open={open} toggle={toggle} details={details} same={same} />)}
    </ResultCards>
  ))];
  return <ViewPanes page="options" view={view} cards={cards} table={table} />;
}

/**
 * One server-rendered page of options; "Show more" appends the next page from /api/v1/options (`query` = the same
 * profile and filters) and moves focus to the first new row. The page never holds more rows than she asked to see.
 * `tools`: after the Cards | Table toggle beside the count (the CSV download). `historyMore`: what the closing
 * ranks count, behind the history note's (i).
 */
export function OptionsResults({ initial, page, pageSize, total, query, caption, firstPageHref, moreHref, tools, notes, historyMore, view, latest, pastYears, includeLatest, seatLists, grouping = null, details = false, detailsHref }: {
  initial: ListRow[];
  page: number;
  pageSize: number;
  total: number;
  query: string;
  caption: string;
  firstPageHref?: string;
  /** The next page as a link instead of "Show more" (another exam than NEET PG: /api/v1 serves NEET PG only). */
  moreHref?: string;
  tools?: React.ReactNode;
  /** Beside the history note: the seat lists' "as printed" and a later MCC notice chip (SeatSource). */
  notes?: React.ReactNode;
  historyMore?: React.ReactNode;
  /** Cards or table on show (chosenView "options"). */
  view: View;
  /** The label order (Options' default sort): the no-allotment and closed-before groups headed (Grouping). */
  grouping?: Grouping;
  /** Every card's Details open (the address's `details=1`), and the link that flips it (cards only). */
  details?: boolean;
  detailsHref?: string;
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
        <div className="flex min-w-0 flex-wrap items-center gap-2 max-md:basis-full">
          {/* A link: the address keeps the choice (Back, a shared link) and it works without JS. */}
          {view === "cards" && detailsHref && (
            <Link href={detailsHref} scroll={false} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted">
              {details ? <ChevronsDownUp className="size-4" strokeWidth={1.75} aria-hidden /> : <ChevronsUpDown className="size-4" strokeWidth={1.75} aria-hidden />}
              {details ? "Hide details on every card" : "Show details on every card"}
            </Link>
          )}
          <ViewToggle page="options" view={view} />
          {tools}
        </div>
      </div>
      <OptionsList rows={rows} caption={caption} start={start} L={L} view={view} latest={latest} pastYears={pastYears} includeLatest={includeLatest} seatLists={seatLists} grouping={grouping} details={details} />
      {shown < total && moreHref && (
        <div className="grid justify-items-center">
          <Button asChild variant="secondary"><Link href={moreHref}>Next {formatRank(Math.min(pageSize, total - shown))}</Link></Button>
        </div>
      )}
      {shown < total && !moreHref && (
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
