import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { AboutData } from "@/features/decide/components/filter-form";
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
import { getMeta, listInstitutes } from "@/features/decide/service";
import { ScrollTable } from "@/features/decide/components/scroll-table";
import { activeExam, examInfo } from "@/features/exams/active";
import { headYearIn, latestOf } from "@/features/exams/registry";
import { quotaIn } from "@/features/exams/exam";
import { iniCetIn, iniWord } from "@/features/decide/lib/college-aliases";

export const metadata: Metadata = { title: "Institutes" };
const PAGE_SIZE = 24; // splits evenly into 2, 3 and 4 columns; small enough for a phone to paint fast
const PATH = "/decide/institutes";
const sortsFor = (last: number) => [
  { value: "name", label: "Name" },
  { value: "allotments", label: `Most allotments (${last})` },
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
  const pg = { page: f.page, pageSize: PAGE_SIZE };
  const exam = await activeExam();
  const E = await examInfo(exam);
  const { latestYear: LATEST_YEAR, pastYears: PAST_YEARS } = E;
  const [meta, info, byTerms, view] = await Promise.all([getMeta(exam), hospitalInfo(exam), institutesByTerms(tf, f.course, exam), chosenView(params, "institutes")]);
  // Allotments of the latest complete year (NEET PG: its later past year, as before).
  const HEAD = headYearIn(exam, meta.sources);
  // NEET MDS: no hospital beds (dental colleges): no Beds column or sort.
  const sorts = sortsFor(HEAD).filter((s) => E.has.beds || s.value !== "beds");
  const latest = latestOf(meta.sources, exam);
  // Term filters and the beds sort narrow and order the list before it is paged, so reach is read for one page only.
  const filters = { search: f.q, state: f.state, course: f.course, sort: f.sort, only: byTerms?.pass, bedsOf: (key: string) => info.get(key)?.beds?.n };
  const [res, unknown] = await Promise.all([
    listInstitutes(profile, filters, pg, exam),
    byTerms ? listInstitutes(null, { ...filters, only: byTerms.unknown }, { page: 1, pageSize: 1 }, exam).then((r) => r.total) : 0,
  ]);

  const courseLabel = (slug: string) => {
    const c = meta.courses.find((x) => x.slug === slug);
    return c ? `${c.degree} ${c.name}` : slug;
  };
  const chips = [
    // Her profile's caps apply here as on Options and Fees (an absent maxfee / bondyrs is hers); "any" lifts one.
    ...(profile?.maxFeeLakh != null && tp.maxfee == null ? [{ label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, param: "maxfee", href: L.with(PATH, { maxfee: "any", page: null }) }] : []),
    ...(profile?.maxBondYears != null && tp.bondyrs == null ? [{ label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, param: "bondyrs", href: L.with(PATH, { bondyrs: "any", page: null }) }] : []),
    ...(f.q ? [{ label: `“${f.q}”`, param: "q", href: L.with(PATH, { q: null, page: null }) }] : []),
    // One chip per state and course: the × takes that one out.
    ...(f.state ?? []).map((s) => ({ label: s, param: "state", href: L.without(PATH, "state", s) })),
    ...(f.course ?? []).map((c) => ({ label: courseLabel(c), param: "course", href: L.without(PATH, "course", c) })),
    ...termChips(tp).map((c) => ({ label: c.label, param: c.key, href: c.value ? L.without(PATH, c.key, c.value) : L.with(PATH, { [c.key]: null, page: null }) })),
  ];
  const clear = L.with(PATH, { q: null, state: null, course: null, ctype: null, maxfee: null, minstip: null, bondyrs: null, maxbond: null, maxleave: null, nd: null, page: null });
  const bestOf = (r: (typeof res.rows)[number]) =>
    r.best && (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <ReachBadge reach={r.bestReach} provisional={r.best.provisional} latest={latest} />
        <span className="text-xs text-muted-foreground">{r.best.course.degree} {r.best.course.name}, {quotaIn(E, r.best.quota)}</span>
      </span>
    );
  // The number opens that year's allotments on the institute's Allotments tab.
  const allot = (r: (typeof res.rows)[number], className?: string) =>
    r.allotments2025 != null ? (
      <Link href={L.institute(r.college.slug, "allotments", { year: HEAD })} className={className}>
        {formatRank(r.allotments2025)}<span className="sr-only"> allotments in {HEAD}: see them</span>
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
                      {/* No (i) listing the courses: the count opens them (24 cards of course lists weighed down the page). */}
                      <dt className="pt-1 text-xs text-muted-foreground">Courses</dt>
                      <dd><Link href={L.institute(r.college.slug, "courses")} className={`${smallLink} numeric min-w-11 font-semibold text-sky`}>{formatRank(r.courses.length)}<span className="sr-only"> courses: see them</span></Link></dd>
                    </div>
                    <div className="grid border-l border-border px-4 py-1">
                      <dt className="pt-1 text-xs text-muted-foreground">Allotments {HEAD}</dt>
                      <dd className="numeric flex min-h-11 items-center font-semibold">{allot(r, `${smallLink} min-w-11 text-sky`)}</dd>
                    </div>
                  </dl>
                  {E.has.fees && <Link href={L.institute(r.college.slug, "fees")} className={`${smallLink} shrink-0 border-l border-border px-4 text-sky`}>Fees & bond</Link>}
                </div>
              }
            />
          </li>
        );
      })}
    </ul>
  );

  const table = (
    <ScrollTable label="Institutes">
      <table className={tbl.table}>
        <caption className="sr-only">Institutes, {rangeLabel(res)}</caption>
        <thead className={tbl.head}>
          <tr className={tbl.headRow}>
            <th scope="col" className={`${tbl.th} sticky left-0 z-[3] border-r border-border bg-card ${tbl.pin}`}>Institute</th>
            <th scope="col" className={tbl.th}>State</th>
            <th scope="col" className={tbl.th}>Type</th>
            {E.has.beds && <th scope="col" className={`${tbl.th} text-right`}>Beds</th>}
            <th scope="col" className={`${tbl.th} text-right`}>Courses</th>
            <th scope="col" className={`${tbl.th} text-right`}>Allotments {HEAD}</th>
            {profile && <th scope="col" className={tbl.th}>Best</th>}
          </tr>
        </thead>
        <tbody>
          {res.rows.map((r) => {
            const h = info.get(r.college.key);
            return (
              <tr key={r.college.key} className={tbl.row}>
                <th scope="row" className={`${tbl.td} sticky left-0 z-[1] min-w-56 max-w-80 border-r border-border bg-card text-left font-medium ${tbl.pin}`}>
                  <Link href={L.institute(r.college.slug)} title={r.college.name} className={`wrap-anywhere hover:text-sky hover:underline ${tbl.clamp}`}>{r.college.name}</Link>
                </th>
                <td className={tbl.td}>{r.college.state ?? <Dash />}</td>
                <td className={`${tbl.td} whitespace-nowrap`}>{h?.type ? <TypeBadge type={h.type} of={r.college.name} /> : <Dash />}</td>
                {E.has.beds && <td className={`${tbl.num} whitespace-nowrap`}>{h?.beds ? <Beds b={h.beds} inst={r.college.name} /> : <Dash />}</td>}
                <td className={tbl.num}><Link href={L.institute(r.college.slug, "courses")} className="text-sky hover:underline">{formatRank(r.courses.length)}</Link></td>
                <td className={tbl.num}>{allot(r, "text-sky hover:underline")}</td>
                {profile && <td className={tbl.td}>{bestOf(r) || <Dash />}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollTable>
  );

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead
        title="Institutes"
        about={<>Every institute in the MCC results: where it is, its type{E.has.beds && " and beds"}, the courses it offers and how many allotments were made there in {HEAD} (all rounds and seat categories; not the number of seats). Open one for its courses, allotments{E.has.fees ? ", fees and bond" : ""}.</>}
      />

      {/* Filters, the count and the results tools on one row (globals.css .filter-row); chips and notes under it. */}
      <div className="filter-row">
      <FilterBar
        action={PATH}
        params={params}
        active={chips.length}
        clear={clear}
        total={res.total}
        noun="institutes"
        search={
          <label className="min-w-0">
            <span className="sr-only">Search institutes by name or state</span>
            <input type="search" name="q" defaultValue={f.q} placeholder="Name or state" className={control} />
          </label>
        }
      >
        <FilterDropdown label="State" name="state" search options={meta.states.map((s) => ({ value: s, label: s }))} selected={f.state ?? []} none="All states" />
        <FilterDropdown label="Course" name="course" search options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} selected={f.course ?? []} none="Any course" />
        <Field label="Sort"><Select name="sort" value={f.sort} options={[...sorts]} /></Field>
        {E.has.fees && <TermFilterControls f={tp} caps={profile} />}
      </FilterBar>
      <ActiveFilters items={chips} clear={clear} />

      <div className={toolbarRow}>
        <AboutData>
        <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
          <span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> institutes
          {unknown > 0 && (
            <>
              {" · "}<span className="numeric">{formatRank(unknown)}</span> without a published figure{" "}
              <Link href={L.with(PATH, { nd: "keep", page: null })} className={`${smallLink} text-sky`}>Include them</Link>
            </>
          )}
         <ColourLegend className="ml-1 align-middle" /></p>
        </AboutData>
        {res.total > 0 && <ViewToggle page="institutes" view={view} />}
      </div>
      </div>

      {/* A search naming an INI institute (AIIMS, JIPMER, NIMHANS, PGIMER Chandigarh): why it isn't here, every exam. */}
      {iniCetIn(f.q) && <p role="note" className="text-sm text-muted-foreground">{iniCetIn(f.q)} admits through {iniWord(exam)}, not MCC&apos;s {E.label} counselling, so it is not in MCC&apos;s data.</p>}
      {res.total === 0 ? <EmptyState title="No institutes match these filters." href={L.to(PATH, { maxfee: "any", bondyrs: "any" })} /> : <ViewPanes page="institutes" view={view} cards={cards} table={table} />}

      <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page(PATH, n)} focusId="results" label="Institutes" />

      <div className="grid gap-1">
        {profile && <HistoryNote more="A card's badge is the best history among the options there that match your profile, with the course and quota it comes from." />}
        <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          Type: inferred from name and quota, or Seatora&apos;s research; not official.{E.has.beds && " Beds: self-reported by the hospital."}
          <InfoTip label={E.has.beds ? "type and beds" : "type"}>
            College type is inferred from the institute&apos;s name and quotas, or comes from Seatora&apos;s research on the hospital (its badge says which); never an official field.{E.has.beds && <> Beds are what the hospital itself published ({SELF_REPORTED.toLowerCase()}); its Hospital facts tab gives the period, the source and the date Seatora checked it.</>}
          </InfoTip>
        </p>
        <DataSource used={profile ? [{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR }] : [{ year: HEAD }]} />
      </div>
    </AppPage>
  );
}
