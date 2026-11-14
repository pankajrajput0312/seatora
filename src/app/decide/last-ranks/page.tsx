import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, DemoSource, HISTORY_CAPTION, PageHead } from "@/features/decide/components/bits";
import { profileFromParams, profileParamKeys, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, lastRanks, type OptionRow } from "@/features/decide/service";
import { baseCategories, roundLabel, type Round } from "@/features/decide/types";

export const metadata: Metadata = { title: "Last ranks" };
const cols: { year: number; rounds: Round[] }[] = [
  { year: 2024, rounds: ["R1", "R2", "R3", "stray"] },
  { year: 2025, rounds: ["R1", "R2", "R3", "stray"] },
  { year: 2026, rounds: ["R1"] },
];

function Spark({ r }: { r: OptionRow }) {
  const pts = cols.map((c) => Math.max(0, ...c.rounds.map((x) => r.grid[c.year]?.[x]?.closing ?? 0)));
  const max = Math.max(...pts);
  const desc = cols.map((c, i) => `${c.year}${c.year === 2026 ? " R1" : ""}: ${pts[i] ? formatRank(pts[i]) : "none"}`).join(", ");
  if (!max) return <Dash />;
  return (
    <figure className="m-0">
      <svg viewBox="0 0 60 20" className="h-5 w-16" role="img" aria-label={`Deepest closing by year: ${desc}`}>
        <polyline points={pts.map((v, i) => `${5 + i * 25},${18 - (v / max) * 16}`).join(" ")} className="fill-none stroke-sky" strokeWidth={1.5} />
        {pts.map((v, i) => v ? <rect key={i} x={3.5 + i * 25} y={16.5 - (v / max) * 16} width={3} height={3} className="fill-sky" /> : null)}
      </svg>
      <figcaption className="sr-only">{desc}</figcaption>
    </figure>
  );
}

export default async function LastRanksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const meta = await getMeta();
  const course = meta.courses.find((c) => c.slug === params.get("course")) ?? meta.courses.find((c) => profile?.specialties.includes(c.specialty)) ?? meta.courses[0];
  const category = (baseCategories as readonly string[]).includes(params.get("lcat") ?? "") ? params.get("lcat")! : profile?.category ?? "Open";
  const quota = meta.quotas.includes(params.get("lquota") ?? "") ? params.get("lquota")! : undefined;
  const sort = params.get("sort"); // e.g. "2025-R1"
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  const fetched = await lastRanks({ specialty: course.specialty, degree: course.degree, category, quota });
  let rows = fetched.filter((r) => Object.keys(r.grid).length > 0);
  const emptyCount = fetched.length - rows.length;
  if (sort) {
    const [y, r] = sort.split("-");
    const v = (x: OptionRow) => x.grid[Number(y)]?.[r as Round]?.closing ?? (dir === "asc" ? Infinity : -1);
    rows = [...rows].sort((a, b) => (dir === "asc" ? v(a) - v(b) : v(b) - v(a)));
  } else rows = [...rows].sort((a, b) => a.college.name.localeCompare(b.college.name));

  const sortHref = (key: string) => {
    const p = new URLSearchParams(params);
    p.set("sort", key);
    p.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    return `/decide/last-ranks?${p}`;
  };
  const caption = `Closing ranks for ${course.degree} ${course.name}, ${category} seats${quota ? `, ${quota}` : ""}`;

  return (
    <Container className="py-10">
      <PageHead title="Last ranks">Closing rank in each round, with allotments made in brackets. Pick a course and a seat category.</PageHead>

      <Form action="/decide/last-ranks" role="search" className="mt-8 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        {profileParamKeys.map((k) => params.get(k) && <input key={k} type="hidden" name={k} value={params.get(k)!} />)}
        <label className="grid gap-1.5 text-sm">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Course</span>
          <select name="course" defaultValue={course.slug} className="h-11 rounded-md border border-input bg-background px-3">
            {meta.courses.map((c) => <option key={c.slug} value={c.slug}>{c.degree} {c.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Seat category</span>
          <select name="lcat" defaultValue={category} className="h-11 rounded-md border border-input bg-background px-3">
            {baseCategories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Quota</span>
          <select name="lquota" defaultValue={quota ?? ""} className="h-11 rounded-md border border-input bg-background px-3">
            <option value="">All quotas</option>
            {meta.quotas.map((q) => <option key={q}>{q}</option>)}
          </select>
        </label>
        <Button type="submit" className="h-11">Show</Button>
      </Form>

      <p aria-live="polite" className="mt-6 text-sm text-muted-foreground"><span className="numeric text-foreground">{rows.length}</span> institutes{emptyCount > 0 && <>; <span className="numeric">{emptyCount}</span> more had no {category}-seat allotments for this course</>}.</p>

      <div role="region" aria-label={caption} tabIndex={0} className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[960px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <colgroup span={2} />
          {cols.map((c) => <colgroup key={c.year} span={c.rounds.length} />)}
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <td rowSpan={2} className="sticky left-0 z-10 bg-card" />
              <td rowSpan={2} />
              {cols.map((c) => (
                <th key={c.year} scope="colgroup" colSpan={c.rounds.length} className="border-l border-border px-2 py-2 text-center font-mono font-normal tracking-widest">
                  {c.year}{c.year === 2026 && " (provisional)"}
                </th>
              ))}
            </tr>
            <tr className="border-b border-border text-xs text-muted-foreground">
              {cols.flatMap((c) =>
                c.rounds.map((r, i) => {
                  const key = `${c.year}-${r}`;
                  return (
                    <th key={key} scope="col" aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`px-1 py-1 text-right font-normal ${i === 0 ? "border-l border-border" : ""}`}>
                      <Link href={sortHref(key)} className="inline-flex min-h-11 items-center justify-end px-1 hover:text-foreground">
                        {roundLabel[r]}{sort === key ? (dir === "asc" ? " ↑" : " ↓") : ""}
                        <span className="sr-only">, sort</span>
                      </Link>
                    </th>
                  );
                }),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <th scope="row" className="sticky left-0 z-10 max-w-64 bg-card px-3 py-2 text-left font-normal">
                  <Link href={`/decide/institutes/${r.college.slug}`} className="hover:text-sky">{r.college.name}</Link>
                  <span className="block text-xs text-muted-foreground">{r.college.state} · {r.quota}</span>
                </th>
                <td className="px-2 py-2"><Spark r={r} /></td>
                {cols.flatMap((c) =>
                  c.rounds.map((round, i) => {
                    const cell = r.grid[c.year]?.[round];
                    return (
                      <td key={`${c.year}-${round}`} className={`numeric px-2 py-2 text-right ${i === 0 ? "border-l border-border" : ""}`}>
                        {cell ? <>{formatRank(cell.closing)} <span className="text-xs text-muted-foreground">({cell.n})</span></> : <Dash />}
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
        <p>Closing = highest All India Rank allotted that round on a {category} seat. Brackets = allotments made that round (new or upgraded only in R2+), not the seat matrix.</p>
        <p>{HISTORY_CAPTION}</p>
        <DemoSource />
      </div>
    </Container>
  );
}
