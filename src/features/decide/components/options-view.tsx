import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { formatInrShort } from "../lib/format";
import type { DecideLinks } from "../lib/links";
import { LATER_ROUNDS_NOTE, pastOf, reachLabel, seatsBelowNotes, type Deepest, type Latest } from "../lib/reach";
import type { ChoiceItem } from "../lib/choices";
import type { OptionRow } from "../service";
import { roundLabel, rounds, seatKindLabel, type Round, type SeatList, type Term } from "../types";
import { Closing, Dash, Provisional, TermText } from "./bits";
import { smallLink } from "./ui";

// Server-safe on purpose (no "use client"): the institute and compare pages render these on the server, and the
// Options list (option-actions.tsx, a client component) renders them in the browser.

export const courseName = (r: Pick<OptionRow, "course">) => `${r.course.degree} ${r.course.name}`;

/** What the Options list (a client component) reads of a row: everything but the published terms and their flat texts, about half a row's bytes (the line shows `fees`). */
const notListed = ["terms", "feeText", "stipendText", "bondText", "penaltyText", "allotmentsByYear", "reachAt"] as const;
export type ListRow = Omit<OptionRow, (typeof notListed)[number]>;
export const listRow = (r: OptionRow) => Object.fromEntries(Object.entries(r).filter(([k]) => !(notListed as readonly string[]).includes(k))) as ListRow;

/** The closing a card shows big: the newest with data (the latest year's while the labels count it, else the later past year's deepest, then the older's, then a latest year's the labels leave out); null when none. */
export function cardClosing(r: Pick<OptionRow, "latest" | "byYear">, latestYear: number, [older, last]: [number, number], includeLatest: boolean): { d: Deepest; year: number } | null {
  if (includeLatest && r.latest) return { d: r.latest, year: latestYear };
  for (const year of [last, older]) if (r.byYear[year]) return { d: r.byYear[year]!, year };
  return r.latest ? { d: r.latest, year: latestYear } : null;
}

/** A snapshot for the choice list; Choices relabels it from the current data when her rank is known. */
export function toChoiceItem(r: ListRow, latest: Latest): ChoiceItem {
  return {
    id: r.id, institute: r.college.name, slug: r.college.slug, state: r.college.state, course: courseName(r), courseSlug: r.course.slug, quota: r.quota,
    reachLabel: reachLabel(r.reach, latest, pastOf(latest)), closedEveryRound: r.reach === "closed-before",
  };
}

/** A seat list's kind in a few letters: "clear", "virtual", "newly added" (MCC's newly added seat list; never "new", which reads as "never allotted"). */
export const seatKindShort = (k: SeatList["kind"]) => (k === "new" ? "newly added" : k);

/**
 * Column heading for an option's seats in one list, e.g. "R2 seats" over "clear vacancy" (`short`: "R2" over "clear";
 * the year is in each cell's name and the source line).
 */
export function SeatsHead({ list, short }: { list: SeatList; short?: boolean }) {
  if (short) return <span className="whitespace-nowrap">{roundLabel[list.round]}<span className="block font-normal">{seatKindShort(list.kind)}<span className="sr-only"> seats</span></span></span>;
  return <span className="whitespace-nowrap">{roundLabel[list.round]} seats<span className="block font-normal">{seatKindLabel[list.kind].toLowerCase()}</span></span>;
}

/** `n` seats of one option (`at`, named `name`) in one list, linking to them on Seats; "—" when the list prints none. `end`: right-aligned (columns). */
/** Seat-kind colours (as the institute's key facts and the Colour key): green clear, amber virtual, blue new; the kind is always in words too (header, screen-reader text). */
export const seatKindClass = { clear: "text-leaf", virtual: "text-sun", new: "text-sky" } as const;

export function SeatsLink({ n, list, L, at, name, end }: { n: number | null | undefined; list: SeatList; L: DecideLinks; at: { inst: string; course?: string; quota: string }; name: string; end?: boolean }) {
  if (n == null) return <Dash />;
  return (
    <Link href={L.seats({ list: list.key, ...at })} className={`${smallLink} numeric min-w-11 font-semibold ${seatKindClass[list.kind]} ${end ? "justify-end" : ""}`}>
      {formatRank(n)}<span className="sr-only"> seats in the {list.year} {roundLabel[list.round]} {seatKindLabel[list.kind].toLowerCase()} list: {name}</span>
    </Link>
  );
}

/** One option's seats in that one list (`n`, default its clear vacancy `seats`), linking to them on Seats; "—" when none. */
export function SeatsCell({ r, list, L, n = r.seats, end = true }: { r: ListRow; list: SeatList; L: DecideLinks; n?: number | null; end?: boolean }) {
  return <SeatsLink n={n} list={list} L={L} at={{ inst: r.college.slug, course: r.course.slug, quota: r.quota }} name={`${r.college.name}, ${courseName(r)}, ${r.quota}`} end={end} />;
}

/** Under an option's label: the lists whose seats here are all on seat categories with another label (OptionRow.seatsBelow). */
export function SeatsBelowNote({ r, latest, includeLatest = true }: { r: Pick<OptionRow, "seatsBelow">; latest: Latest; includeLatest?: boolean }) {
  return seatsBelowNotes(r.seatsBelow ?? [], latest, pastOf(latest), includeLatest).map((t) => <span key={t} className="mt-1 block max-w-xs text-xs text-sun">{t}</span>);
}

/** A closing rank with its round and seat category, marked Provisional when its MCC result is. */
export function ClosingCell({ d }: { d: Deepest | null | undefined }) {
  return (
    <>
      <Closing d={d} />
      {d?.provisional && <span className="mt-1 block"><Provisional when /></span>}
    </>
  );
}

/** A fee as published, with its source link; a plain amount reads in lakh (crore from ₹1 Cr) per year. "—" when not listed. */
export function FeeText({ t }: { t: Term | undefined }) {
  return <TermText term={t && t.amountInr != null ? { ...t, text: `${formatInrShort(t.amountInr)}/yr` } : t} />;
}

/** Year × round grid, newest year first: closing rank with its seat category, and allotments made (all categories) in brackets. */
export function RoundGrid({ row, caption }: { row: Pick<OptionRow, "grid" | "reach">; caption: string }) {
  const years = Object.keys(row.grid).map(Number).sort((a, b) => b - a);
  const used = rounds.filter((r) => years.some((y) => row.grid[y]?.[r]));
  if (!years.length)
    return (
      <p className="text-xs text-muted-foreground">
        {row.reach === "new" ? "Never allotted before: MCC allotted nobody to this course and quota here in any result Seatora has, in any round or seat category." : "No closing rank on these seat categories in any round."}
      </p>
    );
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="relative overflow-x-auto overflow-y-hidden">
      <table className="text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="py-1 pr-3 text-left font-normal">Year</th>
            {used.map((r) => <th key={r} scope="col" className="px-2 py-1 text-right font-normal">{roundLabel[r as Round]}</th>)}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y} className="border-t border-border">
              <th scope="row" className="numeric py-1 pr-3 text-left font-normal">{y}</th>
              {used.map((r) => {
                const c = row.grid[y]?.[r as Round];
                return (
                  <td key={r} className="numeric px-2 py-1 text-right">
                    {c ? (
                      <>
                        <span className="font-semibold">{formatRank(c.closing)}</span>{" "}
                        <span className="text-muted-foreground">({formatRank(c.n)}<span className="sr-only"> allotted, all categories</span>)</span>
                        <span className="block text-muted-foreground">{c.category} seat</span>
                        {c.provisional && <Provisional when />}
                      </>
                    ) : (
                      <span>—<span className="sr-only">not available</span></span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">Closing rank on that seat category; allotments made that round, all categories, in brackets. {LATER_ROUNDS_NOTE}</p>
    </div>
  );
}
