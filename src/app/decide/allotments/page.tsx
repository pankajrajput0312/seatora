import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Beds, PrevSeatCell } from "@/features/decide/components/allotments/allotment-cells";
import { AllotmentsDisplay } from "@/features/decide/components/allotments/allotments-display";
import { allotmentCategories, allotmentsView, statusLabel, type AllotmentRow } from "@/features/decide/components/allotments/allotments-view";
import { AppPage } from "@/features/decide/components/app-page";
import { CsvLink, toolbarRow } from "@/features/decide/components/csv-link";
import { Dash, PageHead, Provisional } from "@/features/decide/components/bits";
import { DataSource } from "@/features/decide/components/data-source";
import { termDocs } from "@/features/decide/components/fees";
import { ResultCard, ResultCards } from "@/features/decide/components/result-card";
import { StatHead, TermStatCells } from "@/features/decide/components/stat-cells";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { ActiveFilters, control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { VIEW_PARAM, ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView } from "@/features/decide/server/view";
import { decideLinks } from "@/features/decide/lib/links";
import { statKeys, statLabel } from "@/features/decide/lib/stat-format";
import { termChips, termValueLabel } from "@/features/decide/lib/term-filters";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { roundLabel, rounds } from "@/features/decide/types";

export const metadata: Metadata = { title: "Allotments" };
const PAGE_SIZE = 50;
// Columns the Display menu can hide (rank, round and institute always show), in table order: the numbers first.
const cols = [
  ...statKeys.map((k) => ({ key: k, label: statLabel[k] })),
  { key: "quota", label: "Quota" },
  { key: "seat", label: "Seat category" },
  { key: "cand", label: "Candidate category" },
  { key: "option", label: "Choice no." },
  { key: "status", label: "Status" },
  { key: "prev", label: "Previous seat" },
];

/** The page's (i) beside its title: what a row is and what each part means. */
const about = (
  <>
    Every allotment in MCC&apos;s result PDFs, newest year first, then round and rank. Ranks only, never names. With no filter
    the page opens on the latest round: pick All years under Year for every round. Select a rank to
    scan the allotments around it that year, Journey for that rank&apos;s seat in every round of the year, a course for its last
    ranks at that institute.<br /><br />
    Seat category is the seat&apos;s; candidate category the candidate&apos;s own, as the PDF prints it (an OBC, SC, ST or EWS
    candidate often holds an Open seat). Status: allotted (R1 and stray rounds), fresh or upgraded (R2, R3). Choice no. and the
    previous seat (the one held a round earlier, with the remark printed there) are in R2 and R3 results only, and those list
    only new or upgraded allotments.<br /><br />
    Fee, stipend, bond and leaving penalty are that seat&apos;s course and quota as published (DNB seats follow NBEMS; MD, MS
    and Diploma seats the college); each (i) has the exact words and source. College type is inferred, not official; beds are
    self-reported by the hospital.
  </>
);

export default async function AllotmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const [v, view] = await Promise.all([allotmentsView(params, PAGE_SIZE), chosenView(params, "allotments")]);
  if (!v) notFound();
  const { f, meta, inst, typed, rankError, latest, filters } = v;
  const { rows, total, page, unknownTerms } = v.r;
  // Her profile's caps apply here as on Options and Fees (an absent maxfee / bondyrs is hers: allotmentsView).
  const caps = profileFromParams(params);
  const rankInput = (name: "from" | "to") => ({
    name,
    inputMode: "numeric" as const,
    defaultValue: typed(name) ?? "",
    "aria-invalid": rankError ? true : undefined,
    "aria-describedby": rankError ? "rank-error" : undefined,
    className: `${control} numeric`,
  });
  const th = `${tbl.th} px-3`;
  const td = "px-3 py-2 align-top";
  const short = `${td} whitespace-nowrap`;
  // The rank stays in view while the row scrolls sideways.
  const stick = "sticky left-0 z-[1] border-r border-border bg-card";
  // Chips for the filters she set (the page's own default, the latest round, is not one); the institute has its own line.
  const here = (changes: Record<string, string | null>) => L.with("/decide/allotments", { page: null, ...changes });
  const set = (k: string) => !!params.get(k)?.trim();
  const course = meta.courses.find((c) => c.slug === filters.course);
  const ranks = filters.from != null && filters.to != null ? `Ranks ${formatRank(filters.from)}–${formatRank(filters.to)}` : filters.from != null ? `From rank ${formatRank(filters.from)}` : filters.to != null ? `Up to rank ${formatRank(filters.to)}` : null;
  const active = [
    set("year") && { label: filters.year ? `Year: ${meta.years.find((y) => y.year === filters.year)?.label ?? filters.year}` : "All years", href: here({ year: null }) },
    set("round") && filters.round && { label: `Round: ${roundLabel[filters.round]}`, href: here({ round: null }) },
    course && { label: `${course.degree} ${course.name}`, href: here({ course: null }) },
    filters.quota && { label: `Quota: ${filters.quota}`, href: here({ aq: null }) },
    filters.category && { label: `${filters.category} seats`, href: here({ acat: null }) },
    filters.state && { label: `State: ${filters.state}`, href: here({ state: null }) },
    ranks && { label: ranks, href: here({ from: null, to: null }) },
    caps?.maxFeeLakh != null && f.maxfee == null && { label: `Your cap: ${termValueLabel.maxfee(caps.maxFeeLakh)}`, href: here({ maxfee: "any" }) },
    caps?.maxBondYears != null && f.bondyrs == null && { label: `Your cap: ${termValueLabel.bondyrs(caps.maxBondYears)}`, href: here({ bondyrs: "any" }) },
    ...termChips(f).map((c) => ({ label: c.label, href: here({ [c.key]: null }) })),
  ].filter((x) => !!x);
  const of = (a: AllotmentRow) => `${a.college.name}, ${a.courseName}`;
  // State • type badge • beds: the card's meta line (the table's line under the course has the same).
  const instMeta = (a: AllotmentRow) => [
    a.college.state,
    a.hospital?.type && <TypeBadge type={a.hospital.type} of={a.college.name} />,
    a.hospital?.beds && <Beds beds={a.hospital.beds} of={a.college.name} />,
  ];
  const rankLink = (a: AllotmentRow, className: string) => (
    <Link href={L.rankScan(a.rank, a.year)} className={className} title="Scan ranks around this one">
      {formatRank(a.rank)}<span className="sr-only">: scan the ranks around it in {a.year}</span>
    </Link>
  );
  const courseLink = (a: AllotmentRow) => (
    <Link href={L.lastRanks(a.courseSlug, { inst: a.college.slug })} className="inline-flex min-h-6 items-center hover:text-sky hover:underline">{a.courseName}</Link>
  );

  const cards = (
    <ResultCards title="Allotments" hideTitle>
      {rows.map((a, i) => (
        <ResultCard
          key={i}
          chips={[
            <span key="r" className="inline-flex items-center gap-1.5"><span className="numeric">{a.year} · {roundLabel[a.round]}</span><Provisional when={a.provisional} /></span>,
            a.quota,
            `${a.category} seat`,
            // Only when it differs from the seat's (the PDF prints an Open candidate as "General").
            a.candidateCategory && a.candidateCategory.replace(/^General\b/, "Open") !== a.category && `${a.candidateCategory} candidate`,
            a.status !== "allotted" && (statusLabel[a.status] ?? a.status),
          ]}
          // Journey under the rank (not in the header row), so focus goes title → course → meta → rank → Journey → cells.
          stat={{
            label: "Rank",
            value: (
              <>
                {rankLink(a, "numeric hover:text-sky hover:underline")}
              </>
            ),
          }}
          title={a.college.name}
          href={L.institute(a.college.slug)}
          external={a.mccProfileUrl ? { href: a.mccProfileUrl, label: `MCC profile: ${a.college.name}` } : undefined}
          subtitle={courseLink(a)}
          meta={instMeta(a)}
          // The previous seat below the allotted institute's meta line (state, type, beds are this seat's, not that one's).
          footer={
            <>
              {a.prev && (
                <div className="grid border-b border-border px-4 py-2 text-xs">
                  <span className="text-muted-foreground">Previous seat</span>
                  <PrevSeatCell prev={a.prev} L={L} />
                </div>
              )}
              <TermStatCells t={a.fees} of={of(a)} className="border-t-0" />
            </>
          }
        />
      ))}
    </ResultCards>
  );

  const table = (
    <div id="allotments" role="region" aria-label="Allotments" tabIndex={0} className={`${tbl.wrap} ${tbl.scroll} scroll-pl-28`}>
      <table className={tbl.table}>
        <caption className="sr-only">Allotments, page {page}</caption>
        <thead className={tbl.head}><tr className="text-left">
          <th scope="col" className={`${th} ${stick} text-right`}>Rank</th>
          <th scope="col" className={th}>Round</th>
          <th scope="col" className={th}>Institute</th>
          {/* The five numbers right after the institute, before what the card's header row has (quota, category). */}
          {statKeys.map((k) => <th key={k} scope="col" data-col={k} className={`${th} text-right whitespace-nowrap`}><StatHead k={k} /></th>)}
          <th scope="col" data-col="quota" className={th}>Quota</th>
          <th scope="col" data-col="seat" className={th}>Seat category</th>
          <th scope="col" data-col="cand" className={th}>Candidate category</th>
          <th scope="col" data-col="option" className={`${th} text-right`}>Choice no.</th>
          <th scope="col" data-col="status" className={th}>Status</th>
          <th scope="col" data-col="prev" className={th}>Previous seat</th>
        </tr></thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={i} className={tbl.row}>
              <td className={`${td} ${stick} text-right`}>
                {rankLink(a, "numeric inline-flex min-h-6 min-w-6 items-center justify-end text-[15px] font-semibold hover:text-sky hover:underline")}
                {/* Two stacked targets, each at least 24 × 24 px (WCAG 2.5.8). */}
              </td>
              <td className={short}>
                <span className="font-medium"><span className="numeric">{a.year}</span> {roundLabel[a.round]}</span>
                <span className="block"><Provisional when={a.provisional} /></span>
              </td>
              <td className={`${td} min-w-52`}>
                <Link href={L.institute(a.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{a.college.name}</Link>
                <span className="block text-xs">{courseLink(a)}</span>
                {/* Type and beds share a line: wrapped one above the other, the lower (i)'s 44px target covered the upper. */}
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{a.college.state}</span>
                  <span className="inline-flex items-center gap-x-2 whitespace-nowrap">
                    {a.hospital?.type && <TypeBadge type={a.hospital.type} of={a.college.name} />}
                    {a.hospital?.beds && <Beds beds={a.hospital.beds} of={a.college.name} />}
                  </span>
                </span>
              </td>
              {/* Compact: one (i) a column (its header), not 250 a page; each card's (i)s have the exact words. */}
              <TermStatCells t={a.fees} variant="compact" of={of(a)} tdClassName="px-3 py-2" />
              <td data-col="quota" className={short}>{a.quota}</td>
              <td data-col="seat" className={short}>{a.category}</td>
              <td data-col="cand" className={short}>{a.candidateCategory ?? <Dash />}</td>
              <td data-col="option" className={`${short} numeric text-right`}>{a.optionNo != null ? formatRank(a.optionNo) : <Dash />}</td>
              <td data-col="status" className={short}>{statusLabel[a.status] ?? a.status}</td>
              <td data-col="prev" className={`${td} min-w-48`}><PrevSeatCell prev={a.prev} L={L} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Allotments" about={about}>MCC allotment results by rank, never names.</PageHead>

      {inst && (
        <p className="flex flex-wrap items-center gap-x-3 rounded-lg border border-border bg-card px-4 py-1 text-sm">
          Showing allotments at <Link href={L.institute(inst.slug)} className={`${smallLink} font-semibold text-sky`}>{inst.name}</Link>
          <Link href={L.with("/decide/allotments", { inst: null, page: null })} className={`${smallLink} text-muted-foreground`}>Show all institutes</Link>
        </p>
      )}

      <FilterBar action="/decide/allotments" params={params} cols="grid-cols-2 md:grid-cols-4 xl:grid-cols-6 [&>label]:min-w-0" active={active.length} clear={L.to("/decide/allotments", { inst: inst?.slug })}>
        {inst && <input type="hidden" name="inst" value={inst.slug} />}
        <Field label="Year"><Select name="year" value={filters.year ? String(filters.year) : "all"} options={[{ value: "all", label: "All years" }, ...meta.years.map((y) => ({ value: String(y.year), label: y.label }))]} /></Field>
        <Field label="Round"><Select name="round" value={filters.round} all="All rounds" options={rounds.map((r) => ({ value: r, label: roundLabel[r] }))} /></Field>
        <Field label="Course" className="col-span-2 md:col-span-1"><Select name="course" value={f.course} all="All courses" options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
        <Field label="Quota"><Select name="aq" value={f.aq} all="All quotas" options={meta.quotas.map((q) => ({ value: q, label: q }))} /></Field>
        <Field label="Seat category"><Select name="acat" value={f.acat} all="All" options={allotmentCategories.map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Rank from"><input {...rankInput("from")} /></Field>
        <Field label="Rank to"><input {...rankInput("to")} /></Field>
        <TermFilterControls f={f} caps={caps} />
      </FilterBar>
      <ActiveFilters items={active} clear={L.to("/decide/allotments", { inst: inst?.slug })} />
      {rankError && <p id="rank-error" role="alert" className="text-sm text-ember">{rankError}</p>}

      <div className={toolbarRow}>
        <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
          <span className="numeric font-semibold text-foreground">{rangeLabel({ rows, total, page, pageSize: PAGE_SIZE })}</span> allotments
          {/* The default view (no filter: the latest round) is what Year and Round show; say it for screen readers. */}
          {latest && <span className="sr-only">, the latest round, {latest.year} {roundLabel[latest.rounds.at(-1)!]}</span>}
         <ColourLegend className="ml-1 align-middle" /></p>
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle page="allotments" view={view} />
            <CsvLink href={L.with("/api/v1/allotments/export", { page: null, [VIEW_PARAM]: null })} what={`these ${formatRank(total)} allotments`} total={total} />
            {view === "table" && <AllotmentsDisplay cols={cols} />}
          </div>
        )}
      </div>

      {unknownTerms > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="numeric">{formatRank(unknownTerms)}</span> more allotments have a filtered figure not declared.{" "}
          <Link href={here({ nd: "keep" })} className={`${smallLink} text-sky`}>Include them</Link>
        </p>
      )}
      {total === 0 ? (
        <EmptyState title="No allotments match these filters." href={L.to("/decide/allotments", { inst: inst?.slug, maxfee: "any", bondyrs: "any" })} />
      ) : (
        <ViewPanes page="allotments" view={view} cards={cards} table={table} />
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(n) => L.page("/decide/allotments", n)} focusId="results" label="Allotments" />
      <DataSource
        used={[...new Map(rows.map((a) => [`${a.year}|${a.round}`, { year: a.year, round: a.round }])).values()]}
        terms={termDocs(rows.map((a) => a.fees))}
      />
    </AppPage>
  );
}
