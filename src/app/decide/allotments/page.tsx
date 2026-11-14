import type { Metadata } from "next";
import Link from "next/link";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { FocusItem } from "@/features/decide/components/focus-item";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, PageHead } from "@/features/decide/components/bits";
import { control, Empty, Field, FilterBar, hrefWith, profileOnly, Select, tbl } from "@/features/decide/components/ui";
import { formatLakh } from "@/features/decide/lib/format";
import { decideLinks } from "@/features/decide/lib/links";
import { toURLSearchParams } from "@/features/decide/profile";
import { getDecideData, getMeta, listAllotments } from "@/features/decide/service";
import { baseCategories, roundLabel, rounds, type Round } from "@/features/decide/types";

export const metadata: Metadata = { title: "Allotments" };
const PAGE = 50;

export default async function AllotmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const meta = await getMeta();
  const inst = params.get("inst") ? (await getDecideData()).colleges.find((c) => c.slug === params.get("inst")) : undefined;
  const f = {
    year: Number(params.get("year")) || undefined,
    round: (rounds as readonly string[]).includes(params.get("round") ?? "") ? (params.get("round") as Round) : undefined,
    course: params.get("course") || undefined,
    quota: params.get("quota") || undefined,
    category: params.get("acat") || undefined,
    state: params.get("state") || undefined,
    from: Number(params.get("from")) || undefined,
    to: Number(params.get("to")) || undefined,
  };
  const limit = Math.max(PAGE, Number(params.get("limit")) || PAGE);
  const { total, rows } = await listAllotments(f, limit, inst?.key);
  const link = hrefWith("/decide/allotments", params);

  return (
    <AppPage className="grid gap-6 py-6">
      <PageHead title="Allotments">Every seat allotted in the data: rank, round, quota, seat category, institute, course and its fee, stipend and bond. Ranks only, never names.</PageHead>

      {inst && (
        <p className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm">
          Showing allotments at <Link href={L.institute(inst.slug)} className="font-semibold text-sky underline">{inst.name}</Link>
          <Link href={link({ inst: null })} className="text-muted-foreground underline">Show all institutes</Link>
        </p>
      )}

      <FilterBar action="/decide/allotments" params={params} cols="md:grid-cols-4 xl:grid-cols-[1fr_1fr_2fr_1fr_1fr_1fr_1fr_auto]">
        {inst && <input type="hidden" name="inst" value={inst.slug} />}
        <Field label="Year"><Select name="year" value={f.year ? String(f.year) : undefined} all="All years" options={[2026, 2025, 2024].map((y) => ({ value: String(y), label: y === 2026 ? "2026 (provisional)" : String(y) }))} /></Field>
        <Field label="Round"><Select name="round" value={f.round} all="All rounds" options={rounds.map((r) => ({ value: r, label: roundLabel[r] }))} /></Field>
        <Field label="Course"><Select name="course" value={f.course} all="All courses" options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
        <Field label="Quota"><Select name="quota" value={f.quota} all="All quotas" options={meta.quotas.map((q) => ({ value: q, label: q }))} /></Field>
        <Field label="Seat category"><Select name="acat" value={f.category} all="All" options={[...baseCategories, ...baseCategories.map((c) => `${c} PwD`)].map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Rank from"><input name="from" inputMode="numeric" defaultValue={f.from ?? ""} placeholder="e.g. 30000" className={control} /></Field>
        <Field label="Rank to"><input name="to" inputMode="numeric" defaultValue={f.to ?? ""} placeholder="e.g. 50000" className={control} /></Field>
      </FilterBar>

      <p aria-live="polite" className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{formatRank(total)}</span> allotments{total > rows.length ? `, showing the first ${rows.length}` : ""}</p>

      {rows.length === 0 ? (
        <Empty title="No allotments match these filters." href={profileOnly("/decide/allotments", params)} />
      ) : (
        <div role="region" aria-label="Allotments" tabIndex={0} className={tbl.wrap}>
          <table className={tbl.table}>
            <caption className="sr-only">Allotments</caption>
            <thead><tr className={tbl.headRow}>
              <th scope="col" className={`${tbl.th} text-right`}>Rank</th>
              <th scope="col" className={tbl.th}>Round, quota and seat</th>
              <th scope="col" className={tbl.th}>Institute and course</th>
              <th scope="col" className={`${tbl.th} text-right`}>Fee per year</th>
              <th scope="col" className={tbl.th}>Stipend and bond</th>
            </tr></thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={i} data-item={i + 1} tabIndex={-1} className={tbl.row}>
                  <td className={tbl.num}><Link href={L.rankScan(a.rank, a.year)} className="hover:text-sky hover:underline" title="Scan ranks around this one">{formatRank(a.rank)}</Link></td>
                  <td className={tbl.td}>
                    <span className="font-medium">{a.year} {roundLabel[a.round]}</span>{a.provisional && <span className="ml-1.5 text-xs text-sun">Provisional</span>}
                    <span className="block text-xs text-muted-foreground">{a.quota}, {a.category} seat, {a.remark.toLowerCase()}</span>
                  </td>
                  <td className={tbl.td}>
                    <Link href={L.institute(a.college.slug)} className="font-medium hover:text-sky hover:underline">{a.college.name}</Link>
                    <span className="block text-xs text-muted-foreground">
                      <Link href={L.lastRanks(a.courseSlug, { inst: a.college.slug })} className="hover:text-sky hover:underline">{a.courseName}</Link>, {a.college.state}, {a.college.type}
                    </span>
                  </td>
                  <td className={tbl.num}>{a.feeInr != null ? formatLakh(a.feeInr) : <Dash />}</td>
                  <td className={tbl.td}>
                    <span className="block">{a.stipendText ?? <Dash />}</span>
                    <span className="block text-xs text-muted-foreground">Bond: {a.bondText ?? <Dash />}{a.penaltyText ? `, ${a.penaltyText}` : ""}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > rows.length && (
        <div className="text-center"><Button asChild variant="secondary"><Link href={link({ limit: String(limit + PAGE), focus: String(limit + 1) })} scroll={false}>Show {PAGE} more</Link></Button></div>
      )}
      <FocusItem n={Number(params.get("focus")) || null} />
      <p className="text-xs text-muted-foreground">Select a rank to scan seats allotted around it; a course to see its last ranks at that institute.</p>
      <DataSource />
    </AppPage>
  );
}
