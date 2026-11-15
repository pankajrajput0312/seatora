import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { PageHead, Provisional } from "@/features/decide/components/bits";
import { control, EmptyState, Field, FilterBar, Select, tbl } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { parseSearchParams, rankValue } from "@/features/decide/lib/params";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, rankScan } from "@/features/decide/service";
import { roundLabel } from "@/features/decide/types";

export const metadata: Metadata = { title: "Rank scan" };
// ponytail: the window bounds the page (±500 is about 550 rows in a busy year); paginate per round if wider ranges are wanted.
const windows = ["100", "250", "500"] as const;
const schema = z.object({ scan: rankValue.optional(), year: z.coerce.number().int().optional(), w: z.enum(windows).default("250") });

export default async function RankScanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const meta = await getMeta();
  const typed = params.get("scan")?.trim() || null;
  const invalid = typed != null && f.scan == null;
  const rank = invalid ? null : (f.scan ?? profile?.rank ?? null);
  // Default: the newest year whose results are final.
  const year = meta.years.find((y) => y.year === f.year) ?? meta.years.find((y) => !y.provisional) ?? meta.years[0];
  const window = Number(f.w);
  const groups = rank && year ? await rankScan(rank, year.year, window) : [];
  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  const courseOf = new Map(meta.courses.map((c) => [`${c.degree}|${c.specialty}`, c]));
  const provisional = (round: string) => meta.sources.some((s) => s.year === year?.year && s.round === round && s.provisional);

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Rank scan">Allotments to ranks near yours, round by round, in one year&apos;s MCC results. This shows what happened then, not what will happen now.</PageHead>

      <FilterBar action="/decide/rank-scan" params={params} cols="md:grid-cols-[1fr_1fr_1fr_auto]">
        <Field label="All India Rank">
          <input name="scan" inputMode="numeric" defaultValue={typed ?? rank ?? ""} placeholder="e.g. 42,284" aria-invalid={invalid || undefined} aria-describedby={invalid ? "scan-error" : undefined} className={`${control} numeric`} />
        </Field>
        <Field label="Year"><Select name="year" value={year ? String(year.year) : undefined} options={meta.years.map((y) => ({ value: String(y.year), label: y.label }))} /></Field>
        <Field label="Range"><Select name="w" value={f.w} options={windows.map((w) => ({ value: w, label: `± ${formatRank(Number(w))}` }))} /></Field>
      </FilterBar>

      {invalid ? (
        <p id="scan-error" role="alert" className="text-sm text-ember">“{typed}” isn&apos;t a rank. Enter a whole number between 1 and 3,00,000, for example 42,284.</p>
      ) : !rank || !year ? (
        <EmptyState title="Enter a rank to scan" description="Type an All India Rank above, or set your rank, to see the allotments made to ranks around it." />
      ) : (
        <>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Ranks <span className="numeric text-foreground">{formatRank(Math.max(1, rank - window))}–{formatRank(rank + window)}</span> in {year.label}: <span className="numeric font-semibold text-foreground">{formatRank(total)}</span> allotments, every course and seat category.
          </p>
          {groups.length === 0 && <EmptyState title="No allotments in this range" description="No seat was allotted to these ranks that year. Try a wider range or another year." />}
          {groups.map((g) => (
            <section key={g.round} aria-labelledby={`r-${g.round}`} className="grid grid-cols-1 gap-3">
              <h2 id={`r-${g.round}`} className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                <span><span className="numeric">{year.year}</span> {roundLabel[g.round]}</span> <Provisional when={provisional(g.round)} />
              </h2>
              <div role="region" aria-label={`${year.year} ${roundLabel[g.round]} allotments`} tabIndex={0} className={tbl.wrap}>
                <table className={tbl.table}>
                  <caption className="sr-only">{year.year} {roundLabel[g.round]}: allotments to ranks near {formatRank(rank)}</caption>
                  <thead>
                    <tr className={tbl.headRow}>
                      <th scope="col" className={`${tbl.th} text-right`}>Rank</th>
                      <th scope="col" className={tbl.th}>Seat category</th>
                      <th scope="col" className={tbl.th}>Institute</th>
                      <th scope="col" className={tbl.th}>Course and quota</th>
                      <th scope="col" className={tbl.th}>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.flatMap((a, i) => {
                      const c = courseOf.get(`${a.degree}|${a.specialty}`);
                      return [
                        ...(a.rank >= rank && (i === 0 || g.rows[i - 1].rank < rank)
                          ? [<tr key={`you-${i}`} className="bg-sky/10"><td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-sky">Your rank, {formatRank(rank)}, falls here</td></tr>]
                          : []),
                        <tr key={i} className={tbl.row}>
                          <td className={tbl.num}><Link href={L.rankJourney(a.rank, year.year)} className="hover:text-sky hover:underline" title={`This rank's seat in every ${year.year} round`}>{formatRank(a.rank)}</Link></td>
                          <td className={tbl.td}>{a.category}</td>
                          <td className={tbl.td}><Link href={L.institute(a.collegeSlug)} className="font-medium hover:text-sky hover:underline">{a.collegeName}</Link></td>
                          <td className={tbl.td}>
                            <Link href={L.allotments({ course: c?.slug, inst: a.collegeSlug, year: year.year, round: g.round })} className="hover:text-sky hover:underline">{a.degree} {c?.name ?? a.specialty}</Link>
                            <span className="block text-xs text-muted-foreground">{a.quota}</span>
                          </td>
                          <td className={`${tbl.td} text-muted-foreground`}>{a.remark}</td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {groups.length > 0 && <p className="text-xs text-muted-foreground">A “Your rank falls here” row marks where ranks pass yours. In R2 and later only new or upgraded allotments are listed. Select a rank for its seat in every round that year (Rank journey).</p>}
        </>
      )}
      {year && <DataSource used={[{ year: year.year }]} />}
    </AppPage>
  );
}
