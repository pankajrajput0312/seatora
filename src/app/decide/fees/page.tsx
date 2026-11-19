import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { InstName, PageHead } from "@/features/decide/components/bits";
import { CsvLink, toolbarRow } from "@/features/decide/components/csv-link";
import { NotDeclared, programmeTitle } from "@/features/decide/components/fees";
import { feeDefaults, feesFilters, feesParamsSchema } from "@/features/decide/components/fees-view";
import { InfoTip } from "@/features/decide/components/info-tip";
import { Beds } from "@/features/decide/components/pages/beds";
import { hospitalInfo } from "@/features/decide/components/institute/institute-data";
import { ResultCard, ResultCards } from "@/features/decide/components/result-card";
import { TermStatCells } from "@/features/decide/components/stat-cells";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { courseFilter } from "@/features/decide/lib/course-filter";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { AboutData } from "@/features/decide/components/filter-form";
import { ActiveFilters, control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, tbl } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView, pageSizeFor } from "@/features/decide/server/view";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { MISSING_WORDS, NOT_PUBLISHED, statKeys, statLabel, type StatKey } from "@/features/decide/lib/stat-format";
import { termChips, termFilterLists, termValueLabel } from "@/features/decide/lib/term-filters";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getDecideData, getMeta, listFees, type FeeSort } from "@/features/decide/service";
import { examProgrammes, programmes } from "@/features/decide/server/terms";
import { ScrollTable } from "@/features/decide/components/scroll-table";
import { activeExam, examGate } from "@/features/exams/active";
import { DEFAULT_EXAM, exams } from "@/features/exams/registry";

export const metadata: Metadata = { title: "Fees & bond" };
const PAGE_SIZE = 50; // a phone: 25 (pageSizeFor)
const schema = feesParamsSchema.extend({ page: pageValue.default(1) });
/** The table's stat columns (TermStatCells order) and the sort each header sets. */
const sortOf: Record<StatKey, Exclude<FeeSort, "name">> = { fee: "fee1", stipend: "stip1", bond: "bondyrs", bondInr: "bond", leaving: "leave" };
const sortLabel: Record<FeeSort, string> = { fee1: "fee a year", stip1: "stipend, year 1", bondyrs: "bond years", bond: "bond penalty", leave: "leaving penalty", feetotal: "whole-course fee", name: "institute name" };
/** Stipend sorts highest first by default, the rest lowest first. */
const natural = (k: FeeSort) => (k === "stip1" ? "desc" : "asc");
const arrow = (on: boolean, dir: string) => (on ? <span aria-hidden="true">{dir === "asc" ? " ↑" : " ↓"}</span> : null);

export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gated = await examGate("/decide/fees");
  if (gated) return gated;
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params, termFilterLists);
  const profile = profileFromParams(params);
  // The exam's (NEET PG, or another exam's once its data has fees: examGate): its courses, programmes and fee records.
  const exam = await activeExam();
  const [meta, { courses }, info] = await Promise.all([getMeta(exam), getDecideData(exam), hospitalInfo(exam)]);
  const d = feeDefaults(profile, courses, exam);
  // Her courses by default (one row per institute × course, its own terms), "All courses" for whole programmes.
  const cf = courseFilter(params, profile, meta.courses);
  const [res, view] = await Promise.all([listFees({ ...feesFilters(f, d), courses: cf.slugs ?? undefined }, { page: f.page, pageSize: await pageSizeFor(PAGE_SIZE) }, exam), chosenView(params, "fees")]);
  const noun = cf.slugs ? "courses" : "programmes";
  /** The row's course ("DNB Family Medicine"), else its whole programme ("DNB, every course"). */
  const rowTitle = (r: (typeof rows)[number]) => (r.course ? `${r.course.degree} ${r.course.name}` : `${programmeTitle(r.terms)}, every course`);
  const { rows } = res;
  const dir = f.dir ?? natural(f.sort);
  const byName = f.sort === "name";
  const sortHref = (k: FeeSort) => L.with("/decide/fees", { sort: k, dir: f.sort === k ? (dir === "asc" ? "desc" : "asc") : natural(k), page: null });
  const ariaSort = (on: boolean) => (on ? (dir === "asc" ? "ascending" : "descending") : undefined);
  const years = (r: (typeof rows)[number]) => `${L.institute(r.college.slug, "fees")}#fees-${programmes[r.terms.programme].slug}`;
  const of = (r: (typeof rows)[number]) => `${r.college.name}, ${rowTitle(r)}`;
  const without = (k: string) => L.with("/decide/fees", { [k]: null, page: null });
  const chips = [
    ...cf.chips((v) => L.with("/decide/fees", { course: v, page: null }), (s) => L.without("/decide/fees", "course", s)),
    // Her profile's caps apply here (absent maxfee / bondyrs): a chip each, removed by "any".
    ...(d.maxFeeLakh != null && f.maxfee == null ? [{ label: `Your cap: ${termValueLabel.maxfee(d.maxFeeLakh)}`, param: "maxfee", href: L.with("/decide/fees", { maxfee: "any", page: null }) }] : []),
    ...(d.maxBondYears != null && f.bondyrs == null ? [{ label: `Your cap: ${termValueLabel.bondyrs(d.maxBondYears)}`, param: "bondyrs", href: L.with("/decide/fees", { bondyrs: "any", page: null }) }] : []),
    ...termChips(f).map((c) => ({ label: c.label, param: c.key, href: c.value ? L.without("/decide/fees", c.key, c.value) : without(c.key) })),
    ...(f.q ? [{ label: `“${f.q}”`, param: "q", href: without("q") }] : []),
    ...(f.bdecl ? [{ label: f.bdecl === "declared" ? "Bond declared" : "No bond on record", href: without("bdecl") }] : []),
  ];

  const total = exam !== DEFAULT_EXAM;
  const sortTh = (k: FeeSort, label: string, cls = "text-right") => {
    const on = f.sort === k;
    return (
      <th key={k} scope="col" className={`${tbl.th} ${cls}`} aria-sort={ariaSort(on)}>
        <Link href={sortHref(k)} className="inline-flex min-h-11 items-center hover:text-foreground"><span className="sr-only">Sort by </span>{label}{arrow(on, dir)}</Link>
      </th>
    );
  };

  const cards = (
    <ResultCards title="Fees, stipend and bond" hideTitle>
      {rows.map((r) => {
        const t = r.terms;
        const h = info.get(r.college.key);
        return (
          <ResultCard
            key={`${r.college.key}-${t.programme}-${r.course?.slug ?? ""}`}
            title={r.college.name}
            href={years(r)}
            external={h?.mccProfileUrl ? { href: h.mccProfileUrl, label: `MCC profile: ${r.college.name}` } : undefined}
            subtitle={rowTitle(r)}
            meta={[
              r.college.state ?? "State not listed",
              <TypeBadge key="type" type={h?.type} of={r.college.name} />,
              h?.beds && <Beds b={h.beds} inst={r.college.name} of={of(r)} unit />,
            ]}
            footer={<TermStatCells t={t} of={of(r)} />}
          />
        );
      })}
    </ResultCards>
  );

  const table = (
    <ScrollTable label="Fees, stipend and bond table">
      <table className={tbl.table}>
        <caption className="sr-only">Fees a year and stipend a month for years 1 to 3, service bond and leaving penalty by institute and programme, page {res.page}. {total ? "The whole-course fee: the Fee total column." : "The whole-course fee is in each Fee (i)."}</caption>
        <thead className={tbl.head}><tr className={tbl.headRow}>
          {sortTh("name", "Institute", `sticky left-0 z-10 bg-card text-left ${tbl.pin}`)}
          {statKeys.flatMap((k) =>
            k === "fee" || k === "stipend"
              ? [
                  sortTh(sortOf[k], `${statLabel[k]} Y1`),
                  ...[2, 3].map((y) => (
                    <th key={`${k}${y}`} scope="col" className={`${tbl.th} text-right`}>
                      Y{y}<span className="sr-only"> {statLabel[k].toLowerCase()}{k === "fee" ? " a year" : " a month"}</span>
                    </th>
                  )),
                  // Another exam: the whole course's fee as a column of its own (NEET PG: in the Fee (i), as before).
                  ...(k === "fee" && total ? [sortTh("feetotal", "Fee total")] : []),
                ]
              : [sortTh(sortOf[k], statLabel[k])],
          )}
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const t = r.terms;
            const type = info.get(r.college.key)?.type;
            return (
              <tr key={`${r.college.key}-${t.programme}-${r.course?.slug ?? ""}`} className={tbl.row}>
                {/* z-[1]: above the cells' (i) buttons (positioned) as they scroll under it. */}
                {/* Phones: narrow (tbl.pin), the name on two lines, the programme, no state line. */}
                <th scope="row" className={`${tbl.td} sticky left-0 z-[1] min-w-48 max-w-72 bg-card text-left font-medium ${tbl.pin}`}>
                  <Link href={years(r)} title={r.college.name} className="hover:text-sky hover:underline"><InstName name={r.college.name} state={r.college.state} /></Link>
                  <span className="mt-0.5 block font-normal max-md:text-xs">{rowTitle(r)}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground max-md:hidden">
                    {r.college.state ?? <NotDeclared />}
                    <TypeBadge type={type} of={r.college.name} />
                  </span>
                </th>
                <TermStatCells t={t} variant="table" years total={total} of={of(r)} tdClassName="text-[15px]" />
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
        title="Fees, stipend and bond"
        about={
          <>
            <strong>Fee</strong>: a year (/yr){exam === "ini-cet" ? ", as the institute's INI-CET prospectus prints it" : `, as the college declared it on its MCC institute profile (${exams[exam].label})`}; the whole course is in the Fee (i). <strong>Stipend</strong>: a month (/mo).
            <br /><strong>Bond period</strong>: years to serve after the course; <strong>Bond penalty</strong>: what you pay if you don&apos;t; <strong>Leaving penalty</strong>: what you pay if you leave after joining.
            <br />{MISSING_WORDS} Sorting puts {NOT_PUBLISHED} last either way; each figure&apos;s (i) gives its exact words and source.
          </>
        }
        more={
          exam === DEFAULT_EXAM ? (
            <>
              &quot;At admission (Year 1)&quot;: MCC&apos;s form gives the amount paid at admission, and later years differ or are not published. &quot;Up to ₹1.25 L&quot;: a DNB
              hospital that declared none; the most NBEMS lets it charge (no GST, paid to the hospital), not its own fee. &quot;From ₹…&quot; stipend: the NBEMS floor; the pay may be higher.
              A bond penalty that varies by specialty shows its range; sorting and filters use the highest. MCC&apos;s Round 2 forfeit is on each institute&apos;s Fees tab.
              <br />The bond is one of three: &quot;No bond&quot; only where the college&apos;s document or the NBEMS rule says so (&quot;No bond declared&quot;: a DNB hospital that declared none to MCC, which NBEMS&apos;s rule lets impose none this session); a stated bond (its years, or &quot;Bond, years not stated&quot;); or &quot;Not known&quot;:
              a document that says no bond while a state law&apos;s service may apply, or no record (the (i) says which; the filters count it as not published).
            </>
          ) : exam === "ini-cet" ? (
            <>Bond and leaving penalty: as the prospectus states them (&quot;Not known&quot;: it neither states nor rules out service after the course).</>
          ) : (
            <>Bond: from MCC&apos;s institute list: &quot;No bond&quot;, a stated bond, &quot;No bond declared&quot; (a DrNB hospital that declared none to MCC: NBEMS&apos;s rule lets it impose none this session), or &quot;Not known&quot; (a bond document Seatora couldn&apos;t read, read it before you lock; a blank form or one with no clear bond; a D.M. / M.Ch. or MDS seat with none declared: the (i) says which). MCC&apos;s Round 2 forfeit is on each institute&apos;s Fees tab.</>
          )
        }
      >
        Year 1 fee, stipend, bond and penalties by course and quota.
      </PageHead>

      {/* Filters, the count and the results tools on one row (globals.css .filter-row); chips and notes under it. */}
      <div className="filter-row">
      <FilterBar
        action="/decide/fees"
        params={params}
        active={chips.length}
        clear={L.to("/decide/fees")}
        total={res.total}
        noun={noun}
        search={
          <label className="grid min-w-0 text-sm">
            <span className="sr-only">Institute or state</span>
            <input name="q" type="search" defaultValue={f.q ?? ""} placeholder="Institute or state" className={control} />
          </label>
        }
      >
        <FilterDropdown label="Course" name="course" search options={cf.choices} selected={cf.selected} none={cf.none} info={cf.mine.length ? "None ticked means your courses: a row per institute and course, with that course's own terms. Tick All courses for whole programmes." : undefined} />
        <Field label="Programme">
          <Select name="program" value={f.program} all={d.programmes ? `Your profile: ${d.programmes.join(", ")}` : "All programmes"}
            options={[...(d.programmes ? [{ value: "all", label: "All programmes" }] : []), ...examProgrammes(exam).map((p) => ({ value: programmes[p].slug, label: p }))]} />
        </Field>
        <Field label="State">
          <Select name="state" value={f.state} all={d.states ? `Your profile: ${d.states.join(", ")}` : "All states"}
            options={[...(d.states ? [{ value: "all", label: "All states" }] : []), ...meta.states.map((s) => ({ value: s, label: s }))]} />
        </Field>
        <TermFilterControls f={f} caps={d} />
        <Field label="Sort by">
          <Select name="sort" value={f.sort} options={(Object.keys(sortLabel) as FeeSort[]).map((k) => ({ value: k, label: sortLabel[k][0].toUpperCase() + sortLabel[k].slice(1) }))} />
        </Field>
        <Field label="Order">
          <Select name="dir" value={f.dir} all={byName ? "A to Z" : natural(f.sort) === "desc" ? "Highest first" : "Lowest first"}
            options={[{ value: "asc", label: byName ? "A to Z" : "Lowest first" }, { value: "desc", label: byName ? "Z to A" : "Highest first" }]} />
        </Field>
      </FilterBar>
      <ActiveFilters items={chips} clear={L.to("/decide/fees")} />

      <div className={toolbarRow}>
        <AboutData>
        <h2 id="results" tabIndex={-1} aria-live="polite" className="flex flex-wrap items-center gap-x-1 text-sm font-normal text-muted-foreground">
          <span><span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> {noun}</span>
          {res.undeclared > 0 && <InfoTip label="these programmes"><span className="numeric">{formatRank(res.undeclared)}</span> of them have no published figures (every figure is —).</InfoTip>}
          {res.unknownTerms > 0 && (
            <span>
              · <span className="numeric">{formatRank(res.unknownTerms)}</span> without a published figure left out:{" "}
              <Link href={L.with("/decide/fees", { nd: "keep", page: null })} className="text-sky underline">include them</Link>
            </span>
          )}
         <ColourLegend className="ml-1 align-middle" /></h2>
        </AboutData>
        {res.total > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle page="fees" view={view} />
            {/* /api/v1 is NEET PG's: another exam has no CSV yet. */}
            {exam === DEFAULT_EXAM && <CsvLink href={`/api/v1/fees/export?${params}`} what={`these ${formatRank(res.total)} ${noun}`} />}
          </div>
        )}
      </div>
      </div>

      {res.total === 0 ? (
        <EmptyState title="Nothing matches these filters." href={L.to("/decide/fees", { course: "all", program: "all", state: "all", maxfee: "any", bondyrs: "any" })} />
      ) : (
        <div><ViewPanes page="fees" view={view} cards={cards} table={table} /></div>
      )}
      <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page("/decide/fees", n)} focusId="results" label="Fees" />
    </AppPage>
  );
}
