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
import { AboutData } from "@/features/decide/components/filter-form";
import { Dash, PageHead, Provisional } from "@/features/decide/components/bits";
import { DataSource } from "@/features/decide/components/data-source";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { termDocs } from "@/features/decide/components/fees";
import { ResultCard, ResultCards } from "@/features/decide/components/result-card";
import { StatHead, TermStatCells } from "@/features/decide/components/stat-cells";
import { TermFilterControls, UntypedNote } from "@/features/decide/components/term-filter-controls";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { ActiveFilters, control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { VIEW_PARAM, ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView, pageSizeFor } from "@/features/decide/server/view";
import { decideLinks } from "@/features/decide/lib/links";
import { statKeys, statLabel } from "@/features/decide/lib/stat-format";
import { termChips, termValueLabel } from "@/features/decide/lib/term-filters";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { roundLabel, roundShort, type Round } from "@/features/decide/types";
import { ScrollTable } from "@/features/decide/components/scroll-table";
import { activeExam, examGate, examInfo } from "@/features/exams/active";
import { authorityOf, DEFAULT_EXAM, groupsOf, perGroup, roundNameIn, termsDocOf, yearName, type ExamKey } from "@/features/exams/registry";
import { QuotaName } from "@/features/decide/components/round-name";
import { quotaIn, type Exam } from "@/features/exams/exam";
import { PgOr } from "@/features/decide/components/round-name";

export const metadata: Metadata = { title: "Allotments" };
const PAGE_SIZE = 50; // a phone: 25 (pageSizeFor)
// Columns the Display menu can hide (rank, round and institute always show), in table order: the numbers first. Only
// the exam's: no term columns without its fee data, no candidate category where its results print one category (NEET SS).
const colsOf = (E: Exam) => [
  ...(E.has.fees ? statKeys.map((k) => ({ key: k, label: statLabel[k] })) : []),
  { key: "quota", label: "Quota" },
  { key: "seat", label: "Seat category" },
  ...(E.categories.length > 1 ? [{ key: "cand", label: "Candidate category" }] : []),
  { key: "option", label: "Choice no." },
  { key: "status", label: "Status" },
  { key: "prev", label: "Previous seat" },
];

/** The page's (i) beside its title: what a row is and what each part means (in the exam's words: MCC's, INI-CET's AIIMS). */
const aboutOf = (exam: ExamKey) => (
  <>
    Every allotment in {authorityOf(exam)}&apos;s result PDFs, newest year first, then round and rank. Ranks only, never names. With no filter
    the page opens on the latest round: pick All years under Year for every round. Select a rank to
    scan the allotments around it that year, Journey for that rank&apos;s seat in every round of the year, a course for its last
    ranks at that institute.<br /><br />
    Seat category is the seat&apos;s; candidate category the candidate&apos;s own, as the PDF prints it (an OBC, SC, ST or EWS
    candidate often holds an Open seat). Status: allotted (R1 and stray rounds), fresh or upgraded (R2, R3). Choice no. and the
    previous seat (the one held a round earlier, with the remark printed there) are in R2 and R3 results only, and those list
    only new or upgraded allotments.<br /><br />
    Fee, stipend, bond and leaving penalty are that seat&apos;s course and quota as published (<PgOr pg="DNB seats follow NBEMS; MD, MS and Diploma seats the college" other={termsDocOf(exam)} />);
    each (i) has the exact words and source. College type is inferred, not official; beds are self-reported by the hospital.
  </>
);

export default async function AllotmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gated = await examGate("/decide/allotments");
  if (gated) return gated;
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const pageSize = await pageSizeFor(PAGE_SIZE);
  const exam = await activeExam();
  const E = await examInfo(exam);
  const [v, view] = await Promise.all([allotmentsView(params, pageSize, exam), chosenView(params, "allotments")]);
  if (!v) notFound();
  const { f, meta, inst, typed, rankError, latest, fromProfile, filters } = v;
  // A round as that year's MCC result names it (NEET SS's Mop-up; NEET PG: R1 … Special stray, as before).
  const roundOf = (a: { year: number; round: Round }) => roundNameIn(exam, meta.sources, a.year, a.round);
  const yn = (y: number) => yearName(exam, y); // INI-CET: "Jan 2026"
  // The Round filter: a round as the results name it in its years (INI-CET's "Open Round"; NEET PG: R1 … Special stray).
  const roundChoice = (r: Round) => [...new Set(meta.years.filter((y) => y.rounds.includes(r)).map((y) => roundOf({ year: y.year, round: r })))].join(" / ") || roundLabel[r];
  const { rows, total, page, unknownTerms, untyped } = v.r;
  // Her profile's caps apply here as on Options and Fees (an absent maxfee / bondyrs is hers: allotmentsView).
  const caps = profileFromParams(params);
  const rankInput = (name: "from" | "to") => ({
    name,
    inputMode: "numeric" as const,
    defaultValue: typed(name) ?? (fromProfile ? String(fromProfile[name]) : ""),
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
  // Every allotment, not her profile's default: also where Reset and Clear all go.
  const showAll = L.to("/decide/allotments", { inst: inst?.slug, mine: "0" });
  const set = (k: string) => !!params.get(k)?.trim();
  const courseLabel = (slug: string) => {
    const c = meta.courses.find((x) => x.slug === slug);
    return c ? `${c.degree} ${c.name}` : slug;
  };
  const ranks = fromProfile ? null : filters.from != null && filters.to != null ? `Ranks ${formatRank(filters.from)}–${formatRank(filters.to)}` : filters.from != null ? `From rank ${formatRank(filters.from)}` : filters.to != null ? `Up to rank ${formatRank(filters.to)}` : null;
  const active = [
    set("year") && { label: filters.year ? `Year: ${meta.years.find((y) => y.year === filters.year)?.label ?? yn(filters.year)}` : "All years", param: "year", href: here({ year: null }) },
    set("round") && filters.round && { label: `Round: ${roundChoice(filters.round)}`, param: "round", href: here({ round: null }) },
    // Her profile's default (no filter set): one chip saying so; × shows every allotment (the latest round).
    fromProfile && { label: `From your profile: ${fromProfile.courses.length ? `${fromProfile.courses.length === 1 ? courseLabel(fromProfile.courses[0]) : `your ${fromProfile.courses.length} courses`}, ` : ""}ranks ${formatRank(fromProfile.from)}–${formatRank(fromProfile.to)}${fromProfile.quotas ? `, ${perGroup(exam) ? groupsOf(exam, fromProfile.quotas).join(", ") : `your quotas (${fromProfile.quotas.map((q) => quotaIn(E, q)).join(", ")})`}` : ""}`, param: "course", href: showAll },
    ...(fromProfile ? [] : f.course ?? []).map((c) => ({ label: courseLabel(c), param: "course", href: L.without("/decide/allotments", "course", c) })),
    filters.quota && { label: `Quota: ${quotaIn(E, filters.quota)}`, param: "aq", href: here({ aq: null }) },
    filters.category && { label: `${filters.category} seats`, param: "acat", href: here({ acat: null }) },
    filters.state && { label: `State: ${filters.state}`, href: here({ state: null }) },
    ranks && { label: ranks, param: "from", href: here({ from: null, to: null }) },
    caps?.maxFeeLakh != null && f.maxfee == null && { label: `Your cap: ${termValueLabel.maxfee(caps.maxFeeLakh)}`, param: "maxfee", href: here({ maxfee: "any" }) },
    caps?.maxBondYears != null && f.bondyrs == null && { label: `Your cap: ${termValueLabel.bondyrs(caps.maxBondYears)}`, param: "bondyrs", href: here({ bondyrs: "any" }) },
    ...termChips(f).map((c) => ({ label: c.label, param: c.key, href: c.value ? L.without("/decide/allotments", c.key, c.value) : here({ [c.key]: null }) })),
  ].filter((x) => !!x);
  const of = (a: AllotmentRow) => `${a.college.name}, ${a.courseName}`;
  // State • type badge • beds: the card's meta line (the table's line under the course has the same).
  const instMeta = (a: AllotmentRow) => [
    a.college.state,
    <TypeBadge key="type" type={a.hospital?.type} of={a.college.name} />,
    a.hospital?.beds && <Beds beds={a.hospital.beds} of={a.college.name} />,
  ];
  const rankLink = (a: AllotmentRow, className: string) => (
    <Link href={L.rankScan(a.rank, a.year)} className={className} title="Scan ranks around this one">
      {formatRank(a.rank)}<span className="sr-only">: scan the ranks around it in {yn(a.year)}</span>
    </Link>
  );
  const courseLink = (a: AllotmentRow) => (
    <Link href={L.lastRanks(a.courseSlug, { inst: a.college.slug })} className="inline-flex min-h-6 items-center hover:text-sky hover:underline">{a.courseName}</Link>
  );

  // A card whose institute, course, quota and terms are the previous card's (one college's allotments, rank after rank)
  // says so instead of repeating the same fee and bond cells.
  const sameTerms = (i: number) => i > 0 && rows[i - 1].college.slug === rows[i].college.slug && rows[i - 1].courseSlug === rows[i].courseSlug && rows[i - 1].quota === rows[i].quota && JSON.stringify(rows[i - 1].fees) === JSON.stringify(rows[i].fees);
  const cards = (
    <ResultCards title="Allotments" hideTitle>
      {rows.map((a, i) => (
        <ResultCard
          key={i}
          chips={[
            <span key="r" className="inline-flex items-center gap-1.5"><span className="numeric">{yn(a.year)} · {roundOf(a)}</span><Provisional when={a.provisional} /></span>,
            <QuotaName key="q" quota={a.quota} />,
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
                {rankLink(a, "hit numeric hover:text-sky hover:underline")}
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
              {sameTerms(i) ? (
                <p className="px-4 py-2 text-xs text-muted-foreground">Fee, stipend and bond: as on the card before.</p>
              ) : (
                <TermStatCells t={a.fees} of={of(a)} className="border-t-0" />
              )}
            </>
          }
        />
      ))}
    </ResultCards>
  );

  const table = (
    <ScrollTable label="Allotments" scope="allotments" scrollClassName="scroll-pl-28 max-md:scroll-pl-[8.5rem]">
      <table className={tbl.table}>
        <caption className="sr-only">Allotments, page {page}</caption>
        <thead className={tbl.head}><tr className="text-left">
          {/* Phones: the round and the institute (course, at one institute) ride in the pinned Rank cell, so a row swiped
              sideways still says whose seat it is; their own columns go. */}
          <th scope="col" className={`${th} ${stick} text-right max-md:text-left md:whitespace-nowrap ${tbl.pin}`}>Rank<span className="md:hidden">, round, {inst ? "course" : "institute"}</span></th>
          <th scope="col" className={`${th} max-md:hidden`}>Round</th>
          <th scope="col" className={`${th} ${inst ? "max-md:hidden" : ""}`}>{inst ? "Course" : "Institute"}</th>
          {/* The five numbers right after the institute, before what the card's header row has (quota, category). */}
          {statKeys.map((k) => <th key={k} scope="col" data-col={k} className={`${th} text-right whitespace-nowrap`}><StatHead k={k} /></th>)}
          <th scope="col" data-col="quota" className={th}>Quota</th>
          <th scope="col" data-col="seat" className={th}>Seat category</th>
          {E.categories.length > 1 && <th scope="col" data-col="cand" className={th}>Candidate category</th>}
          <th scope="col" data-col="option" className={`${th} text-right`}>Choice no.</th>
          <th scope="col" data-col="status" className={th}>Status</th>
          <th scope="col" data-col="prev" className={th}>Previous seat</th>
        </tr></thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={i} className={tbl.row}>
              <td className={`${td} ${stick} text-right max-md:text-left md:whitespace-nowrap ${tbl.pin}`}>
                {rankLink(a, "numeric inline-flex min-h-6 min-w-6 items-center justify-end text-[15px] font-semibold hover:text-sky hover:underline max-md:justify-start")}
                <span className="block text-xs md:hidden"><span className="numeric">{yn(a.year)}</span> {roundOf(a)} <Provisional when={a.provisional} /></span>
                <span title={inst ? a.courseName : a.college.name} className={`block text-xs text-muted-foreground md:hidden ${tbl.clamp}`}>{inst ? a.courseName : a.college.name}</span>
                {/* Two stacked targets, each at least 24 × 24 px (WCAG 2.5.8). */}
              </td>
              <td className={`${short} max-md:hidden`}>
                <span className="font-medium"><span className="numeric">{yn(a.year)}</span> {roundOf(a)}</span>
                <span className="block"><Provisional when={a.provisional} /></span>
              </td>
              {/* Two lines at most: the institute, then its course, state, type and beds on one small line. Filtered to one
                  institute (said once above the table): the course alone. */}
              <td className={`${td} ${inst ? "min-w-48 max-md:hidden" : "min-w-72 max-md:min-w-56"}`}>
                {inst ? (
                  <span className="font-medium">{courseLink(a)}</span>
                ) : (
                  <>
                    {/* Phones: the name is in the pinned Rank cell. */}
                    <Link href={L.institute(a.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline max-md:hidden">{a.college.name}</Link>
                    {/* Type and beds stay together: wrapped one above the other, the lower (i)'s 44px target covered the upper. */}
                    <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <span className="text-foreground">{courseLink(a)}</span>
                      <span aria-hidden>·</span>{exam === DEFAULT_EXAM || authorityOf(exam) === "MCC" ? <span className="sr-only">, </span> : null}
                      <span>{a.college.state}</span>
                      <span className="inline-flex items-center gap-x-1.5 whitespace-nowrap">
                        <TypeBadge type={a.hospital?.type} of={a.college.name} />
                        {a.hospital?.beds && <Beds beds={a.hospital.beds} of={a.college.name} />}
                      </span>
                    </span>
                  </>
                )}
              </td>
              {/* Compact: one (i) a column (its header), not 250 a page; each card's (i)s have the exact words. */}
              <TermStatCells t={a.fees} variant="compact" of={of(a)} tdClassName="px-3 py-2" />
              <td data-col="quota" className={short}><QuotaName quota={a.quota} /></td>
              <td data-col="seat" className={short}>{a.category}</td>
              {E.categories.length > 1 && <td data-col="cand" className={short}>{a.candidateCategory ?? <Dash />}</td>}
              <td data-col="option" className={`${short} numeric text-right`}>{a.optionNo != null ? formatRank(a.optionNo) : <Dash />}</td>
              <td data-col="status" className={short}>{statusLabel[a.status] ?? a.status}</td>
              <td data-col="prev" className={`${td} min-w-48`}><PrevSeatCell prev={a.prev} L={L} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead title="Allotments" about={aboutOf(exam)}>{authorityOf(exam)} allotment results by rank, never names.</PageHead>

      {inst && (
        // A slim line, not a card: the institute once (the table's rows then show the course alone), with its state, type and beds.
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="text-muted-foreground">Showing allotments at</span>
          <Link href={L.institute(inst.slug)} className="inline-flex min-h-8 items-center font-semibold text-sky underline">{inst.name}</Link>
          {rows[0]?.college.slug === inst.slug && (
            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground [&_button]:before:top-0">
              {instMeta(rows[0]).filter(Boolean).map((n, i) => <span key={i} className="inline-flex items-center">{n}</span>)}
            </span>
          )}
          <Link href={L.with("/decide/allotments", { inst: null, page: null })} className="inline-flex min-h-8 items-center text-muted-foreground underline hover:text-foreground">Show all institutes</Link>
        </p>
      )}

      {/* Filters, the count and the results tools on one row (globals.css .filter-row); chips and notes under it. */}
      <div className="filter-row">
      <FilterBar action="/decide/allotments" params={params} active={active.length} clear={showAll} total={total} noun="allotments">
        {inst && <input type="hidden" name="inst" value={inst.slug} />}
        {f.mine && <input type="hidden" name="mine" value={f.mine} />}
        <Field label="Year"><Select name="year" value={filters.year ? String(filters.year) : "all"} options={[{ value: "all", label: "All years" }, ...meta.years.map((y) => ({ value: String(y.year), label: y.label }))]} /></Field>
        <Field label="Round"><Select name="round" value={filters.round} all="All rounds" options={E.rounds.map((r) => ({ value: r, label: roundChoice(r) }))} /></Field>
        <FilterDropdown label="Course" name="course" search options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} selected={fromProfile?.courses ?? f.course ?? []} none="All courses" />
        <Field label="Quota"><Select name="aq" value={f.aq} all="All quotas" options={meta.quotas.map((q) => ({ value: q, label: quotaIn(E, q) }))} /></Field>
        {E.categories.length > 1 && <Field label="Seat category"><Select name="acat" value={f.acat} all="All" options={allotmentCategories.map((c) => ({ value: c, label: c }))} /></Field>}
        <Field label="Rank from"><input {...rankInput("from")} /></Field>
        <Field label="Rank to"><input {...rankInput("to")} /></Field>
        <TermFilterControls f={f} caps={caps} fees={E.has.fees} />
      </FilterBar>
      <ActiveFilters items={active} clear={showAll} />
      {fromProfile && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{fromProfile.courses.length ? fromProfile.courses.map(courseLabel).join(", ") : "Every course"}, every year and round, your rank ±25%.</span>
          <Link href={showAll} className={`${smallLink} text-sky`}>Show all</Link>
        </p>
      )}
      {rankError && <p id="rank-error" role="alert" className="text-sm text-ember">{rankError}</p>}

      <div className={toolbarRow}>
        <AboutData>
        <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
          <span className="numeric font-semibold text-foreground">{rangeLabel({ rows, total, page, pageSize })}</span> allotments
          {/* The default view (no filter: the latest round) is what Year and Round show; say it for screen readers. */}
          {latest && <span className="sr-only">, the latest round, {yn(latest.year)} {roundShort(latest.rounds.at(-1)!, exam)}</span>}
         <ColourLegend className="ml-1 align-middle" /></p>
        </AboutData>
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle page="allotments" view={view} />
            {exam === DEFAULT_EXAM && <CsvLink href={L.with("/api/v1/allotments/export", { page: null, [VIEW_PARAM]: null })} what={`these ${formatRank(total)} allotments`} total={total} />}
            {view === "table" && <AllotmentsDisplay cols={colsOf(E)} />}
          </div>
        )}
      </div>
      </div>

      <UntypedNote n={untyped} noun={untyped === 1 ? "allotment" : "allotments"} href={here({ ctype: null })} />
      {unknownTerms > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="numeric">{formatRank(unknownTerms)}</span> more allotments have no published figure for that filter.{" "}
          <Link href={here({ nd: "keep" })} className={`${smallLink} text-sky`}>Include them</Link>
        </p>
      )}
      {total === 0 ? (
        <EmptyState title="No allotments match these filters." href={L.to("/decide/allotments", { inst: inst?.slug, mine: "0", maxfee: "any", bondyrs: "any" })} />
      ) : (
        <ViewPanes page="allotments" view={view} cards={cards} table={table} />
      )}
      <Pager page={page} pageSize={pageSize} total={total} href={(n) => L.page("/decide/allotments", n)} focusId="results" label="Allotments" />
      <DataSource
        used={[...new Map(rows.map((a) => [`${a.year}|${a.round}`, { year: a.year, round: a.round }])).values()]}
        terms={termDocs(rows.map((a) => a.fees))}
      />
    </AppPage>
  );
}
