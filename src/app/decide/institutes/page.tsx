import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, HISTORY_CAPTION, PageHead, ReachBadge } from "@/features/decide/components/bits";
import { control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, LATEST_YEAR, listInstitutes, PAST_YEARS } from "@/features/decide/service";

export const metadata: Metadata = { title: "Institutes" };
const PAGE_SIZE = 48; // splits evenly into 2, 3 and 4 columns
const MAX_COURSES = 6;
const sorts = [
  { value: "name", label: "Name" },
  { value: "allotments", label: `Most allotments (${PAST_YEARS[1]})` },
] as const;
const schema = z.object({
  q: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  course: z.string().max(100).optional(),
  sort: z.enum(["name", "allotments"]).default("name"),
  page: pageValue.default(1),
});

export default async function InstitutesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const [meta, res] = await Promise.all([
    getMeta(),
    listInstitutes(profile, { search: f.q, state: f.state, course: f.course, sort: f.sort }, { page: f.page, pageSize: PAGE_SIZE }),
  ]);

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Institutes">
        Every institute in the MCC results: where it is, the courses it offers and how many allotments were made there in {PAST_YEARS[1]} (all rounds and seat categories; not the number of seats). Open one for its courses, allotments, fees and bond.
      </PageHead>

      <FilterBar action="/decide/institutes" params={params} cols="md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Field label="Search"><input name="q" defaultValue={f.q} placeholder="Name or state" className={control} /></Field>
        <Field label="State"><Select name="state" value={f.state} all="All states" options={meta.states.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="Offers course"><Select name="course" value={f.course} all="Any course" options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
        <Field label="Sort by"><Select name="sort" value={f.sort} options={[...sorts]} /></Field>
      </FilterBar>

      <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
        <span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> institutes
      </p>

      {res.total === 0 ? (
        <EmptyState title="No institutes match these filters." href={L.to("/decide/institutes")} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
          {res.rows.map((r) => (
            <li key={r.college.key}>
              <article className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold leading-snug"><Link href={L.institute(r.college.slug)} className="hover:text-sky hover:underline">{r.college.name}</Link></h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{r.college.state ?? <Dash />}{r.college.pincode && <>, PIN <span className="numeric">{r.college.pincode}</span></>}</p>
                  </div>
                </div>
                {r.best && (
                  <div className="mt-3 text-sm">
                    <ReachBadge reach={r.bestReach} provisional={r.best.provisional} />
                    <span className="mt-1 block text-xs text-muted-foreground">{r.best.course.degree} {r.best.course.name}, {r.best.quota}</span>
                  </div>
                )}
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <div><dt className="text-xs text-muted-foreground">Courses</dt><dd className="numeric text-lg font-bold">{formatRank(r.courses.length)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Allotments {PAST_YEARS[1]}</dt><dd className="numeric text-lg font-bold">{r.allotments2025 != null ? formatRank(r.allotments2025) : <Dash />}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  {r.courses.slice(0, MAX_COURSES).map((c) => `${c.degree} ${c.name}`).join(" · ")}
                  {r.courses.length > MAX_COURSES && ` · and ${r.courses.length - MAX_COURSES} more`}
                </p>
                <p className="mt-auto flex flex-wrap gap-x-4 pt-2 text-sm">
                  <Link href={L.institute(r.college.slug, "courses")} className={`${smallLink} text-sky`}>Courses</Link>
                  <Link href={L.institute(r.college.slug, "allotments")} className={`${smallLink} text-sky`}>Allotments</Link>
                  <Link href={L.institute(r.college.slug, "fees")} className={`${smallLink} text-sky`}>Fees & bond</Link>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}

      <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page("/decide/institutes", n)} focusId="results" label="Institutes" />

      <div className="grid gap-2 text-xs text-muted-foreground">
        {profile && <p>A card&apos;s badge is the best history among the options there that match your profile, with the course and quota it comes from. {HISTORY_CAPTION}</p>}
        <DataSource used={profile ? [{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR, round: "R1" }] : [{ year: PAST_YEARS[1] }]} />
      </div>
    </AppPage>
  );
}
