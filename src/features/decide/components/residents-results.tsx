import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/cn";
import type { DecideLinks } from "../lib/links";
import { parseSearchParams } from "../lib/params";
import { profileHasCourse, type Profile } from "../profile";
import { residentsQuery, type ResidentRow, type ResidentsQuery } from "../residents-search";
import type { ResidentSource } from "../server/residents";
import type { Course } from "../types";
import { Dash } from "./bits";
import type { CollegeType } from "./institute/college-type";
import type { SourceDoc } from "./page-sources";
import { MCC_PG } from "./pages/mcc-link";
import { ResultCards } from "./result-card";
import { HideableCard, SyncedHideableRow } from "./residents-hideable-card";
import { TypeBadge } from "./type-badge";
import { tbl } from "./ui";

// The Residents tab across colleges (/decide/residents): its URL params, table, cards, (i) and sources.
// Never shows a reservation category (seat or candidate) or a rank: ResidentRow carries neither.

type Hide = React.ComponentProps<typeof SyncedHideableRow>["hide"];
/** College type by College.slug (hospitalInfo); a college missing here shows none. */
export type ResidentTypes = Map<string, CollegeType | null>;

/**
 * The page's URL → the search query, with her profile's defaults. URL keys are residentsQuery's, except the quota filter,
 * `rq` (`quota` is her profile's). `course` and `college` repeat (pick one or more). `course=all` = every course; no
 * `course` = her courses (when they are 1 to 20, the query's cap; otherwise all). Invalid values are dropped, as on every
 * Decide page.
 */
export function residentsFilters(params: URLSearchParams, profile: Profile | null, courses: Course[]) {
  const raw = new URLSearchParams();
  for (const [k, v] of params) if (k !== "quota") raw.append(k, v);
  if (params.get("rq")) raw.set("quota", params.get("rq")!);
  const f = parseSearchParams(residentsQuery, raw, ["course", "college", "name", "state", "year"]);
  const mine = profile && (profile.pairs?.length || profile.specialties.length || profile.degrees.length) ? courses.filter((c) => profileHasCourse(profile, c)) : [];
  const yours = mine.length > 0 && mine.length <= 20;
  const allCourses = !!f.course?.includes("all");
  const course = allCourses ? undefined : f.course?.length ? f.course : yours ? mine.map((c) => c.slug) : undefined;
  const query: ResidentsQuery = { ...f, course };
  return { query, yours: yours ? mine : null, allCourses };
}

const courseName = (r: ResidentRow) => `${r.course.degree} ${r.course.name}`;
const tabHref = (L: DecideLinks, r: ResidentRow) => L.to(`/decide/institutes/${r.college.slug}`, { tab: "residents" });
const collegeLink = "inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline";

const th = `${tbl.th} px-3`;
const td = "px-3 py-1.5 align-top";

/** One page of residents as a table; the College cell opens that institute's Residents tab. */
export function ResidentsTable({ rows, L, hide, caption, types }: { rows: ResidentRow[]; L: DecideLinks; hide: Hide; caption: string; types?: ResidentTypes }) {
  return (
    <div role="region" aria-label="Residents table" tabIndex={0} className={cn(tbl.wrap, tbl.scroll)}>
      <table className={tbl.table}>
        <caption className="sr-only">{caption}</caption>
        <thead className={tbl.head}><tr className="text-left">
          <th scope="col" className={th}>Name</th>
          <th scope="col" className={th}>College</th>
          <th scope="col" className={th}>Course</th>
          <th scope="col" className={th}>Year</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const type = types?.get(r.college.slug);
            return (
              <SyncedHideableRow key={r.id} id={r.id} name={r.name} hide={hide} colSpan={4} className={tbl.row}>
                <th scope="row" className={`${td} min-w-36 text-left font-medium`}>{r.name}</th>
                <td className={`${td} min-w-48`}>
                  <Link href={tabHref(L, r)} className={collegeLink}>{r.college.name}<span className="sr-only">: its residents</span></Link>
                  <span className="ml-2 inline-flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {r.college.state ?? <Dash />}
                    {type && <TypeBadge type={type} of={r.college.name} />}
                  </span>
                </td>
                <td className={`${td} min-w-32`}>{courseName(r)}</td>
                <td className={`${td} numeric`}>{r.year}</td>
              </SyncedHideableRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The same page as ResultCards: the year (and round) big on the left, the college (its Residents tab) and course, state
 * and type; the name, MCC list and quota in the header row.
 */
export function ResidentsCards({ rows, L, hide, types }: { rows: ResidentRow[]; L: DecideLinks; hide: Hide; types?: ResidentTypes }) {
  return (
    <ResultCards title="Residents" hideTitle>
      {rows.map((r) => {
        const type = types?.get(r.college.slug);
        return (
          <HideableCard
            key={r.id}
            id={r.id}
            name={r.name}
            hide={hide}
            chips={[<span key="n" className="text-sm font-semibold text-foreground">{r.name}</span>]}
            stat={{ label: "Year", value: <span className="numeric whitespace-nowrap">{r.year}</span> }}
            title={r.college.name}
            href={tabHref(L, r)}
            subtitle={courseName(r)}
            meta={[r.college.state, type && <TypeBadge type={type} of={r.college.name} />]}
          />
        );
      })}
    </ResultCards>
  );
}

const ext = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky underline">{text}<span className="sr-only"> (opens in a new tab)</span></a>
);

/** The page's (i) (PageHead `about`): where names, quota and round come from, and how to have a name hidden. */
export function ResidentsAbout() {
  const email = siteConfig.contactEmail;
  return (
    <>
      <strong>Names</strong> are as printed in MCC&apos;s official admitted-candidates lists (each row names its list), which MCC publishes. Any signed-in member can see them; visitors who are not signed in and search engines cannot. No contact details are held.
      <br /><br />
      No rank, quota, round, seat category or candidate category is shown here.
      <br /><br />
      Filter by <strong>college</strong> (the hospital) or by <strong>course</strong> (the branch), or both: type in either list to find one, and tick one or more.
      <br /><br />
      To have a name hidden, write to us{email ? <> at <a href={`mailto:${email}`} className="text-sky underline">{email}</a></> : null}: it is hidden for every year and course at that college and stays hidden after updates.
      <br /><br />
      MCC publishes the admitted lists on its {ext(MCC_PG, "PG counselling site")}: the documents behind this page are in its Sources.
    </>
  );
}

/**
 * The documents behind these rows, for the page's Sources footer: the MCC admitted lists, then (rows with `rankBasis`,
 * the institute's tab) the NBEMS NEET PG results the ranks come from. `sources` as the search returns them (names and links); a row's document missing there is named
 * from the row, without a link. Keys as the institute's Residents tab gives them, so each document is one entry.
 */
export function residentDocs(rows: (Pick<ResidentRow, "sourceKey" | "list" | "year"> & { rankBasis?: string | null })[], sources: ResidentSource[]): SourceDoc[] {
  const docs = new Map(sources.map((s) => [s.key, s]));
  for (const r of rows) {
    if (!docs.has(r.sourceKey)) docs.set(r.sourceKey, { key: r.sourceKey, name: `MCC admitted candidates list (${r.list})`, url: null, year: r.year });
    if (r.rankBasis && !docs.has(r.rankBasis)) docs.set(r.rankBasis, { key: r.rankBasis, name: `NBEMS NEET PG ${r.year} result`, url: null, year: r.year });
  }
  const merit = (s: ResidentSource) => s.key.startsWith("nbems/");
  return [...docs.values()]
    .sort((a, b) => Number(merit(a)) - Number(merit(b)) || b.key.localeCompare(a.key))
    .map((s) => ({ key: `residents|${s.key}`, name: s.name, url: s.url, type: "OFFICIAL", note: merit(s) ? `NEET PG ${s.year ?? "—"} rank source` : `PG counselling ${s.year ?? "—"}` }));
}
