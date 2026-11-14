import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/ui/source-label";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Closing, Dash, HISTORY_CAPTION, PageHead, Provisional, ReachBadge, TermText } from "@/features/decide/components/bits";
import { ChoiceStar, CompareToggle } from "@/features/decide/components/option-actions";
import { HideableRow } from "@/features/decide/components/residents/hideable-row";
import { courseName, RoundGrid, toChoiceItem } from "@/features/decide/components/options-view";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, StatStrip, tbl } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getCollege, getInstitute, getMeta, LATEST_YEAR, listAllotments, PAST_YEARS, type OptionTerms } from "@/features/decide/service";
import { canSeeResidents, groupResidents, listResidents, residentsBudget } from "@/features/decide/server/residents";
import { roundLabel, termLabel } from "@/features/decide/types";
import { hideResidentAction } from "./actions";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const tabs = [
  { key: "overview", label: "Overview" },
  { key: "courses", label: "Courses" },
  { key: "allotments", label: "Allotments" },
  { key: "fees", label: "Fees & bond" },
  { key: "clinical", label: "Clinical data" },
  { key: "residents", label: "Residents" },
] as const;
const PAGE_SIZE = 50;
const schema = z.object({
  tab: z.enum(["overview", "courses", "allotments", "fees", "clinical", "residents"]).default("overview"),
  year: z.coerce.number().int().optional(),
  course: z.string().max(100).optional(),
  page: pageValue.default(1),
});
const kinds = ["FEE", "STIPEND", "BOND", "PENALTY"] as const;
const termOf = (t: OptionTerms, k: (typeof kinds)[number]) => ({ FEE: t.fee, STIPEND: t.stipend, BOND: t.bond, PENALTY: t.penalty })[k];

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const college = await getCollege((await params).slug).catch(() => null);
  // People's names: never indexed.
  const robots = parseSearchParams(schema, toURLSearchParams(await searchParams)).tab === "residents" ? { index: false, follow: false } : undefined;
  return { title: college?.name ?? "Institute", robots };
}

/** Fee, stipend, bond and seat-leaving penalty for one programme, each as published with its own source link. */
function Terms({ title, t }: { title: string; t: OptionTerms }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      {!kinds.some((k) => termOf(t, k)) ? (
        <p className="mt-2 text-sm text-muted-foreground">Not offered here, or not listed.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          {kinds.map((k) => (
            <Fragment key={k}>
              <dt className="text-muted-foreground">{termLabel[k]}</dt>
              <dd className="numeric font-semibold"><TermText term={termOf(t, k)} /></dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

export default async function InstitutePage({ params, searchParams }: Props) {
  const sp = toURLSearchParams(await searchParams);
  const profile = profileFromParams(sp);
  const L = decideLinks(sp);
  const slug = (await params).slug;
  const f = parseSearchParams(schema, sp);
  const [inst, meta] = await Promise.all([getInstitute(slug, profile), getMeta()]);
  if (!inst) notFound();
  const { college, options, yours, allotmentsByYear, terms } = inst;
  const tab = f.tab;
  const yearInfo = (y: number) => meta.years.find((x) => x.year === y);
  const maxN = Math.max(1, ...allotmentsByYear.map((a) => a.n ?? 0));
  const courses = [...new Map(options.map((o) => [o.course.slug, o.course])).values()];
  const listed = profile ? yours : options;
  const allotYear = yearInfo(f.year ?? 0)?.year;
  const allotCourse = courses.find((c) => c.slug === f.course)?.slug;

  const n2025 = allotmentsByYear.find((a) => a.year === PAST_YEARS[1])?.n ?? null;
  const nLatest = allotmentsByYear.find((a) => a.year === LATEST_YEAR)?.n ?? null;

  // Allotments tab: one page from SQL; a page past the end shows the last page.
  const allotQ = { year: allotYear, course: allotCourse };
  let allot = null;
  let allotPage = 1;
  if (tab === "allotments") {
    allot = await listAllotments(allotQ, PAGE_SIZE, college.key, (f.page - 1) * PAGE_SIZE);
    allotPage = Math.min(f.page, Math.max(1, Math.ceil(allot.total / PAGE_SIZE)));
    if (allotPage < f.page) allot = await listAllotments(allotQ, PAGE_SIZE, college.key, (allotPage - 1) * PAGE_SIZE);
  }
  // ponytail: every row on one page (largest institute ~930 rows, ~1.6 MB HTML); add a course filter if that grows.
  const residentsAccess = tab !== "residents" ? null : !(await canSeeResidents()) ? "locked" : !(await residentsBudget("read")) ? "limited" : "ok";
  const residents = residentsAccess === "ok" ? await listResidents(college.key) : null;
  const residentGroups = residents ? groupResidents(residents.rows, profile) : [];
  const residentYears = [...new Set(residents?.rows.map((r) => r.year))].sort((a, b) => b - a);
  const termSources = [...kinds.map((k) => termOf(terms.md, k)?.source), ...kinds.map((k) => termOf(terms.dnb, k)?.source)];

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={L.institutes()} className={smallLink}>Institutes</Link>
          {college.state && <> / <Link href={L.institutes({ state: college.state })} className={smallLink}>{college.state}</Link></>}
        </p>
        <PageHead title={college.name} />
        <p className="mt-2 max-w-3xl text-muted-foreground">
          <span className="text-sm">Address as printed by MCC: </span>{college.address ?? <Dash />}
        </p>
      </div>

      <SubTabs label="Institute sections" current={tab} items={tabs.map((t) => ({ key: t.key, label: t.label, href: L.to(`/decide/institutes/${slug}`, { tab: t.key }) }))} />

      {tab === "overview" && (
        <>
          <StatStrip
            items={[
              { label: "Courses here", value: formatRank(courses.length) },
              { label: "Course and quota options", value: formatRank(options.length) },
              { label: `Allotments in ${PAST_YEARS[1]}`, value: n2025 != null ? formatRank(n2025) : <Dash />, note: "All rounds and seat categories; not seats" },
              // Four cells fill the strip: hers when she has a profile, else the latest year's allotments.
              profile
                ? { label: "In your profile", value: formatRank(yours.length), note: "Your courses, quotas, states and caps" }
                : { label: `Allotments in ${yearInfo(LATEST_YEAR)?.label ?? LATEST_YEAR}`, value: nLatest != null ? formatRank(nLatest) : <Dash />, note: "All seat categories; not seats" },
            ]}
          />

          <section aria-labelledby="yours" className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="yours" className="text-lg font-semibold">{profile ? "Your options here" : "Courses and quotas here"}</h2>
              <Link href={L.institute(slug, "courses")} className={`${smallLink} text-sm text-sky`}>All course details</Link>
            </div>
            {listed.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None of the courses and quotas here match your profile. <Link href={L.institute(slug, "courses")} className={`${smallLink} text-sky`}>See every course here</Link></p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {listed.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>
                      <span className="font-medium">{courseName(o)}</span> <span className="text-sm text-muted-foreground">{o.quota}</span>
                      <span className="flex gap-4 text-sm">
                        <Link href={L.lastRanks(o.course.slug, { inst: slug })} className={`${smallLink} text-sky`}>Last ranks</Link>
                        <Link href={L.institute(slug, "allotments", { course: o.course.slug })} className={`${smallLink} text-sky`}>Allotments</Link>
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      {profile && <ReachBadge reach={o.reach} provisional={!!o.latest?.provisional} />}
                      <span className="text-right"><span className="block text-xs text-muted-foreground">{PAST_YEARS[1]} deepest</span><Closing d={o.byYear[PAST_YEARS[1]]} /></span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{HISTORY_CAPTION}{!profile && " Closing ranks shown across all seat categories."}</p>
          </section>

          <section aria-labelledby="trend" className="rounded-xl border border-border bg-card p-5">
            <h2 id="trend" className="text-lg font-semibold">Allotments made by year</h2>
            <p className="mt-1 text-sm text-muted-foreground">All courses, rounds and seat categories here. This counts allotments, not seats.</p>
            <table className="mt-4 w-full max-w-xl text-sm">
              <caption className="sr-only">Allotments made by year at {college.name}</caption>
              <tbody>
                {allotmentsByYear.map((a) => (
                  <tr key={a.year}>
                    <th scope="row" className="w-48 py-1.5 text-left font-normal text-muted-foreground">{yearInfo(a.year)?.label ?? a.year}</th>
                    <td className="py-1.5">{a.n != null && <div className="h-3 rounded-r-[4px] bg-mark" style={{ width: `${(a.n / maxN) * 100}%` }} aria-hidden />}</td>
                    <td className="numeric w-16 py-1.5 text-right font-semibold">{a.n != null ? formatRank(a.n) : <Dash />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <DataSource used={[...PAST_YEARS.map((year) => ({ year })), { year: LATEST_YEAR }]} />
        </>
      )}

      {tab === "courses" && (
        <section aria-labelledby="courses-h" className="grid grid-cols-1 gap-3">
          <h2 id="courses-h" className="sr-only">Courses</h2>
          <div role="region" aria-label="Courses offered" tabIndex={0} className={tbl.wrap}>
            <table className={tbl.table}>
              <caption className="sr-only">Courses at {college.name}, with past closing ranks</caption>
              <thead>
                <tr className={tbl.headRow}>
                  <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Add to choices</span></th>
                  <th scope="col" className={tbl.th}>Course and quota</th>
                  <th scope="col" className={tbl.th}>{profile ? "Your reach" : "Reach"}</th>
                  <th scope="col" className={`${tbl.th} text-right`}>{LATEST_YEAR} R1</th>
                  <th scope="col" className={`${tbl.th} text-right`}>{PAST_YEARS[1]} deepest</th>
                  <th scope="col" className={tbl.th}>Related</th>
                  <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Compare</span></th>
                </tr>
              </thead>
              <tbody>
                {options.flatMap((r) => [
                  <tr key={r.id} className={`expand-host ${tbl.row}`}>
                    {/* Without a rank the reach is unknown, so nothing would be saved with the choice: star only with a profile. */}
                    <td className="px-2 py-2">{profile && <ChoiceStar item={toChoiceItem(r)} />}</td>
                    <th scope="row" className={`${tbl.td} text-left font-medium`}>{courseName(r)}<span className="block text-xs font-normal text-muted-foreground">{r.quota}</span></th>
                    <td className={tbl.td}>{profile ? <ReachBadge reach={r.reach} provisional={!!r.latest?.provisional} /> : <span className="text-xs text-muted-foreground">Set your rank to see</span>}</td>
                    <td className={tbl.num}>
                      <Closing d={r.latest} />
                      {/* ReachBadge already carries the marker for "Reached in R1". */}
                      <Provisional when={r.latest?.provisional && !(profile && r.reach === "reached-latest")} />
                    </td>
                    <td className={tbl.num}><Closing d={r.byYear[PAST_YEARS[1]]} /></td>
                    <td className={`${tbl.td} whitespace-nowrap`}>
                      <details><summary className="cursor-pointer py-3 text-sky">Rounds by year</summary></details>
                      <span className="flex gap-x-3">
                        <Link href={L.lastRanks(r.course.slug, { inst: slug })} className={`${smallLink} text-sky`}>Last ranks</Link>
                        <Link href={L.institute(slug, "allotments", { course: r.course.slug })} className={`${smallLink} text-sky`}>Allotments</Link>
                      </span>
                    </td>
                    <td className="px-2 py-2"><CompareToggle id={r.id} label={`${college.name}, ${courseName(r)}, ${r.quota}`} /></td>
                  </tr>,
                  <tr key={`${r.id}-rounds`} className="expand-row bg-muted/30">
                    <td />
                    <td colSpan={6} className="px-4 pb-4"><RoundGrid row={r} caption={`${courseName(r)}, ${r.quota}: closing ranks by year and round`} /></td>
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{HISTORY_CAPTION}{profile ? " Closing ranks are on the seat categories you can take." : " Closing ranks shown across all seat categories."}</p>
          <DataSource />
        </section>
      )}

      {tab === "allotments" && allot && (
        <section aria-labelledby="allot-h" className="grid grid-cols-1 gap-4">
          <h2 id="allot-h" className="sr-only">Allotments</h2>
          <FilterBar action={`/decide/institutes/${slug}`} params={sp} cols="md:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="tab" value="allotments" />
            <Field label="Year"><Select name="year" value={allotYear ? String(allotYear) : undefined} all="All years" options={meta.years.map((y) => ({ value: String(y.year), label: y.label }))} /></Field>
            <Field label="Course"><Select name="course" value={allotCourse} all="All courses" options={courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
          </FilterBar>
          <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
            <span className="numeric font-semibold text-foreground">{rangeLabel({ ...allot, page: allotPage, pageSize: PAGE_SIZE })}</span> allotments at this institute, newest first. Ranks only, never names.{" "}
            <Link href={L.allotments({ inst: slug, course: allotCourse, year: allotYear })} className={`${smallLink} text-sky`}>Open in Allotments, with fees and more filters</Link>
          </p>
          {allot.total === 0 ? (
            <EmptyState title="No allotments match these filters." href={L.institute(slug, "allotments")} />
          ) : (
            <div role="region" aria-label="Allotments at this institute" tabIndex={0} className={tbl.wrap}>
              <table className={tbl.table}>
                <caption className="sr-only">Allotments at {college.name}</caption>
                <thead><tr className={tbl.headRow}>
                  <th scope="col" className={`${tbl.th} text-right`}>Rank</th><th scope="col" className={tbl.th}>Year and round</th><th scope="col" className={tbl.th}>Course</th><th scope="col" className={tbl.th}>Quota</th><th scope="col" className={tbl.th}>Seat category</th><th scope="col" className={tbl.th}>Remark</th>
                </tr></thead>
                <tbody>
                  {allot.rows.map((a, i) => (
                    <tr key={i} className={tbl.row}>
                      <td className={tbl.num}><Link href={L.rankScan(a.rank, a.year)} className="hover:text-sky hover:underline" title="Scan ranks around this one">{formatRank(a.rank)}</Link></td>
                      <td className={`${tbl.td} whitespace-nowrap`}><span className="numeric">{a.year}</span> {roundLabel[a.round]} <Provisional when={a.provisional} /></td>
                      <td className={tbl.td}><Link href={L.lastRanks(a.courseSlug, { inst: slug })} className="hover:text-sky hover:underline">{a.courseName}</Link></td>
                      <td className={tbl.td}>{a.quota}</td>
                      <td className={tbl.td}>{a.category}</td>
                      <td className={`${tbl.td} text-muted-foreground`}>{a.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={allotPage} pageSize={PAGE_SIZE} total={allot.total} href={(n) => L.page(`/decide/institutes/${slug}`, n)} focusId="results" label="Allotments" />
          <p className="text-xs text-muted-foreground">Select a rank to scan the allotments around it that year.</p>
          <DataSource used={[...new Map(allot.rows.map((a) => [`${a.year}|${a.round}`, { year: a.year, round: a.round }])).values()]} />
        </section>
      )}

      {tab === "fees" && (
        <section aria-labelledby="fees-h" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <h2 id="fees-h" className="sr-only">Fees, stipend, bond and seat-leaving penalty</h2>
          <Terms title="Medical college seats (MD, MS, Diploma)" t={terms.md} />
          <Terms title="DNB and NBEMS Diploma seats" t={terms.dnb} />
          <p className="text-xs text-muted-foreground md:col-span-2">Each value is quoted as published, with a link to its document. Missing values show as a dash.</p>
          {college.state && <p className="text-sm md:col-span-2"><Link href={L.fees({ state: college.state })} className={`${smallLink} text-sky`}>Compare fees with other institutes in {college.state}</Link></p>}
          <div className="md:col-span-2"><DataSource terms={termSources} results={false} /></div>
        </section>
      )}

      {tab === "clinical" && (
        <EmptyState
          title="Clinical data not collected yet"
          description="Outpatient and inpatient numbers, bed occupancy and operating theatres aren't in the data yet. For DNB hospitals they will come from their NBEMS mandatory disclosures."
          href={L.institute(slug, "courses")}
          action="See the courses here"
        />
      )}
      {residentsAccess === "locked" && (
        <EmptyState title="Sign in to see residents" description="Names are shown only to the signed-in, invited account." href={L.institute(slug, "courses")} action="See the courses here" />
      )}
      {residentsAccess === "limited" && (
        <EmptyState title="Too many requests" description="Residents were opened too many times from this network. Try again in an hour." href={L.institute(slug, "courses")} action="See the courses here" />
      )}
      {tab === "residents" && residents && (
        <section aria-labelledby="res-h" className="grid grid-cols-1 gap-4">
          <h2 id="res-h" className="sr-only">Residents</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            From MCC&apos;s official admitted-candidates lists. Shown for choosing a college — contact people respectfully; ask to be hidden and we will.
          </p>
          {residents.total === 0 ? (
            <EmptyState title="No residents listed here" description="MCC's admitted-candidates lists have no names at this institute, or they were hidden." href={L.institute(slug, "courses")} action="See the courses here" />
          ) : (
            <>
              <div role="region" aria-label="Residents by course and year" tabIndex={0} className={tbl.wrap}>
                <table className={tbl.table}>
                  <caption className="sr-only">Residents at {college.name} by course and year</caption>
                  <thead><tr className={tbl.headRow}>
                    <th scope="col" className={tbl.th}>Course</th>
                    {residentYears.map((y) => <th key={y} scope="col" className={`${tbl.th} text-right`}>{y}</th>)}
                    <th scope="col" className={`${tbl.th} text-right`}>Total</th>
                  </tr></thead>
                  <tbody>
                    {residentGroups.map((g) => (
                      <tr key={g.course.slug} className={tbl.row}>
                        <th scope="row" className={`${tbl.td} text-left font-medium`}><a href={`#res-${g.course.slug}`} className="hover:text-sky hover:underline">{g.course.degree} {g.course.name}</a></th>
                        {residentYears.map((y) => {
                          const n = g.years.find((x) => x.year === y)?.rows.length;
                          return <td key={y} className={tbl.num}>{n ? formatRank(n) : <Dash />}</td>;
                        })}
                        <td className={tbl.num}>{formatRank(g.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {residentGroups.map((g) => (
                <section key={g.course.slug} aria-labelledby={`res-${g.course.slug}`} className="grid gap-2">
                  <h3 id={`res-${g.course.slug}`} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    {g.course.degree} {g.course.name} <span className="numeric text-sm font-normal text-muted-foreground">{formatRank(g.total)}</span>
                    {profile && g.mine && <Badge tone="info">In your profile</Badge>}
                  </h3>
                  <div role="region" aria-label={`Residents, ${g.course.degree} ${g.course.name}`} tabIndex={0} className={tbl.wrap}>
                    <table className={tbl.table}>
                      <caption className="sr-only">Residents in {g.course.degree} {g.course.name} at {college.name}, newest year first</caption>
                      <thead><tr className={tbl.headRow}>
                        <th scope="col" className={tbl.th}>Name</th><th scope="col" className={tbl.th}>Year</th><th scope="col" className={tbl.th}>MCC list</th>
                        <th scope="col" className={`${tbl.th} text-right`}>2025 AIR</th><th scope="col" className={tbl.th}><span className="sr-only">Hide</span></th>
                      </tr></thead>
                      {g.years.map((y) => (
                        <tbody key={y.year}>
                          <tr className="border-b border-border bg-muted/40"><th scope="rowgroup" colSpan={5} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground"><span className="numeric">{y.year}</span> · {formatRank(y.rows.length)}</th></tr>
                          {y.rows.map((r) => (
                            <HideableRow key={r.id} id={r.id} name={r.name} hide={hideResidentAction} colSpan={5} className={tbl.row}>
                              <th scope="row" className={`${tbl.td} text-left font-medium`}>{r.name}</th>
                              <td className={`${tbl.td} numeric`}>{r.year}</td>
                              <td className={tbl.td}>{r.list}</td>
                              <td className={tbl.num}>{r.rank != null ? formatRank(r.rank) : <Dash />}</td>
                            </HideableRow>
                          ))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                </section>
              ))}
              <p className="text-xs text-muted-foreground">2025 AIR: the All India Rank in NBEMS&apos;s NEET PG 2025 merit list, where known. It is where one person got in, not a closing rank or a prediction. No contact details are held.</p>
            </>
          )}
          <div className="grid gap-1">
            {residents.sources.map((s) => (
              <SourceLabel key={s.key} provenance={{ sourceName: s.name, sourceUrl: s.url, sourceType: "OFFICIAL", academicYear: `PG counselling ${s.year ?? "—"}` }} />
            ))}
          </div>
        </section>
      )}
    </AppPage>
  );
}
