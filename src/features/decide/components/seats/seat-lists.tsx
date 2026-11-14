import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import type { DecideLinks } from "../../lib/links";
import { roundName } from "../../lib/round-status";
import type { SeatRow } from "../../server/seats";
import { roundLabel, seatKindLabel, type MccNotice, type SeatKind, type SeatList } from "../../types";
import { Dash } from "../bits";
import { smallLink, tbl } from "../ui";

// Seats page parts (src/app/decide/seats): one MCC seat list at a time, never added to another list.

export const seatKindNote: Record<SeatKind, string> = {
  clear: "seats nobody holds after the previous round.",
  virtual: "seats held after the previous round that fall vacant only if the holder upgrades or leaves in this round.",
  new: "seats added to the round after its seat matrix; most are also in the clear vacancy list.",
};

/** "13 Nov 2026" from YYYY-MM-DD. */
export const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const listTitle = (l: SeatList) => `${l.year} ${roundLabel[l.round]} ${seatKindLabel[l.kind].toLowerCase()}`;

const groupOf = (l: SeatList) => `${l.year} ${roundLabel[l.round]}`;
/** Two PDFs of one kind in a round (2025 R2 newly added seats) share a name: the date in the key tells them apart. */
const keyDay = (l: SeatList) => l.key.match(/\d{4}-\d{2}-\d{2}/)?.[0];

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
          {xs.some((x) => x !== l && x.kind === l.kind) && keyDay(l) && <span className="numeric text-xs"><span className="sr-only">, </span>{fmtDay(keyDay(l)!)} PDF</span>}
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
 * The seats of a list in her profile whose course and quota is no option (no past allotments; service.ts unlistedOf),
 * named on Options and institute pages with a link to them on Seats. `here`: at one institute.
 */
export function UnlistedSeats({ u, profile, here, href }: { u: { list: SeatList; options: number; seats: number } | null; profile: boolean; here?: boolean; href: string }) {
  if (!u || u.seats <= 0) return null;
  const one = u.options === 1;
  return (
    <p className="text-sm text-muted-foreground">
      <span className="numeric">{formatRank(u.seats)}</span> {u.seats === 1 ? "seat" : "seats"}{here && " here"} in <span className="numeric">{formatRank(u.options)}</span>{" "}
      {one ? "course and quota" : "courses and quotas"} of the {listTitle(u.list)} list {profile ? "match your courses, quotas, states and seat categories but have" : "have"} no
      past MCC allotments, so {one ? "it is not an option" : "they are not options"} here: there is no closing rank to compare.{" "}
      <Link href={href} className={`${smallLink} text-sky`}>See {u.seats === 1 ? "this seat" : "these seats"}</Link>
    </p>
  );
}

const courseOf = (r: SeatRow) => `${r.degree} ${r.course?.name ?? r.specialty}`;
const md = "hidden md:table-cell";

/** Seat rows: institute, state, course, quota, seat category, seats. Under md, state, course and quota move under the name. */
export function SeatTable({ rows, caption, L }: { rows: SeatRow[]; caption: string; L: DecideLinks }) {
  const td = "px-3 py-3 align-top md:px-4";
  return (
    <div role="region" aria-label={caption} tabIndex={0} className={tbl.wrap}>
      <table className={tbl.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={tbl.headRow}>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Institute<span className="md:hidden">, course, quota and state</span></th>
            <th scope="col" className={cn(tbl.th, md)}>State</th>
            <th scope="col" className={cn(tbl.th, md)}>Course</th>
            <th scope="col" className={cn(tbl.th, md)}>Quota</th>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Seat category</th>
            <th scope="col" className={cn(tbl.th, "px-3 text-right md:px-4")}>Seats</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.list}|${r.college.key}|${r.degree}|${r.specialty}|${r.quota}|${r.category}|${i}`} className={tbl.row}>
              <th scope="row" className={cn(td, "min-w-40 text-left font-normal")}>
                <Link href={L.institute(r.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{r.college.name}</Link>
                <span className="block text-xs text-muted-foreground md:hidden">
                  {courseOf(r)}, {r.quota ?? "quota not printed"}, {r.college.state ?? "state not listed"}
                </span>
              </th>
              <td className={cn(td, md)}>{r.college.state ?? <Dash />}</td>
              <td className={cn(td, md)}>{courseOf(r)}</td>
              <td className={cn(td, md)}>{r.quota ?? <Dash />}</td>
              <td className={td}>{r.category}</td>
              <td className={cn(tbl.num, "px-3 md:px-4")}>{formatRank(r.seats)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
