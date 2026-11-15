import Link from "next/link";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { fmtDay, listDay } from "../../lib/format";
import type { DecideLinks } from "../../lib/links";
import { roundName } from "../../lib/round-status";
import type { SeatRow } from "../../server/seats";
import { openQuotas, roundLabel, rounds, seatKindLabel, type MccNotice, type Round, type SeatKind, type SeatList } from "../../types";
import { Dash, Provisional, ReachBadge } from "../bits";
import { TermsSummary } from "../fees";
import { smallLink, tbl } from "../ui";
import { PAST_ROUNDS, type SeatLine, type SeatSort } from "./find-seats";

// Seats page parts (src/app/decide/seats): one MCC seat list at a time, never added to another list.

export const seatKindNote: Record<SeatKind, string> = {
  clear: "seats nobody holds after the previous round.",
  virtual: "seats held after the previous round that fall vacant only if the holder upgrades or leaves in this round.",
  new: "seats added to the round after its seat matrix; most are also in the clear vacancy list.",
};

export { fmtDay } from "../../lib/format";
export const listTitle = (l: SeatList) => `${l.year} ${roundLabel[l.round]} ${seatKindLabel[l.kind].toLowerCase()}`;

const groupOf = (l: SeatList) => `${l.year} ${roundLabel[l.round]}`;

/** Link chips, one per list PDF, grouped by year and round (seatLists() order); earlier rounds fold away unless picked. */
export function SeatListPicker({ lists, current, href }: { lists: SeatList[]; current: string; href: (key: string) => string }) {
  const [latest, ...earlier] = [...new Set(lists.map(groupOf))];
  const group = (g: string) => (
    <div key={g} className="flex flex-wrap items-center gap-2">
      <span className="numeric w-full text-sm font-semibold sm:w-20 sm:shrink-0" aria-hidden>{g}</span>
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
          <span className="sr-only">{g} </span>{seatKindLabel[l.kind]} <span className="numeric font-semibold">{formatRank(l.seats)}</span><span className="sr-only"> seats</span>
          {xs.some((x) => x !== l && x.kind === l.kind) && listDay(l) && <span className="numeric text-xs"><span className="sr-only">, </span>{fmtDay(listDay(l)!)} PDF</span>}
        </Link>
      ))}
    </div>
  );
  return (
    <nav aria-label="Seat lists" className="grid gap-3">
      {latest && group(latest)}
      {earlier.length > 0 && (
        <details open={lists.some((l) => l.key === current && groupOf(l) !== latest)}>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-sky underline">Earlier rounds: {earlier.join(", ")}</summary>
          <div className="mt-3 grid gap-3">{earlier.map(group)}</div>
        </details>
      )}
    </nav>
  );
}

function NoticeList({ notices }: { notices: MccNotice[] }) {
  return (
    <ul className="grid">
      {notices.map((n) => (
        <li key={n.url}>
          <a href={n.url!} target="_blank" rel="noopener noreferrer" className={`${smallLink} hover:text-sky`}>
            {n.title}, <span className="numeric ml-1">{fmtDay(n.date)}</span><span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * The list's official PDF and notice date, and the MCC seat notices of its round that may change it: `later` (after
 * the list's date: not applied) and `sameDay` (may already be in it), from seatChanges (server/seats.ts).
 */
export function SeatListSource({ list, later, sameDay, noticesHref }: { list: SeatList; later: MccNotice[]; sameDay: MccNotice[]; noticesHref: string }) {
  const tier = sourceTypeLabels.OFFICIAL;
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <p className="flex flex-wrap items-center gap-x-2">
        <Badge tone={tier.tone}>{tier.text}</Badge>
        {list.url ? (
          <a href={list.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} hover:text-sky`}>
            {list.name}, PDF<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span>{list.name}</span>
        )}
        <span>· MCC notice dated {list.publishedAt ? <span className="numeric">{fmtDay(list.publishedAt)}</span> : <Dash />}</span>
      </p>
      <p>
        The list as that PDF printed it: seats MCC added or removed afterwards are not applied here.
        {later.length > 0 && ` Check ${later.length === 1 ? "this later MCC notice" : "these later MCC notices"} before you lock your choices:`}
      </p>
      {later.length > 0 && <NoticeList notices={later} />}
      {sameDay.length > 0 && (
        <>
          <p>Published the same day as this list, so the list may already include {sameDay.length === 1 ? "it" : "them"}:</p>
          <NoticeList notices={sameDay} />
        </>
      )}
      <p><Link href={noticesHref} className={`${smallLink} hover:text-sky`}>All MCC seat notices, PG {list.year} {roundName[list.round]}</Link></p>
    </div>
  );
}

/**
 * The seats of a list in her profile whose course and quota has no past allotments (service.ts unlistedOf), named on
 * Options and institute pages with a link to them on Seats. `here`: at one institute. `options`: while Options' round
 * view lists them as new options, the link to them there (else they are no option).
 */
export function UnlistedSeats({ u, profile, here, href, options }: { u: { list: SeatList; options: number; seats: number } | null; profile: boolean; here?: boolean; href: string; options?: string }) {
  if (!u || u.seats <= 0) return null;
  const one = u.options === 1;
  return (
    <p className="text-sm text-muted-foreground">
      <span className="numeric">{formatRank(u.seats)}</span> {u.seats === 1 ? "seat" : "seats"}{here && " here"} in <span className="numeric">{formatRank(u.options)}</span>{" "}
      {one ? "course and quota" : "courses and quotas"} of the {listTitle(u.list)} list {profile ? "match your courses, quotas, states and seat categories but have" : "have"} no
      past MCC allotments, so there is no closing rank to compare
      {options ? <>: Options lists {one ? "it" : "them"} as &ldquo;New: no past allotment&rdquo;.{" "}<Link href={options} className={`${smallLink} text-sky`}>See {one ? "it" : "them"} on Options</Link>{" "}</> : <> and {one ? "it is not an option" : "they are not options"} here.{" "}</>}
      <Link href={href} className={`${smallLink} text-sky`}>See {u.seats === 1 ? "this seat" : "these seats"}</Link>
    </p>
  );
}

const courseOf = (r: SeatRow) => `${r.degree} ${r.course?.name ?? r.specialty}`;

/** The deepest closing of the shown past rounds (PAST_ROUNDS), and behind a disclosure every round the reach label counts. */
function PastClosings({ r, name }: { r: SeatLine; name: string }) {
  if (!r.rounds.length) return <Dash />;
  const d = r.deepest;
  const at = (p: { year: number; round: Round }) => r.rounds.find((c) => c.year === p.year && c.round === p.round);
  const all: { year: number; round: Round; closing: number | null; provisional: boolean }[] = [...PAST_ROUNDS.map((p) => at(p) ?? { ...p, closing: null, provisional: false }), ...r.rounds.filter((c) => !PAST_ROUNDS.some((p) => p.year === c.year && p.round === c.round))]
    .sort((a, b) => a.year - b.year || rounds.indexOf(a.round) - rounds.indexOf(b.round));
  return (
    <div className="grid justify-items-end gap-1 whitespace-nowrap">
      {d ? (
        <span className="numeric">
          <span className="text-[15px] font-semibold">{formatRank(d.closing)}</span>
          <span className="block text-xs text-muted-foreground">{d.year} {roundLabel[d.round]}</span>
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
              <dt className="numeric text-left text-muted-foreground">{c.year} {roundLabel[c.round]}</dt>
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
 * seats in each of `lists` (one list, or every list of a round side by side: never added; `current` orders the seats sort), the deepest past closing on
 * the row's quota and seat category, her reach label on it (`ranked`), and the published terms.
 */
export function SeatTable({ rows, lists, current, sort, caption, ranked, L }: { rows: SeatLine[]; lists: SeatList[]; current: string; sort: SeatSort; caption: string; ranked: boolean; L: DecideLinks }) {
  const td = "px-3 py-3 align-top md:px-4";
  const th = cn(tbl.th, "px-3 align-bottom md:px-4");
  const sticky = "sticky left-0 z-[1] w-40 min-w-40 border-r border-border bg-card md:w-72 md:min-w-72";
  const several = lists.length > 1;
  return (
    <div role="region" aria-label={caption} tabIndex={0} className={cn(tbl.wrap, tbl.scroll, "scroll-pl-48 md:scroll-pl-80")}>
      <table className={tbl.table}>
        <caption className="sr-only">{caption}</caption>
        <thead className={tbl.head}>
          <tr className="text-left">
            <th scope="col" className={cn(th, sticky)} aria-sort={sort === "college" ? "ascending" : undefined}>Institute, course, quota and state</th>
            <th scope="col" className={th}>Seat category</th>
            {lists.map((l) => (
              <th key={l.key} scope="col" className={cn(th, "text-right")} aria-sort={sort === "seats" && l.key === current ? "descending" : undefined}>
                {several ? <>{seatKindLabel[l.kind]}{lists.some((x) => x !== l && x.kind === l.kind) && listDay(l) && <span className="numeric block font-normal">{fmtDay(listDay(l)!)} PDF</span>}</> : "Seats"}
              </th>
            ))}
            <th scope="col" className={cn(th, "text-right")} aria-sort={sort === "closing" ? "descending" : undefined}>
              Deepest past closing<span className="block font-normal">{PAST_ROUNDS.map((p) => `${p.year} ${roundLabel[p.round]}`).join(", ")}</span>
            </th>
            {ranked && <th scope="col" className={cn(th, "min-w-36")}>Reach</th>}
            <th scope="col" className={cn(th, "min-w-72")}>Fee, stipend, bond and leaving penalty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const name = `${r.college.name}, ${courseOf(r)}, ${r.quota ?? "quota not printed"}, ${r.category} seat`;
            return (
              <tr key={`${r.list}|${r.college.key}|${r.degree}|${r.specialty}|${r.quota}|${r.category}|${i}`} className={tbl.row}>
                <th scope="row" className={cn(td, sticky, "text-left font-normal")}>
                  <Link href={L.institute(r.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{r.college.name}</Link>
                  <span className="block text-xs text-muted-foreground">
                    {courseOf(r)}, {r.quota ?? "quota not printed"}, {r.college.state ?? "state not listed"}
                  </span>
                  {r.quota != null && !openQuotas.includes(r.quota) && <Badge tone="warning" className="mt-1">Restricted quota</Badge>}
                </th>
                <td className={td}>{r.category}</td>
                {lists.map((l) => (
                  <td key={l.key} className={cn(tbl.num, "px-3 md:px-4")}>{r.byList[l.key] != null ? formatRank(r.byList[l.key]) : <Dash />}</td>
                ))}
                <td className={td}><PastClosings r={r} name={name} /></td>
                {ranked && (
                  <td className={td}>
                    {r.reach ? <ReachBadge reach={r.reach} provisional={r.reachProvisional} on={r.category} /> : <span className="text-xs text-muted-foreground">{r.noLabel}</span>}
                  </td>
                )}
                <td className={td}>
                  <TermsSummary t={r.fees} className="text-xs" />
                  <Link href={L.institute(r.college.slug, "fees")} className={cn(smallLink, "text-xs text-sky")}>Fees &amp; bond<span className="sr-only">: {r.college.name}</span></Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
