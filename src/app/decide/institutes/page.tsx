import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, HistoryNote, PageHead, ReachBadge } from "@/features/decide/components/bits";
import { InfoTip } from "@/features/decide/components/info-tip";
import { SELF_REPORTED } from "@/features/decide/components/institute/hospital-bits";
import { Beds } from "@/features/decide/components/pages/beds";
import { hospitalInfo, institutesByTerms } from "@/features/decide/components/institute/institute-data";
import { ResultCard } from "@/features/decide/components/result-card";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { ActiveFilters, control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView } from "@/features/decide/server/view";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { readTermFilters, termChips, termValueLabel } from "@/features/decide/lib/term-filters";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, LATEST_YEAR, listInstitutes, PAST_YEARS } from "@/features/decide/service";

export const metadata: Metadata = { title: "Institutes" };
const PAGE_SIZE = 48; // splits evenly into 2, 3 and 4 columns
const PATH = "/decide/institutes";
const sorts = [
  { value: "name", label: "Name" },
  { value: "allotments", label: `Most allotments (${PAST_YEARS[1]})` },
  { value: "beds", label: "Most beds (as reported)" },
] as const;
const schema = z.object({
  q: z.string().max(100).optional(),
  state: z.array(z.string().max(100)).max(40).optional(), // pick one or more
  course: z.array(z.string().max(100)).max(40).optional(),
  sort: z.enum(["name", "allotments", "beds"]).default("name"),
  page: pageValue.default(1),
});


export default async function InstitutesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params, ["state", "course"]);
  const { params: tp, filters: tf } = readTermFilters(params, profile);
  const filters = { search: f.q, state: f.state, course: f.course, sort: f.sort === "beds" ? ("name" as const) : f.sort };
  const pg = { page: f.page, pageSize: PAGE_SIZE };
  const [meta, info, byTerms, view] = await Promise.all([getMeta(), hospitalInfo(), institutesByTerms(tf, f.course), chosenView(params, "institutes")]);
  // Term filters and the beds sort need the whole list here: then this page pages it.
  // ponytail: whole list, then a page (≈2,000 institutes, reach for her options only); move into listInstitutes if slow.
  const local = !!byTerms || f.sort === "beds";
  const got = await listInstitutes(profile, filters, local ? undefined : pg);
  let res = got;
  let unknown = 0;
  if (local) {
    const all = byTerms ? got.rows.filter((r) => byTerms.pass.has(r.college.key)) : got.rows;
    unknown = byTerms ? got.rows.filter((r) => byTerms.unknown.has(r.college.key)).length : 0;
    if (f.sort === "beds") all.sort((a, b) => (info.get(b.college.key)?.beds?.n ?? -1) - (info.get(a.college.key)?.beds?.n ?? -1) || a.college.name.localeCompare(b.college.name));
    const page = Math.min(Math.max(1, f.page), Math.max(1, Math.ceil(all.length / PAGE_SIZE)));
    res = { ...got, rows: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: all.length, page, pageSize: PAGE_SIZE };
  }

  const courseLabel = (slug: string) => {
    const c = meta.courses.find((x) => x.slug === slug);
    return c ? `${c.degree} ${c.name}` : slug;
  };
  const listed = (what: string, names: string[]) => (names.length > 2 ? `${what}: ${names.length} selected` : names.join(", "));
  const chips = [
    // Her profile's caps apply here as on Options and Fees (an absent maxfee / bondyrs is hers); "any" lifts one.
    ...(profile?.maxFeeLakh != null && tp.maxfee == null ? [{ label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, href: L.with(PATH, { maxfee: "any", page: null }) }] : []),
    ...(profile?.maxBondYears != null && tp.bondyrs == null ? [{ label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, href: L.with(PATH, { bondyrs: "any", page: null }) }] : []),
    ...(f.q ? [{ label: `“${f.q}”`, href: L.with(PATH, { q: null, page: null }) }] : []),
    ...(f.state?.length ? [{ label: listed("States", f.state), href: L.with(PATH, { state: null, page: null }) }] : []),
    ...(f.course?.length ? [{ label: listed("Courses", f.course.map(courseLabel)), href: L.with(PATH, { course: null, page: null }) }] : []),
    ...termChips(tp).map((c) => ({ label: c.label, href: L.with(PATH, { [c.key]: null, page: null }) })),
  ];
  const clear = L.with(PATH, { q: null, state: null, course: null, ctype: null, maxfee: null, minstip: null, bondyrs: null, maxbond: null, maxleave: null, nd: null, page: null });
  const bestOf = (r: (typeof res.rows)[number]) =>
    r.best && (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <ReachBadge reach={r.bestReach} provisional={r.best.provisional} />
        <span className="text-xs text-muted-foreground">{r.best.course.degree} {r.best.course.name}, {r.best.quota}</span>
      </span>
    );
  // The number opens that year's allotments on the institute's Allotments tab.
  const allot = (r: (typeof res.rows)[number], className?: string) =>
    r.allotments2025 != null ? (
      <Link href={L.institute(r.college.slug, "allotments", { year: PAST_YEARS[1] })} className={className}>
        {formatRank(r.allotments2025)}<span className="sr-only"> allotments in {PAST_YEARS[1]}: see them</span>
      </Link>
    ) : (
      <Dash />
    );

  const cards = (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
      {res.rows.map((r) => {
        const h = info.get(r.college.key);
        return (
          <li key={r.college.key} className="grid min-w-0">
            <ResultCard
              level={2}
              title={r.college.name}
              href={L.institute(r.college.slug)}
              external={h?.mccProfileUrl ? { href: h.mccProfileUrl, label: `MCC profile: ${r.college.name}` } : undefined}
              subtitle={bestOf(r)}
              meta={[
                r.college.state,
                r.college.pincode && <span key="pin">PIN <span className="numeric">{r.college.pincode}</span></span>,
                h?.type && <TypeBadge type={h.type} of={r.college.name} />,
                h?.beds && <Beds b={h.beds} inst={r.college.name} unit />,
              ]}
              footer={
                <div className="flex text-sm">
                  <dl className="grid flex-1 grid-cols-2">
                    <div className="grid px-4 py-1">
                      <dt className="flex items-center gap-0.5 pt-1 text-xs text-muted-foreground">
                        Courses
                        {r.courses.length > 0 && <InfoTip label={`courses, ${r.college.name}`}>{r.courses.map((c) => `${c.degree} ${c.name}`).join(" · ")}</InfoTip>}
                      </dt>
                      <dd><Link href={L.institute(r.college.slug, "courses")} className={`${smallLink} numeric font-semibold text-sky`}>{formatRank(r.courses.length)}<span className="sr-only"> courses: see them</span></Link></dd>
                    </div>
                    <div className="grid border-l border-border px-4 py-1">
                      <dt className="pt-1 text-xs text-muted-foreground">Allotments {PAST_YEARS[1]}</dt>
                      <dd className="numeric flex min-h-11 items-center font-semibold">{allot(r, `${smallLink} text-sky`)}</dd>
                    </div>
                  </dl>
                  <Link href={L.institute(r.college.slug, "fees")} className={`${smallLink} shrink-0 border-l border-border px-4 text-sky`}>Fees & bond</Link>
                </div>
              }
            />
          </li>
        );
      })}
    </ul>
  );

  const table = (
    <div role="region" aria-label="Institutes" tabIndex={0} className={`${tbl.wrap} ${tbl.scroll}`}>
      <table className={tbl.table}>
        <caption className="sr-only">Institutes, {rangeLabel(res)}</caption>
        <thead className={tbl.head}>
          <tr className={tbl.headRow}>
            <th scope="col" className={`${tbl.th} sticky left-0 z-[3] border-r border-border bg-card`}>Institute</th>
            <th scope="col" className={tbl.th}>State</th>
            <th scope="col" className={tbl.th}>Type</th>
            <th scope="col" className={`${tbl.th} text-right`}>Beds</th>
            <th scope="col" className={`${tbl.th} text-right`}>Courses</th>
            <th scope="col" className={`${tbl.th} text-right`}>Allotments {PAST_YEARS[1]}</th>
            {profile && <th scope="col" className={tbl.th}>Best</th>}
          </tr>
        </thead>
        <tbody>
          {res.rows.map((r) => {
            const h = info.get(r.college.key);
            return (
              <tr key={r.college.key} className={tbl.row}>
                <th scope="row" className={`${tbl.td} sticky left-0 z-[1] min-w-56 max-w-80 border-r border-border bg-card text-left font-medium`}>
                  <Link href={L.institute(r.college.slug)} className="hover:text-sky hover:underline">{r.college.name}</Link>
                </th>
                <td className={tbl.td}>{r.college.state ?? <Dash />}</td>
                <td className={`${tbl.td} whitespace-nowrap`}>{h?.type ? <TypeBadge type={h.type} of={r.college.name} /> : <Dash />}</td>
                <td className={`${tbl.num} whitespace-nowrap`}>{h?.beds ? <Beds b={h.beds} inst={r.college.name} /> : <Dash />}</td>
                <td className={tbl.num}><Link href={L.institute(r.college.slug, "courses")} className="text-sky hover:underline">{formatRank(r.courses.length)}</Link></td>
                <td className={tbl.num}>{allot(r, "text-sky hover:underline")}</td>
                {profile && <td className={tbl.td}>{bestOf(r) || <Dash />}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead
        title="Institutes"
        about={<>Every institute in the MCC results: where it is, its type and beds, the courses it offers and how many allotments were made there in {PAST_YEARS[1]} (all rounds and seat categories; not the number of seats). Open one for its courses, allotments, fees and bond.</>}
      />

      {/* Filters, the count and the results tools on one row (globals.css .filter-row); chips and notes under it. */}
      <div className="filter-row">
      <FilterBar
        action={PATH}
        params={params}
        cols="md:grid-cols-3 xl:grid-cols-4"
        active={chips.length}
        clear={clear}
        search={
          <label className="min-w-0 flex-1 basis-32 md:min-w-56">
            <span className="sr-only">Search institutes by name or state</span>
            <input type="search" name="q" defaultValue={f.q} placeholder="Search name or state" className={control} />
          </label>
        }
      >
        <FilterDropdown label="State" name="state" search options={meta.states.map((s) => ({ value: s, label: s }))} selected={f.state ?? []} none="All states" noneNote="None ticked means every state. Tick one or more." />
        <FilterDropdown label="Course" name="course" search options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} selected={f.course ?? []} none="Any course" noneNote="None ticked means any course. Tick one or more." />
        <Field label="Sort"><Select name="sort" value={f.sort} options={[...sorts]} /></Field>
        <TermFilterControls f={tp} caps={profile} />
      </FilterBar>
      <ActiveFilters items={chips} clear={clear} />

      <div className={toolbarRow}>
        <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
          <span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> institutes
          {unknown > 0 && (
            <>
              {" · "}<span className="numeric">{formatRank(unknown)}</span> without a published figure{" "}
              <Link href={L.with(PATH, { nd: "keep", page: null })} className={`${smallLink} text-sky`}>Include them</Link>
            </>
          )}
         <ColourLegend className="ml-1 align-middle" /></p>
        {res.total > 0 && <ViewToggle page="institutes" view={view} />}
      </div>
      </div>

      {res.total === 0 ? <EmptyState title="No institutes match these filters." href={L.to(PATH, { maxfee: "any", bondyrs: "any" })} /> : <ViewPanes page="institutes" view={view} cards={cards} table={table} />}

      <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page(PATH, n)} focusId="results" label="Institutes" />

      <div className="grid gap-1">
        {profile && <HistoryNote more="A card's badge is the best history among the options there that match your profile, with the course and quota it comes from." />}
        <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          Type: inferred from name and quota, or Seatora&apos;s research; not official. Beds: self-reported by the hospital.
          <InfoTip label="type and beds">
            College type is inferred from the institute&apos;s name and quotas, or comes from Seatora&apos;s research on the hospital (its badge says which); never an official field. Beds are what the hospital itself published ({SELF_REPORTED.toLowerCase()}); its Hospital facts tab gives the period, the source and the date Seatora checked it.
          </InfoTip>
        </p>
        <DataSource used={profile ? [{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR, round: "R1" }] : [{ year: PAST_YEARS[1] }]} />
      </div>
    </AppPage>
  );
}
