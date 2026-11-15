import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { CsvLink, toolbarRow } from "@/features/decide/components/csv-link";
import { NotDeclared, programmeTitle } from "@/features/decide/components/fees";
import { feeDefaults, feesFilters, feesParamsSchema } from "@/features/decide/components/fees-view";
import { InfoTip } from "@/features/decide/components/info-tip";
import { Beds } from "@/features/decide/components/pages/beds";
import { hospitalInfo } from "@/features/decide/components/institute/institute-data";
import { ResultCard, ResultCards } from "@/features/decide/components/result-card";
import { TermStatCells } from "@/features/decide/components/stat-cells";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { ActiveFilters, control, EmptyState, FilterBar, Pager, rangeLabel, Select, tbl } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView } from "@/features/decide/server/view";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { statKeys, statLabel, type StatKey } from "@/features/decide/lib/stat-format";
import { termChips, termFilterLists, termValueLabel } from "@/features/decide/lib/term-filters";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getDecideData, getMeta, listFees, type FeeSort } from "@/features/decide/service";
import { programmeNames, programmes } from "@/features/decide/server/terms";

export const metadata: Metadata = { title: "Fees & bond" };
const PAGE_SIZE = 50;
const schema = feesParamsSchema.extend({ page: pageValue.default(1) });
/** The table's stat columns (TermStatCells order) and the sort each header sets. */
const sortOf: Record<StatKey, Exclude<FeeSort, "name">> = { fee: "fee1", stipend: "stip1", bond: "bondyrs", bondInr: "bond", leaving: "leave" };
const sortLabel: Record<FeeSort, string> = { fee1: "fee, year 1", stip1: "stipend, year 1", bondyrs: "bond years", bond: "bond penalty", leave: "leaving penalty", feetotal: "whole-course fee", name: "institute name" };
/** Stipend sorts highest first by default, the rest lowest first. */
const natural = (k: FeeSort) => (k === "stip1" ? "desc" : "asc");
const arrow = (on: boolean, dir: string) => (on ? <span aria-hidden="true">{dir === "asc" ? " ↑" : " ↓"}</span> : null);
const bare = "grid min-w-0 text-sm";

export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params, termFilterLists);
  const profile = profileFromParams(params);
  const [meta, { courses }, info] = await Promise.all([getMeta(), getDecideData(), hospitalInfo()]);
  const d = feeDefaults(profile, courses);
  const [res, view] = await Promise.all([listFees(feesFilters(f, d), { page: f.page, pageSize: PAGE_SIZE }), chosenView(params, "fees")]);
  const { rows } = res;
  const dir = f.dir ?? natural(f.sort);
  const byName = f.sort === "name";
  const sortHref = (k: FeeSort) => L.with("/decide/fees", { sort: k, dir: f.sort === k ? (dir === "asc" ? "desc" : "asc") : natural(k), page: null });
  const ariaSort = (on: boolean) => (on ? (dir === "asc" ? "ascending" : "descending") : undefined);
  const years = (r: (typeof rows)[number]) => `${L.institute(r.college.slug, "fees")}#fees-${programmes[r.terms.programme].slug}`;
  const of = (r: (typeof rows)[number]) => `${r.college.name}, ${r.terms.programme}`;
  const without = (k: string) => L.with("/decide/fees", { [k]: null, page: null });
  const chips = [
    // Her profile's caps apply here (absent maxfee / bondyrs): a chip each, removed by "any".
    ...(d.maxFeeLakh != null && f.maxfee == null ? [{ label: `Your cap: ${termValueLabel.maxfee(d.maxFeeLakh)}`, href: L.with("/decide/fees", { maxfee: "any", page: null }) }] : []),
    ...(d.maxBondYears != null && f.bondyrs == null ? [{ label: `Your cap: ${termValueLabel.bondyrs(d.maxBondYears)}`, href: L.with("/decide/fees", { bondyrs: "any", page: null }) }] : []),
    ...termChips(f).map((c) => ({ label: c.label, href: without(c.key) })),
    ...(f.q ? [{ label: `“${f.q}”`, href: without("q") }] : []),
    ...(f.bdecl ? [{ label: f.bdecl === "declared" ? "Bond declared" : "No bond on record", href: without("bdecl") }] : []),
  ];

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
            key={`${r.college.key}-${t.programme}`}
            title={r.college.name}
            href={years(r)}
            external={h?.mccProfileUrl ? { href: h.mccProfileUrl, label: `MCC profile: ${r.college.name}` } : undefined}
            subtitle={programmeTitle(t)}
            meta={[
              r.college.state ?? "State not listed",
              h?.type && <TypeBadge type={h.type} of={r.college.name} />,
              h?.beds && <Beds b={h.beds} inst={r.college.name} of={of(r)} unit />,
            ]}
            footer={<TermStatCells t={t} of={of(r)} />}
          />
        );
      })}
    </ResultCards>
  );

  const table = (
    <div role="region" aria-label="Fees, stipend and bond table" tabIndex={0} className={`${tbl.wrap} ${tbl.scroll}`}>
      <table className={tbl.table}>
        <caption className="sr-only">Fees a year and stipend a month for years 1 to 3, service bond and leaving penalty by institute and programme, page {res.page}. The whole-course fee is in each Fee (i).</caption>
        <thead className={tbl.head}><tr className={tbl.headRow}>
          {sortTh("name", "Institute", "sticky left-0 z-10 bg-card text-left")}
          {statKeys.flatMap((k) =>
            k === "fee" || k === "stipend"
              ? [
                  sortTh(sortOf[k], `${statLabel[k]} Y1`),
                  ...[2, 3].map((y) => (
                    <th key={`${k}${y}`} scope="col" className={`${tbl.th} text-right`}>
                      Y{y}<span className="sr-only"> {statLabel[k].toLowerCase()}{k === "fee" ? " a year" : " a month"}</span>
                    </th>
                  )),
                ]
              : [sortTh(sortOf[k], statLabel[k])],
          )}
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const t = r.terms;
            const type = info.get(r.college.key)?.type;
            return (
              <tr key={`${r.college.key}-${t.programme}`} className={tbl.row}>
                {/* z-[1]: above the cells' (i) buttons (positioned) as they scroll under it. */}
                <th scope="row" className={`${tbl.td} sticky left-0 z-[1] min-w-48 max-w-72 bg-card text-left font-medium`}>
                  <Link href={years(r)} className="hover:text-sky hover:underline">{r.college.name}</Link>
                  <span className="mt-0.5 block font-normal">{programmeTitle(t)}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    {r.college.state ?? <NotDeclared what="state not available" />}
                    {type && <TypeBadge type={type} of={r.college.name} />}
                  </span>
                </th>
                <TermStatCells t={t} variant="table" years of={of(r)} tdClassName="text-[15px]" />
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
        title="Fees, stipend and bond"
        about={
          <>
            <strong>Fee</strong>: a year, from the college&apos;s MCC profile (the table: years 1 to 3). &quot;Up to ₹1.25 L&quot;: a DNB
            hospital that declared none; the most NBEMS lets it charge (no GST, paid to the hospital), not its own fee. &quot;Varies by
            subject&quot;, &quot;On college website&quot;, &quot;Not stated&quot;: the profile gives no one figure for these seats; its
            words are in the (i). The whole-course fee is in the Fee (i).
            <br /><strong>Stipend</strong>: a month, before tax. &quot;From ₹…&quot;: the NBEMS floor; the pay may be higher.
            <br /><strong>Bond period</strong>: years to serve after the course; <strong>Bond penalty</strong>: what you pay if you don&apos;t serve
            it (a range where it varies by specialty; sorting and filters use the highest).
            <br /><strong>Leaving penalty</strong>: the penalty for leaving the seat or course after joining. MCC&apos;s Round 2 forfeit is on
            each institute&apos;s Fees tab.
            <br />&quot;—&quot;: none published, never zero or &quot;no bond&quot;. &quot;No bond&quot; only where the
            college&apos;s document or the NBEMS rule says so; &quot;Not published&quot; where Seatora&apos;s check found no clear answer.
            &quot;state law may apply&quot;: the college&apos;s document says no bond, but a state law&apos;s service may apply
            (the filters count it as not published).
            <br />Sorting: — and figures without a number go last either way. Each figure&apos;s (i) gives its exact words, other years and source.
          </>
        }
      >
        — means none published.
      </PageHead>

      {/* min-w-0: TermFilterControls' selects are sized for a flex bar; in this grid each takes its cell. */}
      {/* Filters, the count and the results tools on one row (globals.css .filter-row); chips and notes under it. */}
      <div className="filter-row">
      <FilterBar
        action="/decide/fees"
        params={params}
        cols="md:grid-cols-3 xl:grid-cols-4 [&>label]:min-w-0"
        active={chips.length}
        clear={L.to("/decide/fees")}
        search={
          <label className="grid min-w-0 flex-1 basis-32 text-sm md:min-w-56">
            <span className="sr-only">Institute or state</span>
            <input name="q" type="search" defaultValue={f.q ?? ""} placeholder="Search institute or state" className={control} />
          </label>
        }
      >
        <label className={bare}>
          <span className="sr-only">Programme</span>
          <Select name="program" value={f.program} all={d.programmes ? `Your profile: ${d.programmes.join(", ")}` : "All programmes"}
            options={[...(d.programmes ? [{ value: "all", label: "All programmes" }] : []), ...programmeNames.map((p) => ({ value: programmes[p].slug, label: p }))]} />
        </label>
        <label className={bare}>
          <span className="sr-only">State</span>
          <Select name="state" value={f.state} all={d.states ? `Your profile: ${d.states.join(", ")}` : "All states"}
            options={[...(d.states ? [{ value: "all", label: "All states" }] : []), ...meta.states.map((s) => ({ value: s, label: s }))]} />
        </label>
        <TermFilterControls f={f} caps={d} />
        <label className={bare}>
          <span className="sr-only">Sort by</span>
          <Select name="sort" value={f.sort} options={(Object.keys(sortLabel) as FeeSort[]).map((k) => ({ value: k, label: `Sort: ${sortLabel[k]}` }))} />
        </label>
        <label className={bare}>
          <span className="sr-only">Order</span>
          <Select name="dir" value={f.dir} all={`Order: ${byName ? "A to Z" : natural(f.sort) === "desc" ? "highest first" : "lowest first"}`}
            options={[{ value: "asc", label: byName ? "A to Z" : "Lowest first" }, { value: "desc", label: byName ? "Z to A" : "Highest first" }]} />
        </label>
      </FilterBar>
      <ActiveFilters items={chips} clear={L.to("/decide/fees")} />

      <div className={toolbarRow}>
        <h2 id="results" tabIndex={-1} aria-live="polite" className="flex flex-wrap items-center gap-x-1 text-sm font-normal text-muted-foreground">
          <span><span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> programmes</span>
          {res.undeclared > 0 && <InfoTip label="these programmes"><span className="numeric">{formatRank(res.undeclared)}</span> of them have no published figures (every figure is —).</InfoTip>}
          {res.unknownTerms > 0 && (
            <span>
              · <span className="numeric">{formatRank(res.unknownTerms)}</span> without a published figure left out:{" "}
              <Link href={L.with("/decide/fees", { nd: "keep", page: null })} className="text-sky underline">include them</Link>
            </span>
          )}
         <ColourLegend className="ml-1 align-middle" /></h2>
        {res.total > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle page="fees" view={view} />
            <CsvLink href={`/api/v1/fees/export?${params}`} what={`these ${formatRank(res.total)} programmes`} />
          </div>
        )}
      </div>
      </div>

      {res.total === 0 ? (
        <EmptyState title="Nothing matches these filters." href={L.to("/decide/fees", { program: "all", state: "all", maxfee: "any", bondyrs: "any" })} />
      ) : (
        <div><ViewPanes page="fees" view={view} cards={cards} table={table} /></div>
      )}
      <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page("/decide/fees", n)} focusId="results" label="Fees" />
    </AppPage>
  );
}
