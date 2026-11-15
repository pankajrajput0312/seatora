import Link from "next/link";
import { Info } from "lucide-react";
import { SourceLabel } from "@/components/ui/source-label";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import type { DecideLinks } from "../lib/links";
import { parseSearchParams } from "../lib/params";
import { profileHasCourse, type Profile } from "../profile";
import { residentsQuery, type ResidentRow, type ResidentsQuery } from "../residents-search";
import type { ResidentSource } from "../server/residents";
import { roundLabel, type Course, type Round } from "../types";
import { Dash } from "./bits";
import { ClosingDetails } from "./closing-details";
import { MCC_PG } from "./pages/mcc-link";
import { HideableRow } from "./residents/hideable-row";
import { HideableCard } from "./residents-hideable-card";
import { tbl } from "./ui";

// The Residents tab across colleges (/decide/residents): its URL params, table, cards, info and sources.
// Never shows a reservation category (seat or candidate): ResidentRow carries none.

type Hide = React.ComponentProps<typeof HideableRow>["hide"];

/** Around her rank: ±20%. */
export const rankAround = (rank: number) => ({ rankFrom: Math.max(1, Math.round(rank * 0.8)), rankTo: Math.round(rank * 1.2) });

/**
 * The page's URL → the search query, with her profile's defaults. URL keys are residentsQuery's, except the quota filter,
 * `rq` (`quota` is her profile's). `course=all` = every course; no `course` = her courses (when they are 1 to 20, the
 * query's cap; otherwise all). No `rankFrom`/`rankTo` = her rank ±20%, unless `ranks=all` (the "All ranks" link, and every
 * Apply but one from her default range, so clearing both fields means all ranks). Invalid values are dropped, as on
 * every Decide page.
 */
export function residentsFilters(params: URLSearchParams, profile: Profile | null, courses: Course[]) {
  const raw = new URLSearchParams();
  for (const [k, v] of params) if (k !== "quota") raw.append(k, k === "rankFrom" || k === "rankTo" ? v.replace(/[,\s]/g, "") : v);
  if (params.get("rq")) raw.set("quota", params.get("rq")!);
  const f = parseSearchParams(residentsQuery, raw, ["course"]);
  const mine = profile && (profile.pairs?.length || profile.specialties.length || profile.degrees.length) ? courses.filter((c) => profileHasCourse(profile, c)) : [];
  const yours = mine.length > 0 && mine.length <= 20;
  const allCourses = !!f.course?.includes("all");
  const course = allCourses ? undefined : f.course?.length ? f.course : yours ? mine.map((c) => c.slug) : undefined;
  const typed = f.rankFrom != null || f.rankTo != null;
  const around = profile && !typed && params.get("ranks") !== "all" ? rankAround(profile.rank) : null;
  let { rankFrom, rankTo } = around ?? f;
  if (rankFrom != null && rankTo != null && rankFrom > rankTo) [rankFrom, rankTo] = [rankTo, rankFrom];
  const query: ResidentsQuery = { ...f, course, rankFrom, rankTo };
  return { query, yours: yours ? mine : null, courseValue: allCourses ? "all" : f.course?.[0], around };
}

const roundName = (r: string) => roundLabel[r as Round] ?? r;
const courseName = (r: ResidentRow) => `${r.course.degree} ${r.course.name}`;
const tabHref = (L: DecideLinks, r: ResidentRow) => L.to(`/decide/institutes/${r.college.slug}`, { tab: "residents" });
const collegeLink = "inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline";

/**
 * A rank as "AIR 12,345 · 2024": All India Rank from that year's NBEMS NEET PG result. The year is the resident's: the
 * import only takes a rank from the same year's result. A dash when unknown.
 */
export function Rank({ rank, year }: { rank: number | null; year: number }) {
  if (rank == null) return <Dash />;
  return (
    <span className="numeric whitespace-nowrap">
      <span className="font-semibold">AIR {formatRank(rank)}</span>
      <span className="text-muted-foreground"> · {year}</span>
    </span>
  );
}

const th = `${tbl.th} px-3`;
const td = "px-3 py-2 align-top";

/** One page of residents as a table; the College cell opens that institute's Residents tab. */
export function ResidentsTable({ rows, L, hide, caption, className }: { rows: ResidentRow[]; L: DecideLinks; hide: Hide; caption: string; className?: string }) {
  return (
    <div role="region" aria-label="Residents table" tabIndex={0} className={cn(tbl.wrap, tbl.scroll, className)}>
      <table className={tbl.table}>
        <caption className="sr-only">{caption}</caption>
        <thead className={tbl.head}><tr className="text-left">
          <th scope="col" className={th}>Name</th>
          <th scope="col" className={`${th} text-right`}>Rank</th>
          <th scope="col" className={th}>College</th>
          <th scope="col" className={th}>Course</th>
          <th scope="col" className={th}>Year</th>
          <th scope="col" className={th}>List</th>
          <th scope="col" className={th}>Quota</th>
          <th scope="col" className={th}>Round</th>
          <th scope="col" className={th}><span className="sr-only">Hide</span></th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <HideableRow key={r.id} id={r.id} name={r.name} hide={hide} colSpan={9} className={tbl.row}>
              <th scope="row" className={`${td} min-w-36 text-left font-medium`}>{r.name}</th>
              <td className={`${td} text-right`}><Rank rank={r.rank} year={r.year} /></td>
              <td className={`${td} min-w-48`}>
                <Link href={tabHref(L, r)} className={collegeLink}>{r.college.name}<span className="sr-only">: its residents</span></Link>
                <span className="block text-xs text-muted-foreground">{r.college.state ?? <Dash />}</span>
              </td>
              <td className={`${td} min-w-32`}>{courseName(r)}</td>
              <td className={`${td} numeric`}>{r.year}</td>
              <td className={`${td} whitespace-nowrap`}>{r.list}</td>
              <td className={td}>{r.quota ?? <Dash />}</td>
              <td className={`${td} whitespace-nowrap`}>{r.round ? roundName(r.round) : <Dash />}</td>
            </HideableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The same page as cards (the Options cards' style), for phones. */
export function ResidentsCards({ rows, L, hide, className }: { rows: ResidentRow[]; L: DecideLinks; hide: Hide; className?: string }) {
  return (
    <ul aria-label="Residents" className={cn("grid gap-3 lg:grid-cols-2", className)}>
      {rows.map((r) => (
        <HideableCard key={r.id} id={r.id} name={r.name} hide={hide}>
          <h2 className="font-medium">{r.name}</h2>
          <p><Link href={tabHref(L, r)} className={cn(collegeLink, "min-h-11 text-sm")}>{r.college.name}<span className="sr-only">: its residents</span></Link></p>
          <p className="text-xs text-muted-foreground">{courseName(r)} · {r.college.state ?? "state not listed"}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-xs text-muted-foreground">Rank</dt><dd><Rank rank={r.rank} year={r.year} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Year</dt><dd className="numeric">{r.year}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Quota, round</dt><dd>{r.quota ?? <Dash />}{r.round && `, ${roundName(r.round)}`}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">MCC list: {r.list}</p>
        </HideableCard>
      ))}
    </ul>
  );
}

/** The (i): where names, ranks, quota and round come from, and how to have a name hidden. Native <details>. */
export function ResidentsInfo({ rows }: { rows: ResidentRow[] }) {
  const years = [...new Set(rows.filter((r) => r.rank != null).map((r) => r.year))].sort();
  const email = siteConfig.contactEmail;
  return (
    // The panel spans the nearest positioned box (the summary line), so it fits a 390 px screen. It covers the first rows
    // while open: Escape, a click outside or Tab away closes it.
    <ClosingDetails className="text-sm">
      <summary className="inline-flex size-11 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <Info className="size-4" aria-hidden /><span className="sr-only">About this data</span>
      </summary>
      <div tabIndex={-1} className="absolute inset-x-0 top-full z-10 mt-1 grid max-w-2xl gap-2 rounded-lg border border-border bg-card p-4 text-muted-foreground shadow-overlay outline-none">
        <p><strong className="text-foreground">Names</strong> are as printed in MCC&apos;s official admitted-candidates lists (the List column names which one). No contact details are held.</p>
        <p>
          <strong className="text-foreground">Ranks</strong> are All India Ranks from that year&apos;s NBEMS NEET PG result
          {years.length ? ` (on this page: ${years.join(", ")})` : " (none on this page has one)"}, where one could be matched; a dash where none is known. A rank is where one person got in, not a closing rank or a prediction.
        </p>
        <p><strong className="text-foreground">Quota and round</strong> come from the matching MCC allotment of that year, shown only where exactly one matched the resident&apos;s rank, college and course; otherwise a dash. Minority quotas show as &ldquo;Minority&rdquo;.</p>
        <p>Seat and candidate category are not held or shown here. MCC&apos;s public allotment results, which Rank journey and Allotments show, do list a category for each rank; Seatora never joins them to names.</p>
        <p>
          To have a name hidden, use <strong className="text-foreground">Hide</strong> beside it: it is hidden for every year and course at that college and stays hidden after updates
          {email ? <>, or write to <a href={`mailto:${email}`} className="text-sky underline">{email}</a></> : null}.
        </p>
      </div>
    </ClosingDetails>
  );
}

/**
 * The documents behind these rows, collapsed: the MCC admitted lists, then the NBEMS NEET PG results the ranks come from.
 * `sources` as the search returns them (DataSource: names and links); a row's document missing there is named from the
 * row, without a link.
 */
export function ResidentsSources({ rows, sources }: { rows: Pick<ResidentRow, "sourceKey" | "list" | "year" | "rankBasis">[]; sources: ResidentSource[] }) {
  const docs = new Map(sources.map((s) => [s.key, s]));
  for (const r of rows) {
    if (!docs.has(r.sourceKey)) docs.set(r.sourceKey, { key: r.sourceKey, name: `MCC admitted candidates list (${r.list})`, url: null, year: r.year });
    if (r.rankBasis && !docs.has(r.rankBasis)) docs.set(r.rankBasis, { key: r.rankBasis, name: `NBEMS NEET PG ${r.year} result`, url: null, year: r.year });
  }
  const merit = (s: ResidentSource) => s.key.startsWith("nbems/");
  const list = [...docs.values()].sort((a, b) => Number(merit(a)) - Number(merit(b)) || b.key.localeCompare(a.key));
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky">Sources on this page (<span className="numeric">{list.length}</span>)</summary>
      <ul className="grid gap-1">
        {list.map((s) => (
          <li key={s.key}><SourceLabel provenance={{ sourceName: s.name, sourceUrl: s.url, sourceType: "OFFICIAL", academicYear: `${merit(s) ? "NEET PG" : "PG counselling"} ${s.year ?? "—"}` }} /></li>
        ))}
      </ul>
      <p className="mt-1">
        MCC publishes the admitted lists on its <a href={MCC_PG} target="_blank" rel="noopener noreferrer" className="underline hover:text-sky">PG counselling site<span className="sr-only"> (opens in a new tab)</span></a>, NBEMS the NEET PG results on{" "}
        <a href="https://natboard.edu.in" target="_blank" rel="noopener noreferrer" className="underline hover:text-sky">natboard.edu.in<span className="sr-only"> (opens in a new tab)</span></a>.
      </p>
    </details>
  );
}
