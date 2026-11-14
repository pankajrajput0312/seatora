import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Closing, Dash, DemoSource, HISTORY_CAPTION, PageHead, ReachBadge } from "@/features/decide/components/bits";
import { CompareFromDevice, RemoveFromCompare } from "@/features/decide/components/compare-controls";
import { courseName } from "@/features/decide/components/options-view";
import { formatLakh } from "@/features/decide/lib/format";
import { MAX_COMPARE } from "@/features/decide/lib/choices";
import { decideLinks } from "@/features/decide/lib/links";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getOptionsByIds, type OptionRow } from "@/features/decide/service";

export const metadata: Metadata = { title: "Compare" };

const rowsSpec: { label: string; cell: (r: OptionRow) => React.ReactNode }[] = [
  { label: "Course", cell: (r) => courseName(r) },
  { label: "Quota", cell: (r) => r.quota },
  { label: "State · type", cell: (r) => `${r.college.state ?? "—"} · ${r.college.type ?? "—"}` },
  { label: "Your reach", cell: (r) => <ReachBadge reach={r.reach} provisional /> },
  { label: "2026 R1 (provisional)", cell: (r) => (r.latest ? <span className="numeric">{formatRank(r.latest.closing)}</span> : <Dash />) },
  { label: "2025 deepest closing", cell: (r) => <Closing d={r.byYear[2025]} /> },
  { label: "2024 deepest closing", cell: (r) => <Closing d={r.byYear[2024]} /> },
  {
    label: "Allotments made (all rounds)",
    cell: (r) => <span className="numeric">{[2024, 2025, 2026].map((y) => `${y}: ${Object.values(r.grid[y] ?? {}).reduce((s, c) => s + (c?.n ?? 0), 0)}`).join(" · ")}</span>,
  },
  { label: "Fee", cell: (r) => (r.feeInr != null ? <span className="numeric">{formatLakh(r.feeInr)}/yr</span> : r.feeText ?? <Dash />) },
  { label: "Stipend", cell: (r) => r.stipendText ?? <Dash /> },
  { label: "Bond", cell: (r) => r.bondText ?? "No bond listed" },
  { label: "Bond penalty", cell: (r) => r.penaltyText ?? <Dash /> },
  { label: "Clinical load", cell: () => <span className="text-muted-foreground">— Not yet collected</span> },
];

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, MAX_COMPARE);
  const options = await getOptionsByIds(ids, profile);
  const L = decideLinks(params);

  return (
    <Container className="py-10">
      <CompareFromDevice />
      <PageHead title="Compare">Up to {MAX_COMPARE} options side by side. Add them with the compare button on Options or an institute page.</PageHead>

      {options.length === 0 ? (
        <div className="mt-8 grid place-items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="font-medium">Nothing to compare yet.</p>
          <Link href="/decide/options" className="text-sm text-sky underline">Pick options to compare</Link>
        </div>
      ) : (
        <div role="region" aria-label="Comparison" tabIndex={0} className="mt-8 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Comparison of {options.length} options</caption>
            <thead>
              <tr className="border-b border-border align-top">
                <td className="sticky left-0 z-10 w-44 bg-card p-3" />
                {options.map((r) => (
                  <th key={r.id} scope="col" className="p-3 text-left font-medium">
                    <div className="flex items-start justify-between gap-2">
                      <span><Link href={L.institute(r.college.slug)} className="hover:text-sky hover:underline">{r.college.name}</Link><span className="mt-1 flex gap-3 text-xs font-normal"><Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className="text-sky underline">Last ranks</Link><Link href={L.allotments({ course: r.course.slug, inst: r.college.slug })} className="text-sky underline">Allotments</Link></span></span>
                      <RemoveFromCompare id={r.id} label={r.college.name} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsSpec.map((s) => (
                <tr key={s.label} className="border-b border-border align-top last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-card p-3 text-left text-xs font-normal text-muted-foreground">{s.label}</th>
                  {options.map((r) => <td key={r.id} className="p-3">{s.cell(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
        <p>{HISTORY_CAPTION}</p>
        <DemoSource />
      </div>
    </Container>
  );
}
