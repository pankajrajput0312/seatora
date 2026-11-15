import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { CSV_MAX_ROWS } from "@/features/decide/api";
import { PrevSeatCell } from "@/features/decide/components/allotments/allotment-cells";
import { AllotmentsDisplay } from "@/features/decide/components/allotments/allotments-display";
import { allotmentCategories, allotmentsView, statusLabel } from "@/features/decide/components/allotments/allotments-view";
import { AppPage } from "@/features/decide/components/app-page";
import { Dash, PageHead, Provisional } from "@/features/decide/components/bits";
import { DataSource } from "@/features/decide/components/data-source";
import { termDocs, TermsSummary } from "@/features/decide/components/fees";
import { control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { toURLSearchParams } from "@/features/decide/profile";
import { roundLabel, rounds } from "@/features/decide/types";

export const metadata: Metadata = { title: "Allotments" };
const PAGE_SIZE = 50;
// Columns the Display menu can hide (rank, round and institute always show).
const cols = [
  { key: "quota", label: "Quota" },
  { key: "seat", label: "Seat category" },
  { key: "cand", label: "Candidate category" },
  { key: "option", label: "Choice no." },
  { key: "status", label: "Status" },
  { key: "prev", label: "Previous seat" },
  { key: "terms", label: "Fee, stipend, bond and leaving penalty" },
];

export default async function AllotmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const v = await allotmentsView(params, PAGE_SIZE);
  if (!v) notFound();
  const { f, meta, inst, typed, rankError, latest, filters } = v;
  const { rows, total, page } = v.r;
  const narrowed = inst || Object.values(filters).some((x) => x != null);
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

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Allotments">Every allotment in the MCC results: rank, round, quota, seat and candidate category, choice number, status, the seat held one round back, institute and course, with that seat&apos;s fee, stipend and bond as published. Ranks only, never names.</PageHead>

      {inst && (
        <p className="flex flex-wrap items-center gap-x-3 rounded-lg border border-border bg-card px-4 py-1 text-sm">
          Showing allotments at <Link href={L.institute(inst.slug)} className={`${smallLink} font-semibold text-sky`}>{inst.name}</Link>
          <Link href={L.with("/decide/allotments", { inst: null, page: null })} className={`${smallLink} text-muted-foreground`}>Show all institutes</Link>
        </p>
      )}

      <FilterBar action="/decide/allotments" params={params} cols="md:grid-cols-4 xl:grid-cols-[1fr_1fr_2fr_1fr_1fr_1fr_1fr_auto]">
        {inst && <input type="hidden" name="inst" value={inst.slug} />}
        <Field label="Year"><Select name="year" value={filters.year ? String(filters.year) : "all"} options={[{ value: "all", label: "All years" }, ...meta.years.map((y) => ({ value: String(y.year), label: y.label }))]} /></Field>
        <Field label="Round"><Select name="round" value={filters.round} all="All rounds" options={rounds.map((r) => ({ value: r, label: roundLabel[r] }))} /></Field>
        <Field label="Course"><Select name="course" value={f.course} all="All courses" options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
        <Field label="Quota"><Select name="aq" value={f.aq} all="All quotas" options={meta.quotas.map((q) => ({ value: q, label: q }))} /></Field>
        <Field label="Seat category"><Select name="acat" value={f.acat} all="All" options={allotmentCategories.map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Rank from"><input {...rankInput("from")} placeholder="e.g. 30,000" /></Field>
        <Field label="Rank to"><input {...rankInput("to")} placeholder="e.g. 50,000" /></Field>
      </FilterBar>
      {rankError && <p id="rank-error" role="alert" className="text-sm text-ember">{rankError}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
          <span className="numeric font-semibold text-foreground">{rangeLabel({ rows, total, page, pageSize: PAGE_SIZE })}</span> allotments, newest year first, then round and rank.
          {latest && ` The latest round, ${latest.year} ${roundLabel[latest.rounds.at(-1)!]}: pick All years for every round.`}
          {!narrowed && " This is every year and course: pick an institute, course, year or rank range to narrow it."}
        </p>
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {total > CSV_MAX_ROWS ? (
              <p className="text-sm text-muted-foreground">
                <span className="numeric">{formatRank(total)}</span> rows are more than one CSV download holds (<span className="numeric">{formatRank(CSV_MAX_ROWS)}</span>): narrow the filters to download them.
              </p>
            ) : (
              <Button asChild variant="secondary">
                <a href={L.with("/api/v1/allotments/export", { page: null })} download>
                  <Download className="size-4" aria-hidden />Download CSV<span className="sr-only"> of these {formatRank(total)} allotments</span>
                </a>
              </Button>
            )}
            <AllotmentsDisplay cols={cols} />
          </div>
        )}
      </div>

      {total === 0 ? (
        <EmptyState title="No allotments match these filters." href={L.to("/decide/allotments", { inst: inst?.slug })} />
      ) : (
        <div id="allotments" role="region" aria-label="Allotments" tabIndex={0} className={tbl.wrap}>
          <table className={tbl.table}>
            <caption className="sr-only">Allotments, page {page}</caption>
            <thead><tr className={tbl.headRow}>
              <th scope="col" className={`${th} text-right`}>Rank</th>
              <th scope="col" className={th}>Round</th>
              <th scope="col" className={th}>Institute and course</th>
              <th scope="col" data-col="quota" className={th}>Quota</th>
              <th scope="col" data-col="seat" className={th}>Seat category</th>
              <th scope="col" data-col="cand" className={th}>Candidate category</th>
              <th scope="col" data-col="option" className={`${th} text-right`}>Choice no.</th>
              <th scope="col" data-col="status" className={th}>Status</th>
              <th scope="col" data-col="prev" className={th}>Previous seat (one round back)</th>
              <th scope="col" data-col="terms" className={th}>Fee, stipend, bond and leaving penalty</th>
            </tr></thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={i} className={tbl.row}>
                  <td className={`${td} text-right`}>
                    <Link href={L.rankScan(a.rank, a.year)} className="numeric inline-flex min-h-6 min-w-6 items-center justify-end text-[15px] font-semibold hover:text-sky hover:underline" title="Scan ranks around this one">{formatRank(a.rank)}</Link>
                    {/* Two stacked targets, each at least 24 × 24 px (WCAG 2.5.8). */}
                    <Link href={L.rankJourney(a.rank, a.year)} className="flex min-h-6 items-center justify-end text-xs text-muted-foreground hover:text-sky hover:underline" title={`This rank's seat in every ${a.year} round`}>
                      Journey<span className="sr-only"> of rank {formatRank(a.rank)} in {a.year}</span>
                    </Link>
                  </td>
                  <td className={short}>
                    <span className="font-medium"><span className="numeric">{a.year}</span> {roundLabel[a.round]}</span>
                    <span className="block"><Provisional when={a.provisional} /></span>
                  </td>
                  <td className={`${td} min-w-56`}>
                    <Link href={L.institute(a.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{a.college.name}</Link>
                    <span className="block text-xs text-muted-foreground">
                      <Link href={L.lastRanks(a.courseSlug, { inst: a.college.slug })} className="inline-flex min-h-6 items-center hover:text-sky hover:underline">{a.courseName}</Link>, {a.college.state ?? <Dash />}
                    </span>
                  </td>
                  <td data-col="quota" className={short}>{a.quota}</td>
                  <td data-col="seat" className={short}>{a.category}</td>
                  <td data-col="cand" className={short}>{a.candidateCategory ?? <Dash />}</td>
                  <td data-col="option" className={`${short} numeric text-right`}>{a.optionNo ?? <Dash />}</td>
                  <td data-col="status" className={short}>{statusLabel[a.status] ?? a.status}</td>
                  <td data-col="prev" className={`${td} min-w-48`}><PrevSeatCell prev={a.prev} L={L} /></td>
                  <td data-col="terms" className={`${td} min-w-64`}><TermsSummary t={a.fees} className="text-xs" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(n) => L.page("/decide/allotments", n)} focusId="results" label="Allotments" />
      <div className="grid gap-2 text-xs text-muted-foreground">
        <p>
          Select a rank to scan the allotments around it that year, Journey for that rank&apos;s seat in every round of the year, a course to see its last ranks at that institute. Seat category is the seat&apos;s;
          candidate category the candidate&apos;s own, as the PDF prints it (an OBC, SC, ST or EWS candidate often holds an Open seat). Status: allotted (R1 and stray rounds), fresh or upgraded (R2, R3). Choice no. and the
          previous seat are printed in R2 and R3 results only: the previous seat is the one held a round earlier (R1 for R2, R2 for R3), with the remark printed there. In R2 and later the results list only new or upgraded allotments.
          Fees and stipends are per programme (DNB seats follow NBEMS; MD, MS and Diploma seats the college).
        </p>
        <DataSource
          used={[...new Map(rows.map((a) => [`${a.year}|${a.round}`, { year: a.year, round: a.round }])).values()]}
          terms={termDocs(rows.map((a) => a.fees))}
        />
      </div>
    </AppPage>
  );
}
