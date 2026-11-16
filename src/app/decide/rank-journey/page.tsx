import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { formatRank } from "@/features/cutoffs/lib/format";
import { PrevSeatCell } from "@/features/decide/components/allotments/allotment-cells";
import { statusLabel } from "@/features/decide/components/allotments/allotments-view";
import { AppPage } from "@/features/decide/components/app-page";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { Dash, PageHead, Provisional } from "@/features/decide/components/bits";
import { DataSource } from "@/features/decide/components/data-source";
import { InfoTip } from "@/features/decide/components/info-tip";
import { cardMeta, subLink, termCol, withRowInfo } from "@/features/decide/components/ranks/rank-cards";
import { ResultCard, ResultCards } from "@/features/decide/components/result-card";
import { TermStatCells } from "@/features/decide/components/stat-cells";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { control, EmptyState, Field, FilterBar, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView } from "@/features/decide/server/view";
import { decideLinks } from "@/features/decide/lib/links";
import { parseSearchParams, rankValue } from "@/features/decide/lib/params";
import { statKeys, statLabel } from "@/features/decide/lib/stat-format";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, rankJourney } from "@/features/decide/service";
import { roundLabel } from "@/features/decide/types";
import { ScrollTable } from "@/features/decide/components/scroll-table";

export const metadata: Metadata = { title: "Rank journey" };
const VIEW = "rank-journey";
// `air`, never the profile's `rank` (lib/links.ts): looking up another rank must not change her profile.
const schema = z.object({ air: rankValue.optional(), year: z.coerce.number().int().optional() });

export default async function RankJourneyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const meta = await getMeta();
  const typed = params.get("air")?.trim() || null;
  const invalid = typed != null && f.air == null;
  const rank = invalid ? null : (f.air ?? profile?.rank ?? null);
  // Default: the newest year with results.
  const year = meta.years.find((y) => y.year === f.year) ?? meta.years[0];
  const rows = rank && year ? await withRowInfo(await rankJourney(year.year, rank)) : [];
  const none = year ? year.rounds.filter((r) => !rows.some((a) => a.round === r)) : [];
  const courseOf = new Map(meta.courses.map((c) => [`${c.degree}|${c.specialty}`, c]));
  const provisional = (round: string) => meta.sources.some((s) => s.year === year?.year && s.round === round && s.provisional);
  const th = `${tbl.th} px-3`;
  // The MCC result PDFs behind the rows (or behind "no allotment"): before the panes, so they are numbered first.
  const source = year && <DataSource used={[{ year: year.year }]} />;
  const td = "px-3 py-2 align-top";
  const short = `${td} whitespace-nowrap`;
  type Row = (typeof rows)[number];
  const key = (a: Row) => `${a.round}|${a.college}|${a.degree}|${a.specialty}|${a.quota}`;
  const courseLink = (a: Row) => L.allotments({ course: courseOf.get(`${a.degree}|${a.specialty}`)?.slug, inst: a.collegeSlug || undefined, year: year!.year, round: a.round });
  const of = (a: Row) => `${a.collegeName}, ${a.courseName}, ${roundLabel[a.round]}`;

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead
        title="Rank journey"
        about="One All India Rank's seat in every round of one year's MCC results: the seat, MCC's status, the choice number and the seat held a round earlier. Ranks only, never names."
        note="History, not a prediction."
      />

      <FilterBar action="/decide/rank-journey" params={params} cols="md:grid-cols-[1fr_1fr_auto]">
        <Field label="All India Rank">
          <input name="air" inputMode="numeric" defaultValue={typed ?? rank ?? ""} placeholder="e.g. 42,284" aria-invalid={invalid || undefined} aria-describedby={invalid ? "air-error" : undefined} className={`${control} numeric`} />
        </Field>
        <Field label="Year"><Select name="year" value={year ? String(year.year) : undefined} options={meta.years.map((y) => ({ value: String(y.year), label: y.label }))} /></Field>
      </FilterBar>

      {invalid ? (
        <p id="air-error" role="alert" className="text-sm text-ember">“{typed}” isn&apos;t a rank. Enter a whole number between 1 and 3,00,000, for example 42,284.</p>
      ) : !rank || !year ? (
        <EmptyState title="Enter a rank" description="Type an All India Rank above, or set your rank, to see that rank's seat in every round of one year's MCC results." />
      ) : rows.length === 0 ? (
        <>
          <EmptyState
            title={`No allotment to rank ${formatRank(rank)} in ${year.year}`}
            description={`MCC's ${year.year} results (${year.rounds.map((r) => roundLabel[r]).join(", ")}) list no seat for this rank in any round.`}
            href={L.rankScan(rank, year.year)}
            action={`Scan ranks around ${formatRank(rank)}`}
          />
          {source}
        </>
      ) : (
        <>
          <div className={toolbarRow}>
            <div className="grid gap-0.5">
              {/* The (i) beside the count, outside the live region (opening it is not news). */}
              <div className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
                <p aria-live="polite">
                  Seat in <span className="numeric font-semibold text-foreground">{rows.length}</span> of {year.rounds.length} rounds
                  {none.length > 0 && <>; none in {none.map((r) => roundLabel[r]).join(", ")}</>}
                </p>
                <InfoTip label="rounds without a seat">
                  In R2 and later the results list only new or upgraded seats, so a round without a row may mean a seat from an
                  earlier round was kept. Seat category is the seat&apos;s, candidate category the candidate&apos;s own; choice no.
                  and the previous seat (the seat held one round back, with the remark printed beside it) are printed in R2 and R3 results only.
                </InfoTip>
                <Link href={L.rankScan(rank, year.year)} className={`${smallLink} text-sky sm:ml-2`}>Scan nearby</Link>
              </div>
              {source}
            </div>
            <ViewToggle page={VIEW} />
          </div>
          <ViewPanes
            page={VIEW}
            view={await chosenView(params, VIEW)}
            cards={
              <ResultCards title={`Rank ${formatRank(rank)}: its seat in each ${year.year} round`} hideTitle>
                {rows.map((a) => (
                  <ResultCard
                    key={key(a)}
                    chips={[<span key="r" className="inline-flex items-center gap-1"><span className="numeric">{year.year}</span> · {roundLabel[a.round]}<Provisional when={provisional(a.round)} /></span>, a.quota, `${a.category} seat`, statusLabel[a.status] ?? a.status]}
                    stat={{ label: "Choice no.", value: a.optionNo != null ? <span className="numeric">{formatRank(a.optionNo)}</span> : <Dash /> }}
                    title={a.collegeName}
                    href={a.collegeSlug ? L.institute(a.collegeSlug) : undefined}
                    external={a.mcc ? { href: a.mcc, label: `MCC profile: ${a.collegeName}` } : undefined}
                    subtitle={<Link href={courseLink(a)} className={subLink}>{a.courseName}</Link>}
                    meta={[...cardMeta(a, a.collegeName), a.candidateCategory && `Candidate: ${a.candidateCategory}`]}
                    footer={
                      <>
                        {a.prev && (
                          <div className="flex gap-2 px-4 py-2 text-sm">
                            <span className="shrink-0 text-xs text-muted-foreground">Before</span>
                            <PrevSeatCell prev={a.prev} L={L} />
                          </div>
                        )}
                        <TermStatCells t={a.fees} of={of(a)} />
                      </>
                    }
                  />
                ))}
              </ResultCards>
            }
            table={
              // Status, quota, seat and candidate category and the choice no. ride in small lines (Round, Institute,
              // Previous seat), so the five term cells stay in view from about 1,024px.
              <ScrollTable label={`Rank ${formatRank(rank)}, ${year.year}`}>
                <table className={tbl.table}>
                  <caption className="sr-only">Rank {formatRank(rank)}: its seat in each {year.year} round</caption>
                  <thead><tr className={tbl.headRow}>
                    <th scope="col" className={th}>Round, status</th>
                    <th scope="col" className={th}>Institute and seat</th>
                    <th scope="col" className={th}>Choice, previous seat</th>
                    {statKeys.map((k) => <th key={k} scope="col" className={termCol.th(k)}>{statLabel[k]}</th>)}
                  </tr></thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={key(a)} className={tbl.row}>
                        <th scope="row" className={`${short} text-left font-medium`}>
                          <span className="numeric">{year.year}</span> {roundLabel[a.round]}
                          <span className="block"><Provisional when={provisional(a.round)} /></span>
                          <span className="block text-xs font-normal text-muted-foreground">{statusLabel[a.status] ?? a.status}</span>
                        </th>
                        <td className={`${td} min-w-44`}>
                          {a.collegeSlug ? (
                            <Link href={L.institute(a.collegeSlug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{a.collegeName}</Link>
                          ) : (
                            <span className="font-medium">{a.collegeName}</span>
                          )}
                          <span className="block text-xs text-muted-foreground">
                            <Link href={courseLink(a)} className={subLink} title="Every allotment on this course here that round">{a.courseName}</Link>
                          </span>
                          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                            {a.hospital?.type && <TypeBadge type={a.hospital.type} of={a.collegeName} />}
                            <span>{a.quota} · Seat: {a.category}{a.candidateCategory && ` · Candidate: ${a.candidateCategory}`}</span>
                          </span>
                        </td>
                        <td className={`${td} min-w-36 max-w-60`}>
                          {a.optionNo != null && <span className="block text-xs text-muted-foreground">Choice no. <span className="numeric">{formatRank(a.optionNo)}</span></span>}
                          <PrevSeatCell prev={a.prev} L={L} />
                        </td>
                        <TermStatCells t={a.fees} variant="table" of={of(a)} tdClassName={`${termCol.td} py-2`} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            }
          />
        </>
      )}
    </AppPage>
  );
}
