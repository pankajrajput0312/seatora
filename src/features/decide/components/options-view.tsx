import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { formatLakh } from "../lib/format";
import type { DecideLinks } from "../lib/links";
import { LATEST_YEAR, PAST_YEARS, reachLabel, type Deepest } from "../lib/reach";
import type { ChoiceItem } from "../lib/choices";
import type { OptionRow } from "../service";
import { roundLabel, rounds, seatKindLabel, type Round, type SeatList, type Term } from "../types";
import { Closing, Dash, Provisional, TermText } from "./bits";
import { smallLink } from "./ui";

// Server-safe on purpose (no "use client"): the institute and compare pages render these on the server, and the
// Options list (option-actions.tsx, a client component) renders them in the browser.

export const courseName = (r: Pick<OptionRow, "course">) => `${r.course.degree} ${r.course.name}`;

/** A snapshot for the choice list; Choices relabels it from the current data when her rank is known. */
export function toChoiceItem(r: OptionRow): ChoiceItem {
  return {
    id: r.id, institute: r.college.name, slug: r.college.slug, state: r.college.state, course: courseName(r), courseSlug: r.course.slug, quota: r.quota,
    reachLabel: reachLabel(r.reach, LATEST_YEAR, PAST_YEARS), closedEveryRound: r.reach === "closed-before",
  };
}

/** Column heading for an option's seats in one list, e.g. "R2 seats" over "clear vacancy" (the year is in each cell's name and the source line). */
export function SeatsHead({ list }: { list: SeatList }) {
  return <span className="whitespace-nowrap">{roundLabel[list.round]} seats<span className="block font-normal">{seatKindLabel[list.kind].toLowerCase()}</span></span>;
}

/** One option's seats in that one list, linking to them on Seats; "—" when the list prints none. */
export function SeatsCell({ r, list, L }: { r: OptionRow; list: SeatList; L: DecideLinks }) {
  if (r.seats == null) return <Dash />;
  return (
    <Link href={L.seats({ list: list.key, inst: r.college.slug, course: r.course.slug, quota: r.quota })} className={`${smallLink} numeric justify-end font-semibold text-sky`}>
      {formatRank(r.seats)}<span className="sr-only"> seats in the {list.year} {roundLabel[list.round]} {seatKindLabel[list.kind].toLowerCase()} list: {r.college.name}, {courseName(r)}, {r.quota}</span>
    </Link>
  );
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

/** A fee as published, with its source link; a plain amount reads in lakh per year. "—" when not listed. */
export function FeeText({ t }: { t: Term | undefined }) {
  return <TermText term={t && t.amountInr != null ? { ...t, text: `${formatLakh(t.amountInr)}/yr` } : t} />;
}

/** Year × round grid: closing rank with its seat category, and allotments made (all categories) in brackets. */
export function RoundGrid({ row, caption }: { row: OptionRow; caption: string }) {
  const years = Object.keys(row.grid).map(Number).sort();
  const used = rounds.filter((r) => years.some((y) => row.grid[y]?.[r]));
  if (!years.length) return <p className="text-xs text-muted-foreground">No closing rank on these seat categories in any round.</p>;
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="relative overflow-x-auto">
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
      <p className="mt-1 text-xs text-muted-foreground">Closing rank on that seat category; allotments made that round, all categories, in brackets.</p>
    </div>
  );
}
