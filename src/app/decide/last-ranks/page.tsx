import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, HISTORY_CAPTION, PageHead, Provisional } from "@/features/decide/components/bits";
import { EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getCollege, getMeta, lastRanks, type OptionRow } from "@/features/decide/service";
import { baseCategories, roundLabel, rounds, type Round } from "@/features/decide/types";

export const metadata: Metadata = { title: "Last ranks" };
const PAGE_SIZE = 50;
const categories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;
const schema = z.object({
  course: z.string().max(100).optional(),
  lcat: z.enum(categories).optional(),
  lquota: z.string().max(100).optional(),
  inst: z.string().max(200).optional(),
  /** A year-round column, e.g. "2025-R1" or "2024-special_stray". */
  sort: z.string().regex(new RegExp(`^\\d{4}-(${rounds.join("|")})$`)).optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  since: z.coerce.number().int().optional(),
  page: pageValue.optional(),
});

/** R1 closing by year (like for like); a missing year is a gap, never a drop to zero. */
function Spark({ r, years }: { r: OptionRow; years: number[] }) {
  const pts = years.map((y) => r.grid[y]?.R1?.closing ?? null);
  const vals = pts.filter((v): v is number => v != null);
  if (!vals.length) return <Dash />;
  const max = Math.max(...vals);
  const x = (i: number) => 5 + (i * 50) / Math.max(1, years.length - 1);
  const y = (v: number) => 18 - (v / max) * 16;
  const segs: string[][] = [[]];
  pts.forEach((v, i) => (v == null ? segs.push([]) : segs[segs.length - 1].push(`${x(i)},${y(v)}`)));
  const desc = `R1 closing by year: ${years.map((yr, i) => `${yr} ${pts[i] != null ? formatRank(pts[i]!) : "no R1 data"}`).join(", ")}`;
  return (
    <svg viewBox="0 0 60 20" className="h-5 w-16" role="img" aria-label={desc}>
      {segs.filter((sg) => sg.length > 1).map((sg, i) => <polyline key={i} points={sg.join(" ")} className="fill-none stroke-mark" strokeWidth={1.5} />)}
      {pts.map((v, i) => (v != null ? <rect key={i} x={x(i) - 1.5} y={y(v) - 1.5} width={3} height={3} className="fill-mark" /> : null))}
    </svg>
  );
}

export default async function LastRanksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const meta = await getMeta();
  const course = meta.courses.find((c) => c.slug === f.course) ?? meta.courses.find((c) => profile?.specialties.includes(c.specialty)) ?? meta.courses[0];
  const category = f.lcat ?? profile?.category ?? "Open";
  const quota = f.lquota && meta.quotas.includes(f.lquota) ? f.lquota : undefined;
  const [sortYear, sortRound] = f.sort?.split("-") ?? [];
  const sort = f.sort ? { year: Number(sortYear), round: sortRound as Round, dir: f.dir } : undefined;
  const [lr, inst] = await Promise.all([
    lastRanks({ specialty: course.specialty, degree: course.degree, category, quota, sort }),
    f.inst ? getCollege(f.inst) : null,
  ]);

  // The service builds every row for the course anyway (one SQL read); only this page's rows are rendered. A link
  // from an institute (inst) opens the page that holds its row unless a page is asked for (so the Pager always sets one).
  const at = inst ? lr.rows.findIndex((r) => r.college.slug === inst.slug) : -1;
  const page = Math.min(Math.max(1, Math.ceil(lr.total / PAGE_SIZE)), f.page ?? (at >= 0 ? Math.floor(at / PAGE_SIZE) + 1 : 1));
  const rows = lr.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const anchor = inst && rows.find((r) => r.college.slug === inst.slug)?.id;
  const cols = lr.columns.filter((c) => !f.since || c.year >= f.since);
  const years = cols.map((c) => c.year);
  const courseLabel = `${course.degree} ${course.name}`;
  const caption = `Closing ranks for ${courseLabel}, ${category} seats${quota ? `, ${quota}` : ""}`;
  const sortHref = (key: string) => L.with("/decide/last-ranks", { sort: key, dir: f.sort === key && f.dir === "desc" ? "asc" : "desc", page: null });

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Last ranks">Closing rank in each round on one seat category, with the allotments made that round in brackets. Pick a course, a seat category and a quota.</PageHead>

      <FilterBar action="/decide/last-ranks" params={params} cols="md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        {inst && <input type="hidden" name="inst" value={inst.slug} />}
        <Field label="Course"><Select name="course" value={course.slug} options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
        <Field label="Seat category"><Select name="lcat" value={category} options={categories.map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Quota"><Select name="lquota" value={quota} all="All quotas" options={meta.quotas.map((q) => ({ value: q, label: q }))} /></Field>
        <Field label="From year"><Select name="since" value={f.since ? String(f.since) : undefined} all="All years" options={lr.columns.map((c) => ({ value: String(c.year), label: String(c.year) }))} /></Field>
      </FilterBar>

      {inst && at < 0 && (
        <p className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          {inst.name} had no {category}-seat allotments for {courseLabel}{quota ? `, ${quota}` : ""} in these results.{" "}
          {category !== "Open" && <Link href={L.with("/decide/last-ranks", { lcat: "Open", page: null })} className={`${smallLink} text-sky`}>Show Open seats</Link>}{" "}
          <Link href={L.allotments({ course: course.slug, inst: inst.slug })} className={`${smallLink} text-sky`}>See its allotments</Link>
        </p>
      )}

      <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
        <span className="numeric font-semibold text-foreground">{rangeLabel({ ...lr, rows, page, pageSize: PAGE_SIZE })}</span> options (institute and quota) with a closing on {category} seats
        {lr.empty > 0 && <>; <span className="numeric">{formatRank(lr.empty)}</span> more had no {category}-seat allotments for this course</>}.
      </p>

      {lr.total === 0 ? (
        <EmptyState title={`No ${category}-seat closings for ${courseLabel}${quota ? `, ${quota}` : ""}`} description="Try another seat category or quota." href={L.to("/decide/last-ranks", { course: course.slug })} />
      ) : (
        <div role="region" aria-label={caption} tabIndex={0} className="relative overflow-x-auto rounded-xl border border-border bg-card [scroll-padding-inline-start:16rem]">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">{caption}, page {page}</caption>
            <colgroup span={2} />
            {cols.map((c) => <colgroup key={c.year} span={c.rounds.length} />)}
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th rowSpan={2} scope="col" className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold">Institute</th>
                <th rowSpan={2} scope="col" className="px-2 py-2 text-left text-xs font-semibold">R1 trend</th>
                {cols.map((c) => (
                  <th key={c.year} scope="colgroup" colSpan={c.rounds.length} className="border-l border-border px-2 py-2 text-center text-xs font-semibold">
                    <span className="numeric">{c.year}</span> <Provisional when={c.provisional} />
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {cols.flatMap((c) =>
                  c.rounds.map((r, i) => {
                    const key = `${c.year}-${r}`;
                    const on = f.sort === key;
                    return (
                      <th key={key} scope="col" aria-sort={on ? (f.dir === "asc" ? "ascending" : "descending") : undefined} className={`px-1 py-1 text-right font-normal ${i === 0 ? "border-l border-border" : ""}`}>
                        <Link href={sortHref(key)} aria-label={`${c.year} ${roundLabel[r]}, sort ${on && f.dir === "desc" ? "ascending" : "descending"}`} className="inline-flex min-h-11 items-center justify-end px-1 hover:text-foreground">
                          {roundLabel[r]}{on ? (f.dir === "asc" ? " ↑" : " ↓") : ""}
                        </Link>
                      </th>
                    );
                  }),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const mine = inst?.slug === r.college.slug;
                return (
                  <tr key={r.id} id={r.id === anchor ? `inst-${r.college.slug}` : undefined} className={`scroll-mt-24 border-b border-border last:border-0 hover:bg-muted/50 ${mine ? "bg-sky/10" : ""}`}>
                    <th scope="row" className={`sticky left-0 z-10 max-w-64 px-3 py-2 text-left font-normal ${mine ? "bg-mist" : "bg-card"}`}>
                      <Link href={L.institute(r.college.slug)} className="font-medium hover:text-sky hover:underline">{r.college.name}</Link>
                      <span className="block text-xs text-muted-foreground">{r.college.state ?? <Dash />}, {r.quota}</span>
                      <Link href={L.allotments({ course: course.slug, inst: r.college.slug })} className={`${smallLink} text-xs text-sky`}>Allotments</Link>
                    </th>
                    <td className="px-2 py-2"><Spark r={r} years={years} /></td>
                    {cols.flatMap((c) =>
                      c.rounds.map((round, i) => {
                        const cell = r.grid[c.year]?.[round];
                        return (
                          <td key={`${c.year}-${round}`} className={`numeric px-2 py-2 text-right ${i === 0 ? "border-l border-border" : ""}`}>
                            {cell ? <>{formatRank(cell.closing)} <span className="text-xs text-muted-foreground">({formatRank(cell.n)})</span></> : <Dash />}
                          </td>
                        );
                      }),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={lr.total} href={(n) => L.with("/decide/last-ranks", { page: n })} focusId="results" label="Last ranks" />

      <div className="grid gap-2 text-xs text-muted-foreground">
        <p>Closing = highest All India Rank allotted that round on a {category} seat. Brackets = allotments made that round in every seat category (in R2 and later, new or upgraded allotments only), not the seat matrix. The R1 trend draws the R1 columns as a line.</p>
        <p>{HISTORY_CAPTION}</p>
        <DataSource used={years.map((year) => ({ year }))} />
      </div>
    </AppPage>
  );
}
