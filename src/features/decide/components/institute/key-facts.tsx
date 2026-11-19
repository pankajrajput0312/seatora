import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, Provisional } from "../bits";
import { ColourLegend } from "../colour-legend";
import { InfoTip } from "../info-tip";
import { courseName } from "../options-view";
import { TermStatCells } from "../stat-cells";
import { smallLink } from "../ui";
import type { decideLinks } from "../../lib/links";
import { MISSING_WORDS, statKeys, statLabel } from "../../lib/stat-format";
import type { OptionRow } from "../../service";
import { roundLabel, seatKinds, type SeatList } from "../../types";
import { KEY_ROWS_PHONE, newestClosing } from "./key-facts-data";
import { QuotaName } from "../round-name";

// The institute page's key facts, above the tabs (the Rank & Seats layout): one row per course (hers with a profile,
// else the main ones) with Fee, Stipend, Bond, Bond ₹, Leaving (each (i): years 1-2-3 and the exact words), the newest
// round's seats here and the newest closing rank. A table from md up, cards below it (CSS picks; both are in the page).

const kindText = { clear: "clear", virtual: "virtual", new: "newly added" } as const;
const kindClass = { clear: "text-leaf", virtual: "text-sun", new: "text-sky" } as const;

/** "3 clear · 1 virtual · 2 + new" in the round's lists (each kind apart: they overlap, never added); "None" when its lists print none here. */
function Seats({ r }: { r: OptionRow }) {
  const by = r.seatsBy ?? {};
  const kinds = seatKinds.filter((k) => k in by);
  if (!kinds.length) return <Dash />;
  const some = kinds.filter((k) => (by[k] ?? 0) > 0);
  if (!some.length) return <span className="text-muted-foreground">None</span>;
  return (
    <span className="numeric inline-flex flex-wrap justify-end gap-x-2">
      {some.map((k) => (
        <span key={k} className="whitespace-nowrap"><span className={cn("font-semibold", kindClass[k])}>{formatRank(by[k]!)}</span> {kindText[k]}</span>
      ))}
    </span>
  );
}

/** A course and quota with seats this round but no past allotment here (service.ts newOptions). */
const New = ({ r }: { r: OptionRow }) => (r.reach === "new" ? <span className="ml-1.5 text-xs font-semibold text-sky">Never allotted before</span> : null);

function Last({ r }: { r: OptionRow }) {
  const c = newestClosing(r.grid);
  if (!c) return <Dash />;
  return (
    <span className="numeric">
      <span className="font-semibold">{formatRank(c.closing)}</span>
      <span className="block text-xs font-normal whitespace-nowrap text-muted-foreground">{c.year} {roundLabel[c.round]}, {c.category} <Provisional when={c.provisional} /></span>
    </span>
  );
}

export function KeyFacts({ rows, total, mine, cats, list, name, slug, L }: { rows: OptionRow[]; total: number; mine: boolean; cats: boolean; list: SeatList | null; name: string; slug: string; L: ReturnType<typeof decideLinks> }) {
  if (!rows.length) return null;
  const round = list ? `${list.year} ${roundLabel[list.round]}` : null;
  const of = (r: OptionRow) => `${name}, ${courseName(r)}, ${r.quota}`;
  const seatsHead = round ? `${round} seats` : "Seats";
  const seatsNote = round
    ? `In MCC's ${round} seat lists, ${cats ? "on your seat categories" : "every seat category"}: clear vacancies, virtual ones (free only if the holder upgrades or leaves) and newly added seats. The lists overlap, so they are never added.`
    : "No MCC seat list is in the data yet.";
  const lastNote = `The closing rank of the newest round with allotments here (the year, round and seat category under it)${cats ? ", on your seat categories" : ", any seat category"}. MCC's result PDFs.`;
  const more = total > rows.length || rows.length > KEY_ROWS_PHONE;
  return (
    <section aria-labelledby="key-facts-h" className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="key-facts-h" className="flex items-center gap-1 text-base font-semibold">
          {mine ? "Your courses here" : "Main courses here"}
          <InfoTip label="key facts">
            {mine ? "The course and quota options here in your profile." : "The quotas anyone can take first, then the most seats in the newest round."} Fee and stipend are year 1; each (i) has
            years 1, 2 and 3 and the exact words with their source. Bond period: the years you must serve; Bond penalty: what you pay if you don&apos;t; Leaving penalty: the penalty for
            leaving after joining. {MISSING_WORDS}
          </InfoTip>
        </h2>
        <span className="flex items-center gap-3">
          <ColourLegend />
          {more && <Link href={L.institute(slug, "courses")} className={`${smallLink} text-sm text-sky`}>All {formatRank(total)} options</Link>}
        </span>
      </div>

      {/* md up: one table. Bond columns on a wash, so the bond reads first. */}
      <div role="region" aria-label="Key facts by course" tabIndex={0} className="overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-card max-md:hidden">
        <table className="w-full text-sm [&_td[data-col^=bond]]:bg-wash/60 [&_td[data-col^=bond]]:text-base">
          <caption className="sr-only">Key facts by course at {name}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2 text-left font-semibold">Course</th>
              {statKeys.map((k) => (
                <th key={k} scope="col" data-col={k} className={cn("px-3 py-2 text-right font-semibold", k.startsWith("bond") && "bg-wash/60 text-foreground")}>
                  {k === "fee" ? "Fee / yr" : k === "stipend" ? "Stipend / mo" : statLabel[k]}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-semibold"><span className="inline-flex items-center gap-0.5">{seatsHead}<InfoTip label={seatsHead}>{seatsNote}</InfoTip></span></th>
              <th scope="col" className="px-3 py-2 text-right font-semibold"><span className="inline-flex items-center gap-0.5">Last closing<InfoTip label="last closing rank">{lastNote}</InfoTip></span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <th scope="row" className="px-3 py-2 text-left align-top font-medium">
                  <Link href={L.lastRanks(r.course.slug, { inst: slug })} className="hover:text-sky hover:underline">{courseName(r)}</Link><New r={r} />
                  <span className="block text-xs font-normal text-muted-foreground"><QuotaName quota={r.quota} /></span>
                </th>
                <TermStatCells t={r.fees} variant="table" short of={of(r)} tdClassName="px-3 py-2" />
                <td className="px-3 py-2 text-right align-top"><Seats r={r} /></td>
                <td className="px-3 py-2 text-right align-top"><Last r={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: a card per course, the first KEY_ROWS_PHONE (the rest are in Courses). */}
      <ul className="grid gap-2 md:hidden">
        {rows.map((r, i) => (
          <li key={r.id} className={cn("rounded-xl border border-border bg-card", i >= KEY_ROWS_PHONE && "hidden")}>
            <div className="flex items-start justify-between gap-3 px-3 pt-2">
              <span className="min-w-0">
                <Link href={L.lastRanks(r.course.slug, { inst: slug })} className="py-2 text-sm font-semibold hover:text-sky hover:underline">{courseName(r)}</Link><New r={r} />
                <span className="block text-xs text-muted-foreground"><QuotaName quota={r.quota} /></span>
              </span>
              <span className="shrink-0 text-right text-xs text-muted-foreground">Last closing<span className="block text-sm text-foreground"><Last r={r} /></span></span>
            </div>
            <p className="px-3 pb-1 text-xs text-muted-foreground">{seatsHead}: <span className="text-foreground"><Seats r={r} /></span></p>
            <TermStatCells t={r.fees} of={of(r)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
