import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { DataSource } from "@/features/decide/components/data-source";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { PageHead } from "@/features/decide/components/bits";
import { decideLinks } from "@/features/decide/lib/links";
import { profileFromParams, profileParamKeys, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, rankScan } from "@/features/decide/service";
import { roundLabel } from "@/features/decide/types";

export const metadata: Metadata = { title: "Rank scan" };

export default async function RankScanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const typed = params.get("scan");
  const typedRank = typed != null && typed.trim() !== "" ? Number(typed.replace(/[,\s]/g, "")) : null;
  const invalid = typedRank != null && !(Number.isInteger(typedRank) && typedRank >= 1 && typedRank <= 300000);
  const rank = invalid ? null : typedRank ?? profile?.rank ?? null;
  const year = [2024, 2025, 2026].includes(Number(params.get("year"))) ? Number(params.get("year")) : 2025;
  const window = [250, 500, 1000].includes(Number(params.get("w"))) ? Number(params.get("w")) : 500;
  const [groups, meta] = await Promise.all([rank ? rankScan(rank, year, window) : [], getMeta()]);
  const L = decideLinks(params);
  const slugOf = (deg: string, sp: string) => meta.courses.find((c) => c.degree === deg && c.specialty === sp)?.slug ?? "";
  const course = (deg: string, sp: string) => `${deg} ${meta.courses.find((c) => c.degree === deg && c.specialty === sp)?.name ?? sp}`;

  return (
    <Container className="py-10">
      <PageHead title="Rank scan">Seats allotted to ranks near yours, round by round. This shows what happened then, not what will happen now.</PageHead>

      <Form action="/decide/rank-scan" role="search" className="mt-8 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        {profileParamKeys.map((k) => params.get(k) && <input key={k} type="hidden" name={k} value={params.get(k)!} />)}
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">All India Rank</span>
          <input name="scan" inputMode="numeric" defaultValue={rank ?? ""} placeholder="e.g. 42284" className="numeric h-11 rounded-md border border-input bg-background px-3" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Year</span>
          <select name="year" defaultValue={year} className="h-11 rounded-md border border-input bg-background px-3">
            {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}{y === 2026 ? " (R1, provisional)" : ""}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Range</span>
          <select name="w" defaultValue={window} className="h-11 rounded-md border border-input bg-background px-3">
            {[250, 500, 1000].map((w) => <option key={w} value={w}>± {w}</option>)}
          </select>
        </label>
        <Button type="submit" className="h-11">Scan</Button>
      </Form>

      {invalid ? (
        <p role="alert" className="mt-8 text-sm text-ember">“{typed}” isn&apos;t a rank. Enter a whole number between 1 and 3,00,000, for example 42,284.</p>
      ) : !rank ? (
        <p className="mt-8 text-sm text-muted-foreground">Enter a rank to scan.</p>
      ) : (
        <>
          <p aria-live="polite" className="mt-6 text-sm text-muted-foreground">
            Ranks <span className="numeric text-foreground">{formatRank(Math.max(1, rank - window))}–{formatRank(rank + window)}</span> in {year}: <span className="numeric text-foreground">{groups.reduce((s, g) => s + g.rows.length, 0)}</span> allotments.
          </p>
          {groups.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm">No allotments in this range for the demo courses.</p>}
          {groups.map((g) => (
            <section key={g.round} aria-labelledby={`r-${g.round}`} className="mt-6">
              <h2 id={`r-${g.round}`} className="text-lg font-medium">{year} {roundLabel[g.round]}</h2>
              <div role="region" aria-label={`${year} ${roundLabel[g.round]} allotments`} tabIndex={0} className="relative mt-3 overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[720px] text-sm">
                  <caption className="sr-only">{year} {roundLabel[g.round]}: allotments to ranks near {formatRank(rank)}</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                      <th scope="col" className="px-3 py-3 text-right font-normal">Rank</th>
                      <th scope="col" className="px-3 py-3 font-normal">Seat category</th>
                      <th scope="col" className="px-3 py-3 font-normal">Institute</th>
                      <th scope="col" className="px-3 py-3 font-normal">Course · quota</th>
                      <th scope="col" className="px-3 py-3 font-normal">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.flatMap((a, i) => [
                      ...(a.rank >= rank && (i === 0 || g.rows[i - 1].rank < rank)
                        ? [<tr key={`you-${i}`} className="bg-sky/10"><td colSpan={5} className="px-3 py-1.5 text-xs font-semibold text-sky">Your rank, {formatRank(rank)}, falls here</td></tr>]
                        : []),
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="numeric px-3 py-2 text-right">{formatRank(a.rank)}</td>
                        <td className="px-3 py-2">{a.category}</td>
                        <td className="px-3 py-2"><Link href={L.institute(a.collegeSlug)} className="font-medium hover:text-sky hover:underline">{a.collegeName}</Link></td>
                        <td className="px-3 py-2"><Link href={L.allotments({ course: slugOf(a.degree, a.specialty), inst: a.collegeSlug, year, round: g.round })} className="hover:text-sky hover:underline">{course(a.degree, a.specialty)}</Link><span className="block text-xs text-muted-foreground">{a.quota}</span></td>
                        <td className="px-3 py-2 text-muted-foreground">{a.remark}</td>
                      </tr>,
                    ])}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <p className="mt-3 text-xs text-muted-foreground">A “Your rank falls here” row marks where ranks pass yours.</p>
        </>
      )}
      <div className="mt-6"><DataSource /></div>
    </Container>
  );
}
