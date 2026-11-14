import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import type { SeatRow } from "../../server/seats";
import type { SeatList } from "../../types";
import { Dash, Provisional } from "../bits";
import { SeatsHead } from "../options-view";
import { fmtDay } from "../seats/seat-lists";
import { smallLink, tbl } from "../ui";
import type { AllotmentMix } from "./institute-data";

// Institute page parts (src/app/decide/institutes/[slug]), server-rendered.

/** A seats column heading, e.g. "R2 seats / clear vacancy"; with the PDF's date (else its name) when the round has two lists of that kind. */
export function RoundSeatsHead({ list, lists }: { list: SeatList; lists: SeatList[] }) {
  const twin = lists.some((l) => l.key !== list.key && l.kind === list.kind);
  return (
    <>
      <SeatsHead list={list} />
      {twin && <span className="block font-normal">{list.publishedAt ? fmtDay(list.publishedAt) : list.name}</span>}
    </>
  );
}

/** One option's seats in one list, linking to them on Seats; "—" when the list prints none. `label`: sr-only context. */
export function SeatNumber({ n, href, label }: { n: number | null; href: string; label: string }) {
  if (n == null) return <Dash />;
  return (
    <Link href={href} className={`${smallLink} numeric min-w-11 justify-end font-semibold text-sky`}>
      {formatRank(n)}<span className="sr-only"> {label}</span>
    </Link>
  );
}

/** Her seat categories or every one, for the seat columns (`scat=all`). */
export function CategoryToggle({ mine, all, href }: { mine: string[]; all: boolean; href: (all: boolean) => string }) {
  const chip = (on: boolean, to: boolean, text: string) => (
    <Link
      href={href(to)}
      scroll={false}
      aria-current={on ? "true" : undefined}
      className={cn("inline-flex min-h-11 items-center rounded-full border px-3 text-sm", on ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input")}
    >
      {text}
    </Link>
  );
  return (
    <nav aria-label="Seat categories counted in the seat columns" className="flex flex-wrap items-center gap-2">
      {chip(!all, false, `Your seat categories: ${mine.join(", ")}`)}
      {chip(all, true, "All seat categories")}
    </nav>
  );
}

/** One seat list's rows at one institute: course, quota, seat category, seats (as the PDF printed them). */
export function CollegeSeatTable({ rows, caption }: { rows: SeatRow[]; caption: string }) {
  const td = "px-3 py-3 align-top md:px-4";
  return (
    <div role="region" aria-label={caption} tabIndex={0} className={tbl.wrap}>
      <table className={tbl.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={tbl.headRow}>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Course</th>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Quota</th>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Seat category</th>
            <th scope="col" className={cn(tbl.th, "px-3 text-right md:px-4")}>Seats</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={tbl.row}>
              <th scope="row" className={cn(td, "text-left font-medium")}>{r.degree} {r.course?.name ?? r.specialty}</th>
              <td className={td}>{r.quota ?? <Dash />}</td>
              <td className={td}>{r.category}</td>
              <td className={cn(tbl.num, "px-3 md:px-4")}>{formatRank(r.seats)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Allotments per quota (row groups) × seat category: the newest result round, then each year. */
export function AllotmentMixTable({ mix, name }: { mix: AllotmentMix; name: string }) {
  const cell = "px-3 py-2 md:px-4";
  return (
    <div role="region" aria-label="Allotments by quota and seat category" tabIndex={0} className={cn(tbl.wrap, "max-w-3xl")}>
      <table className={tbl.table}>
        <caption className="sr-only">Allotments at {name} by quota and seat category: {mix.columns[0].label}, then each year</caption>
        <thead>
          <tr className={tbl.headRow}>
            <th scope="col" className={cn(tbl.th, "px-3 md:px-4")}>Quota and seat category</th>
            {mix.columns.map((c) => (
              <th key={c.label} scope="col" className={cn(tbl.th, "px-3 text-right md:px-4")}>
                <span className="numeric">{c.label}</span>
                <span className="block font-normal">{c.round ? "latest round" : "all rounds"}</span>
                <Provisional when={c.provisional} />
              </th>
            ))}
          </tr>
        </thead>
        {mix.groups.map((g) => (
          <tbody key={g.quota}>
            <tr className="border-b border-border bg-muted/40">
              <th scope="rowgroup" colSpan={mix.columns.length + 1} className={cn(cell, "text-left text-xs font-semibold text-muted-foreground")}>{g.quota}</th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.category} className={tbl.row}>
                <th scope="row" className={cn(cell, "text-left font-normal")}>{r.category} seat</th>
                {r.values.map((v, i) => <td key={mix.columns[i].label} className={cn(cell, "numeric text-right font-semibold")}>{v != null ? formatRank(v) : <Dash />}</td>)}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
