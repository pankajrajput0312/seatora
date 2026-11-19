import Link from "next/link";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { fmtDay, listDay } from "../../lib/format";
import type { DecideLinks } from "../../lib/links";
import { isRestricted, neetPg, type Exam } from "@/features/exams/exam";
import { pastOf, reachWindow, type Latest } from "../../lib/reach";
import { statKeys, statLabel } from "../../lib/stat-format";
import { rounds, seatKindLabel, type Round, type SeatKind, type SeatList } from "../../types";
import { Dash, InstName, Provisional, ReachBadge } from "../bits";
import { InfoTip } from "../info-tip";
import { TermStatCells } from "../stat-cells";
import { TypeBadge } from "../type-badge";
import { smallLink, tbl } from "../ui";
import { PAST_ROUNDS, type SeatLine, type SeatSort } from "./find-seats";
import { seatCourse as courseOf } from "./seat-cards";
import { ScrollTable } from "../scroll-table";
import { roundNameFrom } from "@/features/exams/exam";
import { RoundName } from "../round-name";
import { QuotaName } from "../round-name";
import { quotaIn } from "@/features/exams/exam";

// Seats page parts (src/app/decide/seats): one MCC seat list at a time, never added to another list.

export const seatKindNote: Record<SeatKind, string> = {
  clear: "seats nobody holds after the previous round.",
  virtual: "seats held after the previous round that fall vacant only if the holder upgrades or leaves in this round.",
  new: "seats added to the round after its seat matrix; most are also in the clear vacancy list.",
};

export { fmtDay } from "../../lib/format";
/** The round as the list's own PDF names it (NEET SS 2023's "Mop-up"; NEET PG's: roundLabel). */
export const listTitle = (l: SeatList) => `${l.year} ${roundNameFrom(l.name, l.round)} ${seatKindLabel[l.kind].toLowerCase()}`;
/** "2026 R1 clear vacancy seats"; the new list's label already ends in seats ("newly added seats"). */
export const listSeats = (l: SeatList) => `${listTitle(l)}${l.kind === "new" ? "" : " seats"}`;

const groupOf = (l: SeatList) => `${l.year} ${roundNameFrom(l.name, l.round)}`;

/** Link chips, one per list PDF, grouped by year and round (seatLists() order); earlier rounds fold away unless picked. */
export function SeatListPicker({ lists, current, href }: { lists: SeatList[]; current: string; href: (key: string) => string }) {
  const [latest, ...earlier] = [...new Set(lists.map(groupOf))];
  const group = (g: string, first?: boolean) => (
    // Phones: the latest round's row scrolls sideways and fades at an edge with more (fade-x), so a chip under the
    // edge reads as "more this way", not as cut off by "Earlier".
    <div key={g} className={cn("chip-row flex flex-wrap items-center gap-2", first && "fade-x max-md:min-w-0 max-md:flex-1 max-md:mr-0! max-md:pr-0!")}>
      {/* The chips' figures are each whole list (All India), not her filtered rows (the count beside the search box). */}
      <span className="text-sm leading-tight sm:w-24 sm:shrink-0" aria-hidden>
        <span className="numeric block font-semibold">{g}</span>
        <span className="block text-xs text-muted-foreground">All India total</span>
      </span>
      {lists.filter((l) => groupOf(l) === g).map((l, _, xs) => (
        <Link
          key={l.key}
          href={href(l.key)}
          aria-current={l.key === current ? "true" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm",
            l.key === current ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input",
          )}
        >
          <span className="sr-only">{g} </span>{seatKindLabel[l.kind]} <span className="numeric font-semibold">{formatRank(l.seats)}</span><span className="sr-only"> seats in the whole list, All India</span>
          {xs.some((x) => x !== l && x.kind === l.kind) && listDay(l) && <span className="numeric text-xs"><span className="sr-only">, </span>{fmtDay(listDay(l)!)} PDF</span>}
        </Link>
      ))}
    </div>
  );
  return (
    // Phones: the latest round's lists scroll sideways with "Earlier" at the row's end (one row, not two).
    <nav aria-label="Seat lists" className="flex flex-wrap items-center gap-2 max-md:w-full max-md:min-w-0 max-md:flex-nowrap max-md:has-[details[open]]:flex-wrap">
      {latest && group(latest, true)}
      {earlier.length > 0 && (
        <details open={lists.some((l) => l.key === current && groupOf(l) !== latest)} className="open:basis-full max-md:shrink-0">
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-x-1 text-sm text-sky underline"><span className="whitespace-nowrap">Earlier</span><span className="max-md:sr-only">rounds: {earlier.join(", ")}</span></summary>
          <div className="mt-2 grid gap-2">{earlier.map((g) => group(g))}</div>
        </details>
      )}
    </nav>
  );
}

/**
 * The seats of a list in her profile whose course and quota has no past allotments (service.ts unlistedOf), on Options
 * and institute pages: one line, the why behind its (i), and a link to them on Seats. `here`: at one institute.
 * `options`: while Options' round view lists them as new options, the link to them there (else they are no option).
 */
export function UnlistedSeats({ u, profile, here, href, options }: { u: { list: SeatList; options: number; seats: number } | null; profile: boolean; here?: boolean; href: string; options?: string }) {
  if (!u || u.seats <= 0) return null;
  const one = u.options === 1;
  const them = u.seats === 1 ? "it" : "them";
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
      {/* "2026 R2 clear vacancy seats", "2026 R2 newly added seats" (that list's name already says seats). */}
      <span><span className="numeric">{formatRank(u.seats)}</span> {u.list.kind === "new" ? `${u.list.year} ${roundNameFrom(u.list.name, u.list.round)} newly added` : listTitle(u.list)} {u.seats === 1 ? "seat" : "seats"}{here && " here"} never allotted before</span>
      <InfoTip label={`${listSeats(u.list)} never allotted before`}>
        {u.seats === 1 ? "It is" : "They are"} in <span className="numeric">{formatRank(u.options)}</span> {one ? "course and quota" : "courses and quotas"}
        {profile ? " that match your courses, quotas, states and seat categories" : ""} with no past MCC allotments, so there is no closing rank to
        compare{options ? `: Options lists ${one ? "it" : "them"} as “Never allotted before”.` : `, and ${one ? "it is not an option" : "they are not options"} here.`}
      </InfoTip>
      {options && <Link href={options} className={`${smallLink} text-sky sm:ml-2`}>See {one ? "it" : "them"} on Options</Link>}
      <Link href={href} className={`${smallLink} text-sky sm:ml-2`}>See {them} on Seats</Link>
    </p>
  );
}

/** The deepest closing of every round the reach label counts (Stray included, lib/reach.ts deepestOf), and behind a disclosure each of them. */
function PastClosings({ r, name, latest }: { r: SeatLine; name: string; latest: Latest }) {
  if (!r.rounds.length) return <Dash />;
  const d = r.deepest;
  const at = (p: { year: number; round: Round }) => r.rounds.find((c) => c.year === p.year && c.round === p.round);
  // NEET PG's fixed rounds (each "—" when none); another exam (its own years, latest.pastYears): the rounds it has.
  const fixed = latest.pastYears ? [] : PAST_ROUNDS;
  const all: { year: number; round: Round; closing: number | null; provisional: boolean }[] = [...fixed.map((p) => at(p) ?? { ...p, closing: null, provisional: false }), ...r.rounds.filter((c) => !fixed.some((p) => p.year === c.year && p.round === c.round))]
    .sort((a, b) => b.year - a.year || rounds.indexOf(a.round) - rounds.indexOf(b.round));
  return (
    <div className="grid justify-items-end gap-1 whitespace-nowrap">
      {d ? (
        <span className="numeric">
          <span className="text-[15px] font-semibold">{formatRank(d.closing)}</span>
          <span className="block text-xs text-muted-foreground">{d.year} <RoundName year={d.year} round={d.round} /></span>
        </span>
      ) : (
        <Dash />
      )}
      <Provisional when={d?.provisional} />
      <details className="text-right text-xs">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky">Every round<span className="sr-only">: {name}</span></summary>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 text-right">
          {all.map((c) => (
            <Fragment key={`${c.year}-${c.round}`}>
              <dt className="numeric text-left text-muted-foreground">{c.year} <RoundName year={c.year} round={c.round} /></dt>
              <dd className="numeric">{c.closing != null ? <>{formatRank(c.closing)}{c.provisional && " (provisional)"}</> : <Dash />}</dd>
            </Fragment>
          ))}
        </dl>
      </details>
    </div>
  );
}

/**
 * Seat rows: institute (with course, quota and state; sticky, so a phone scrolls the rest beside it), seat category,
 * the course's terms as number cells, seats in each of `lists` (one list, or every list of a round side by side: never
 * added; `current` orders the seats sort), the deepest past closing on the row's quota and seat category, and her reach
 * label on it (`ranked`; `latest`: lib/reach.ts latestRound).
 */
export function SeatTable({ rows, lists, current, sort, caption, ranked, L, latest, exam = neetPg }: { rows: SeatLine[]; lists: SeatList[]; current: string; sort: SeatSort; caption: string; ranked: boolean; L: DecideLinks; latest: Latest; exam?: Exam }) {
  const td = "px-3 py-3 align-top md:px-4";
  const th = cn(tbl.th, "px-3 align-bottom md:px-4");
  const sticky = "sticky left-0 z-[1] w-40 min-w-40 border-r border-border bg-card md:w-72 md:min-w-72";
  const several = lists.length > 1;
  return (
    <ScrollTable label={caption} scrollClassName="scroll-pl-48 md:scroll-pl-80">
      <table className={tbl.table}>
        <caption className="sr-only">{caption}</caption>
        <thead className={tbl.head}>
          <tr className="text-left">
            <th scope="col" className={cn(th, sticky)} aria-sort={sort === "college" ? "ascending" : undefined}>Institute, course, quota and state</th>
            <th scope="col" className={th}>Seat category</th>
            {/* The course's terms beside it (as on Options), in view without scrolling sideways. */}
            {statKeys.map((k) => (
              <th key={k} scope="col" data-col={k} className={cn(th, "text-right")} aria-sort={(sort === "fee" && k === "fee") || (sort === "bond" && k === "bond") ? "ascending" : undefined}>{statLabel[k]}</th>
            ))}
            {lists.map((l) => (
              <th key={l.key} scope="col" className={cn(th, "text-right")} aria-sort={sort === "seats" && l.key === current ? "descending" : undefined}>
                {several ? <>{seatKindLabel[l.kind]}{lists.some((x) => x !== l && x.kind === l.kind) && listDay(l) && <span className="numeric block font-normal">{fmtDay(listDay(l)!)} PDF</span>}</> : "Seats"}
              </th>
            ))}
            <th scope="col" className={cn(th, "text-right whitespace-nowrap")} aria-sort={sort === "closing" ? "descending" : undefined}>
              Deepest past closing
              <InfoTip label="deepest past closing">The deepest closing rank on the row&apos;s quota and seat category in {reachWindow(latest, pastOf(latest))}, every round, Stray included, with its year and round; each round behind &quot;Every round&quot;.</InfoTip>
            </th>
            {ranked && <th scope="col" className={cn(th, "min-w-36")}>Reach</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const name = `${r.college.name}, ${courseOf(r)}, ${r.quota != null ? quotaIn(exam, r.quota) : "quota not printed"}, ${r.category} seat`;
            return (
              <tr key={`${r.list}|${r.college.key}|${r.degree}|${r.specialty}|${r.quota}|${r.category}|${i}`} className={tbl.row}>
                <th scope="row" className={cn(td, sticky, "text-left font-normal")}>
                  <Link href={L.institute(r.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline"><InstName name={r.college.name} state={r.college.state} /></Link>
                  <span className="block text-xs text-muted-foreground">
                    {courseOf(r)}, {r.quota != null ? <QuotaName quota={r.quota} /> : "quota not printed"}, {r.college.state ?? "state not listed"}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <TypeBadge type={r.hospital?.type} of={r.college.name} />
                    {r.quota != null && isRestricted(exam, r.quota) && <Badge tone="warning">Restricted quota</Badge>}
                  </span>
                </th>
                <td className={td}>{r.category}</td>
                <TermStatCells t={r.fees} variant="table" short of={name} />
                {lists.map((l) => (
                  <td key={l.key} className={cn(tbl.num, "px-3 md:px-4")}>{r.byList[l.key] != null ? formatRank(r.byList[l.key]) : <Dash />}</td>
                ))}
                <td className={td}><PastClosings r={r} name={name} latest={latest} /></td>
                {ranked && (
                  <td className={td}>
                    {r.reach ? <ReachBadge reach={r.reach} provisional={r.reachProvisional} latest={latest} on={r.category} /> : <span className="text-xs text-muted-foreground">{r.noLabel}</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollTable>
  );
}
