import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, PageHead } from "@/features/decide/components/bits";
import { courseName } from "@/features/decide/components/options-view";
import { MccLink } from "@/features/decide/components/pages/mcc-link";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { EmptyState, Pager, rangeLabel, tbl } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { allotmentTrends, getMeta, PAST_YEARS, YEARS } from "@/features/decide/service";

export const metadata: Metadata = { title: "Seats" };
const PAGE_SIZE = 50;
const schema = z.object({ tab: z.enum(["matrix", "trends"]).default("matrix"), page: pageValue.default(1) });

export default async function SeatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const specialties = profile?.specialties.length ? profile.specialties : undefined;
  const [meta, res] = await Promise.all([getMeta(), f.tab === "trends" ? allotmentTrends({ specialties }, { page: f.page, pageSize: PAGE_SIZE }) : null]);
  const label = (y: number) => meta.years.find((x) => x.year === y)?.label ?? String(y);
  const [y0, y1] = PAST_YEARS;
  const max = Math.max(1, ...(res?.rows ?? []).flatMap((r) => YEARS.map((y) => r.byYear[y] ?? 0)));

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Seats" />
      <SubTabs label="Seats" current={f.tab} items={[{ key: "matrix", label: "Matrix", href: L.to("/decide/seats", { tab: "matrix" }) }, { key: "trends", label: "Allotment trends", href: L.to("/decide/seats", { tab: "trends" }) }]} />

      {!res ? (
        <EmptyState
          icon={LayoutGrid}
          title="Seat matrix not imported yet"
          description="MCC's round-wise seat matrix isn't in the data yet. Allotment counts are not seats, so nothing is shown here until the matrix is imported. MCC publishes it on its PG counselling site."
        >
          <MccLink>Seat matrix on the MCC site</MccLink>
        </EmptyState>
      ) : (
        <>
          <p className="max-w-3xl text-muted-foreground">Allotments made per year (all rounds, all seat categories) for {specialties ? "the courses in your profile" : "every course"}. This is not the number of seats: in R2 and later only new or upgraded allotments count.</p>
          <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
            <span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> options (institute, course and quota)
          </p>
          {res.total === 0 ? (
            <EmptyState title="No allotments for these courses." href={L.to("/decide/seats", { tab: "trends" })} action="Show trends" />
          ) : (
            <div role="region" aria-label="Allotments made by year" tabIndex={0} className={tbl.wrap}>
              <table className={tbl.table}>
                <caption className="sr-only">Allotments made by year per institute, course and quota, page {res.page}</caption>
                <thead>
                  <tr className={tbl.headRow}>
                    <th scope="col" className={tbl.th}>Institute, course and quota</th>
                    {YEARS.map((y) => <th key={y} scope="col" className={`${tbl.th} text-right`}>{label(y)}</th>)}
                    <th scope="col" className={`${tbl.th} text-right`}>{y1} vs {y0}</th>
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((r) => {
                    const change = r.byYear[y1] != null && r.byYear[y0] != null ? r.byYear[y1]! - r.byYear[y0]! : null;
                    return (
                      <tr key={r.id} className={tbl.row}>
                        <th scope="row" className={`${tbl.td} min-w-56 text-left font-normal`}>
                          <Link href={L.institute(r.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{r.college.name}</Link>
                          <Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className="flex min-h-6 w-fit items-center text-xs text-muted-foreground hover:text-sky hover:underline">{courseName(r)}, {r.quota}</Link>
                        </th>
                        {YEARS.map((y) => (
                          <td key={y} className={tbl.num}>
                            <span className="flex items-center justify-end gap-2">
                              {r.byYear[y] != null && <span className="block h-2 rounded-r-[4px] bg-mark" style={{ width: `${(r.byYear[y]! / max) * 64}px` }} aria-hidden />}
                              {r.byYear[y] != null ? formatRank(r.byYear[y]) : <Dash />}
                            </span>
                          </td>
                        ))}
                        <td className={tbl.num}>{change == null ? <Dash /> : change > 0 ? `+${formatRank(change)}` : formatRank(change)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page("/decide/seats", n)} focusId="results" label="Allotment trends" />
          <DataSource used={YEARS.map((year) => ({ year }))} />
        </>
      )}
    </AppPage>
  );
}
