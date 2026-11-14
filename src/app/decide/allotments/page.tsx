import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, PageHead, Provisional, TermText } from "@/features/decide/components/bits";
import { control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams, rankValue } from "@/features/decide/lib/params";
import { toURLSearchParams } from "@/features/decide/profile";
import { getCollege, getMeta, listAllotments } from "@/features/decide/service";
import { baseCategories, roundLabel, rounds, termLabel } from "@/features/decide/types";

export const metadata: Metadata = { title: "Allotments" };
const PAGE_SIZE = 50;
const categories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;
// Page filters never reuse a profile key: quota is `aq`, seat category `acat` (lib/links.ts).
const schema = z.object({
  inst: z.string().max(200).optional(),
  course: z.string().max(100).optional(),
  year: z.coerce.number().int().optional(),
  round: z.enum(rounds).optional(),
  aq: z.string().max(100).optional(),
  acat: z.enum(categories).optional(),
  state: z.string().max(100).optional(),
  from: rankValue.optional(),
  to: rankValue.optional(),
  page: pageValue.default(1),
});

export default async function AllotmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const [meta, inst] = await Promise.all([getMeta(), f.inst ? getCollege(f.inst) : null]);
  if (f.inst && !inst) notFound();

  // A rank typed with commas ("30,000") is fine; anything else that isn't a rank is reported, not silently dropped.
  const typed = (k: "from" | "to") => params.get(k)?.trim() || null;
  const reversed = f.from != null && f.to != null && f.from > f.to;
  const rankError =
    (typed("from") && f.from == null) || (typed("to") && f.to == null)
      ? "Enter ranks as whole numbers from 1 to 3,00,000, for example 30,000. That range was not applied."
      : reversed
        ? "“Rank from” is above “Rank to”. That range was not applied."
        : null;
  // With no filter at all the page opens on the latest year's latest round (not all 2,09,571 rows); "All years" is year=all.
  const pristine = !["inst", "course", "year", "round", "aq", "acat", "state", "from", "to"].some((k) => params.get(k)?.trim());
  const latest = pristine ? meta.years[0] : undefined;
  const filters = {
    year: meta.years.some((y) => y.year === f.year) ? f.year : latest?.year,
    round: f.round ?? latest?.rounds.at(-1),
    course: f.course,
    quota: f.aq,
    category: f.acat,
    state: f.state,
    from: rankError ? undefined : f.from,
    to: rankError ? undefined : f.to,
  };
  const { rows, total, page } = await listAllotments(filters, { page: f.page, pageSize: PAGE_SIZE }, inst?.key);
  const narrowed = inst || Object.values(filters).some((v) => v != null);
  const rankInput = (name: "from" | "to") => ({
    name,
    inputMode: "numeric" as const,
    defaultValue: typed(name) ?? "",
    "aria-invalid": rankError ? true : undefined,
    "aria-describedby": rankError ? "rank-error" : undefined,
    className: `${control} numeric`,
  });

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Allotments">Every allotment in the MCC results: rank, round, quota, seat category, institute and course, with that seat&apos;s fee, stipend and bond as published. Ranks only, never names.</PageHead>

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
        <Field label="Seat category"><Select name="acat" value={f.acat} all="All" options={categories.map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Rank from"><input {...rankInput("from")} placeholder="e.g. 30,000" /></Field>
        <Field label="Rank to"><input {...rankInput("to")} placeholder="e.g. 50,000" /></Field>
      </FilterBar>
      {rankError && <p id="rank-error" role="alert" className="text-sm text-ember">{rankError}</p>}

      <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
        <span className="numeric font-semibold text-foreground">{rangeLabel({ rows, total, page, pageSize: PAGE_SIZE })}</span> allotments, newest year first, then round and rank.
        {latest && ` The latest round, ${latest.year} ${roundLabel[latest.rounds.at(-1)!]}: pick All years for every round.`}
        {!narrowed && " This is every year and course: pick an institute, course, year or rank range to narrow it."}
      </p>

      {total === 0 ? (
        <EmptyState title="No allotments match these filters." href={L.to("/decide/allotments", { inst: inst?.slug })} />
      ) : (
        <div role="region" aria-label="Allotments" tabIndex={0} className={tbl.wrap}>
          <table className={tbl.table}>
            <caption className="sr-only">Allotments, page {page}</caption>
            <thead><tr className={tbl.headRow}>
              <th scope="col" className={`${tbl.th} text-right`}>Rank</th>
              <th scope="col" className={tbl.th}>Round, quota and seat</th>
              <th scope="col" className={tbl.th}>Institute and course</th>
              <th scope="col" className={tbl.th}>Fee and stipend</th>
              <th scope="col" className={tbl.th}>Bond and Round 2 forfeit</th>
            </tr></thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={i} className={tbl.row}>
                  <td className={tbl.num}><Link href={L.rankScan(a.rank, a.year)} className="hover:text-sky hover:underline" title="Scan ranks around this one">{formatRank(a.rank)}</Link></td>
                  <td className={`${tbl.td} min-w-40`}>
                    <span className="font-medium"><span className="numeric">{a.year}</span> {roundLabel[a.round]}</span> <Provisional when={a.provisional} />
                    <span className="block text-xs text-muted-foreground">{a.quota}, {a.category} seat, {a.remark.toLowerCase()}</span>
                  </td>
                  <td className={`${tbl.td} min-w-56`}>
                    <Link href={L.institute(a.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{a.college.name}</Link>
                    <span className="block text-xs text-muted-foreground">
                      <Link href={L.lastRanks(a.courseSlug, { inst: a.college.slug })} className="inline-flex min-h-6 items-center hover:text-sky hover:underline">{a.courseName}</Link>, {a.college.state ?? <Dash />}
                    </span>
                  </td>
                  <td className={`${tbl.td} numeric min-w-56`}>
                    <TermText term={a.terms.fee} />
                    <span className="mt-1 block text-xs"><span className="text-muted-foreground">{termLabel.STIPEND}: </span><TermText term={a.terms.stipend} /></span>
                  </td>
                  <td className={`${tbl.td} numeric min-w-48 text-xs`}>
                    <span className="block"><span className="text-muted-foreground">{termLabel.BOND}: </span><TermText term={a.terms.bond} /></span>
                    <span className="mt-1 block"><span className="text-muted-foreground">{termLabel.PENALTY}: </span><TermText term={a.terms.penalty} /></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={total} href={(n) => L.page("/decide/allotments", n)} focusId="results" label="Allotments" />
      <div className="grid gap-2 text-xs text-muted-foreground">
        <p>Select a rank to scan the allotments around it that year; a course to see its last ranks at that institute. Fees and stipends are per programme (DNB seats follow NBEMS; MD, MS and Diploma seats the college).</p>
        <DataSource
          used={[...new Map(rows.map((a) => [`${a.year}|${a.round}`, { year: a.year, round: a.round }])).values()]}
          terms={rows.flatMap((a) => [a.terms.fee?.source, a.terms.stipend?.source, a.terms.bond?.source, a.terms.penalty?.source])}
        />
      </div>
    </AppPage>
  );
}
