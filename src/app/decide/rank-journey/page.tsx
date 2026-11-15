import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { formatRank } from "@/features/cutoffs/lib/format";
import { PrevSeatCell } from "@/features/decide/components/allotments/allotment-cells";
import { statusLabel } from "@/features/decide/components/allotments/allotments-view";
import { AppPage } from "@/features/decide/components/app-page";
import { Dash, PageHead, Provisional } from "@/features/decide/components/bits";
import { DataSource } from "@/features/decide/components/data-source";
import { control, EmptyState, Field, FilterBar, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { parseSearchParams, rankValue } from "@/features/decide/lib/params";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, rankJourney } from "@/features/decide/service";
import { roundLabel } from "@/features/decide/types";

export const metadata: Metadata = { title: "Rank journey" };
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
  const rows = rank && year ? await rankJourney(year.year, rank) : [];
  const none = year ? year.rounds.filter((r) => !rows.some((a) => a.round === r)) : [];
  const courseOf = new Map(meta.courses.map((c) => [`${c.degree}|${c.specialty}`, c]));
  const provisional = (round: string) => meta.sources.some((s) => s.year === year?.year && s.round === round && s.provisional);
  const th = `${tbl.th} px-3`;
  const td = "px-3 py-2 align-top";
  const short = `${td} whitespace-nowrap`;

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Rank journey">One All India Rank&apos;s seat in every round of one year&apos;s MCC results: the seat, MCC&apos;s status, the choice number and the seat held a round earlier. Ranks only, never names. This shows what happened then, not what will happen now.</PageHead>

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
        <EmptyState
          title={`No allotment to rank ${formatRank(rank)} in ${year.year}`}
          description={`MCC's ${year.year} results (${year.rounds.map((r) => roundLabel[r]).join(", ")}) list no seat for this rank in any round.`}
          href={L.rankScan(rank, year.year)}
          action={`Scan ranks around ${formatRank(rank)}`}
        />
      ) : (
        <>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Rank <span className="numeric font-semibold text-foreground">{formatRank(rank)}</span> in {year.label}: a seat in <span className="numeric font-semibold text-foreground">{rows.length}</span> of {year.rounds.length} rounds.{" "}
            <Link href={L.rankScan(rank, year.year)} className={smallLink}>Scan ranks around it</Link>
          </p>
          <div role="region" aria-label={`Rank ${formatRank(rank)}, ${year.year}`} tabIndex={0} className={tbl.wrap}>
            <table className={tbl.table}>
              <caption className="sr-only">Rank {formatRank(rank)}: its seat in each {year.year} round</caption>
              <thead><tr className={tbl.headRow}>
                <th scope="col" className={th}>Round</th>
                <th scope="col" className={th}>Institute and course</th>
                <th scope="col" className={th}>Quota</th>
                <th scope="col" className={th}>Seat category</th>
                <th scope="col" className={th}>Candidate category</th>
                <th scope="col" className={`${th} text-right`}>Choice no.</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Previous seat (one round back)</th>
              </tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={`${a.round}|${a.college}|${a.degree}|${a.specialty}|${a.quota}`} className={tbl.row}>
                    <th scope="row" className={`${short} text-left font-medium`}>
                      <span className="numeric">{year.year}</span> {roundLabel[a.round]}
                      <span className="block"><Provisional when={provisional(a.round)} /></span>
                    </th>
                    <td className={`${td} min-w-56`}>
                      {a.collegeSlug ? (
                        <Link href={L.institute(a.collegeSlug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{a.collegeName}</Link>
                      ) : (
                        <span className="font-medium">{a.collegeName}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        <Link href={L.allotments({ course: courseOf.get(`${a.degree}|${a.specialty}`)?.slug, inst: a.collegeSlug || undefined, year: year.year, round: a.round })} className="inline-flex min-h-6 items-center hover:text-sky hover:underline" title="Every allotment on this course here that round">{a.courseName}</Link>
                      </span>
                    </td>
                    <td className={short}>{a.quota}</td>
                    <td className={short}>{a.category}</td>
                    <td className={short}>{a.candidateCategory ?? <Dash />}</td>
                    <td className={`${short} numeric text-right`}>{a.optionNo ?? <Dash />}</td>
                    <td className={short}>{statusLabel[a.status] ?? a.status}</td>
                    <td className={`${td} min-w-48`}><PrevSeatCell prev={a.prev} L={L} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {none.length > 0 && <>No allotment to this rank in the {none.map((r) => roundLabel[r]).join(", ")} result{none.length > 1 ? "s" : ""}. </>}
            In R2 and later the results list only new or upgraded seats, so a round without a row may mean a seat from an earlier round was kept. Seat category is the seat&apos;s, candidate category the candidate&apos;s own; choice no.
            and the previous seat (with the remark printed beside it) are printed in R2 and R3 results only.
          </p>
        </>
      )}
      {year && <DataSource used={[{ year: year.year }]} />}
    </AppPage>
  );
}
