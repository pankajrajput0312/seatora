import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Container } from "@/components/layout/container";
import { DemoSource, PageHead } from "@/features/decide/components/bits";
import { courseName } from "@/features/decide/components/options-view";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { decideLinks } from "@/features/decide/lib/links";
import { profileFromParams, profileParamKeys, toURLSearchParams } from "@/features/decide/profile";
import { allotmentTrends } from "@/features/decide/service";

export const metadata: Metadata = { title: "Seats" };
const YEARS = [2024, 2025, 2026];

export default async function SeatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const tab = params.get("tab") === "trends" ? "trends" : "matrix";
  const keep = new URLSearchParams();
  for (const k of profileParamKeys) if (params.get(k)) keep.set(k, params.get(k)!);
  const href = (key: string) => `/decide/seats?${new URLSearchParams({ ...Object.fromEntries(keep), tab: key })}`;

  const all = tab === "trends" ? await allotmentTrends({}) : [];
  const rows = all.filter((r) => !profile?.specialties.length || profile.specialties.includes(r.course.specialty));
  const L = decideLinks(params);
  const max = Math.max(1, ...rows.flatMap((r) => YEARS.map((y) => r.byYear[y])));

  return (
    <Container className="py-10">
      <PageHead title="Seats" />
      <SubTabs label="Seats" current={tab} items={[{ key: "matrix", label: "Matrix", href: href("matrix") }, { key: "trends", label: "Trends", href: href("trends") }]} />

      {tab === "matrix" ? (
        <div className="mt-6 grid place-items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <LayoutGrid className="size-6 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <p className="font-medium">Seat matrix not available yet.</p>
          <p className="max-w-md text-sm text-muted-foreground">MCC&apos;s round-wise seat matrix hasn&apos;t been imported. Allotment counts are not a substitute, so nothing is shown here until it is.</p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted-foreground">Allotments made per year (all rounds), for the courses in your profile. This is not the number of seats.</p>
          <div role="region" aria-label="Allotments made by year" tabIndex={0} className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Allotments made by year per institute and course</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th scope="col" className="px-3 py-3 font-normal">Institute · course</th>
                  {YEARS.map((y) => <th key={y} scope="col" className="px-3 py-3 font-normal">{y}{y === 2026 && " (R1)"}</th>)}
                  <th scope="col" className="px-3 py-3 text-right font-normal">Change vs 2024</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const change = r.byYear[2025] - r.byYear[2024];
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-normal"><Link href={L.institute(r.college.slug)} className="font-medium hover:text-sky hover:underline">{r.college.name}</Link><Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className="block text-xs text-muted-foreground hover:text-sky hover:underline">{courseName(r)}, {r.quota}</Link></th>
                      {YEARS.map((y) => (
                        <td key={y} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 bg-sky" style={{ width: `${(r.byYear[y] / max) * 80}px` }} aria-hidden />
                            <span className="numeric">{r.byYear[y]}</span>
                          </div>
                        </td>
                      ))}
                      <td className="numeric px-3 py-2 text-right">{change > 0 ? `+${change}` : change} <span className="sr-only">2025 vs 2024</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-6"><DemoSource /></div>
    </Container>
  );
}
