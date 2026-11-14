import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatRank } from "@/features/cutoffs/lib/format";
import { formatLakh } from "../lib/format";
import { reachLabel } from "../lib/reach";
import type { ChoiceItem } from "../lib/choices";
import type { DecideLinks } from "../lib/links";
import type { OptionRow } from "../service";
import { roundLabel, rounds, type Round } from "../types";
import { Closing, Dash, ReachBadge } from "./bits";
import { ChoiceStar, CompareToggle } from "./option-actions";

export const courseName = (r: Pick<OptionRow, "course">) => `${r.course.degree} ${r.course.name}`;

export function toChoiceItem(r: OptionRow): ChoiceItem {
  return {
    id: r.id, institute: r.college.name, slug: r.college.slug, state: r.college.state, course: courseName(r), courseSlug: r.course.slug, quota: r.quota,
    reachLabel: reachLabel(r.reach, 2026, [2024, 2025]), closedEveryRound: r.reach === "closed-before",
  };
}

/** Year × round grid: closing rank with its seat category, and allotments made (all categories) in brackets. */
export function RoundGrid({ row, caption }: { row: OptionRow; caption: string }) {
  const years = Object.keys(row.grid).map(Number).sort();
  const used = rounds.filter((r) => years.some((y) => row.grid[y]?.[r]));
  if (!years.length) return <p className="text-xs text-muted-foreground">No allotments in your seat categories.</p>;
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="relative overflow-x-auto">
      <table className="text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="py-1 pr-3 text-left font-normal">Year</th>
            {used.map((r) => <th key={r} scope="col" className="px-2 py-1 text-right font-normal">{roundLabel[r as Round]}</th>)}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y} className="border-t border-border">
              <th scope="row" className="py-1 pr-3 text-left font-normal">{y}{Object.values(row.grid[y] ?? {}).some((c) => c?.provisional) && <span className="block text-sun">provisional</span>}</th>
              {used.map((r) => {
                const c = row.grid[y]?.[r as Round];
                return (
                  <td key={r} className="numeric px-2 py-1 text-right">
                    {c ? <><span className="font-semibold">{formatRank(c.closing)}</span> <span className="text-muted-foreground">({c.n})</span><span className="block text-muted-foreground">{c.category} seat</span></> : <Dash />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-muted-foreground">Closing rank on that seat category; allotments made that round, all categories, in brackets.</p>
    </div>
  );
}

function FeeBond({ r }: { r: OptionRow }) {
  return (
    <span className="numeric">
      {r.feeInr != null ? `${formatLakh(r.feeInr)}/yr` : r.feeText ?? <Dash />}
      <span className="block text-xs text-muted-foreground">Bond: {r.bondText ?? <Dash />}</span>
    </span>
  );
}

function Related({ r, L }: { r: OptionRow; L: DecideLinks }) {
  return (
    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className="text-sky underline">Last ranks</Link>
      <Link href={L.allotments({ course: r.course.slug, inst: r.college.slug })} className="text-sky underline">Allotments</Link>
      <Link href={L.institute(r.college.slug, "fees")} className="text-sky underline">Fees & bond</Link>
    </span>
  );
}

export function OptionsTable({ rows, caption, start, L }: { rows: OptionRow[]; caption: string; start: number; L: DecideLinks }) {
  return (
    <>
      <div role="region" aria-label={caption} tabIndex={0} className="relative hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[1000px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th scope="col" className="w-12 px-2 py-3 font-normal"><span className="sr-only">Add to choices</span></th>
              <th scope="col" className="px-3 py-3 font-normal">Institute</th>
              <th scope="col" className="px-3 py-3 font-normal">Course</th>
              <th scope="col" className="px-3 py-3 font-normal">Reach</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">2026 R1</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">2025 deepest</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">2024 deepest</th>
              <th scope="col" className="px-3 py-3 font-normal">Fee · Bond</th>
              <th scope="col" className="w-12 px-2 py-3 font-normal"><span className="sr-only">Compare</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} data-item={start + i + 1} tabIndex={-1} className="border-b border-border align-top last:border-0 hover:bg-muted/40">
                <td className="px-2 py-2"><ChoiceStar item={toChoiceItem(r)} /></td>
                <th scope="row" className="px-3 py-3 text-left font-normal">
                  <Link href={L.institute(r.college.slug)} className="font-medium hover:text-sky hover:underline">{r.college.name}</Link>
                  <span className="block text-xs text-muted-foreground">{r.college.state}, {r.quota}</span>
                  <Related r={r} L={L} />
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-sky">Rounds by year</summary>
                    <div className="mt-2"><RoundGrid row={r} caption={`${r.college.name}, ${courseName(r)}: closing ranks by year and round`} /></div>
                  </details>
                </th>
                <td className="px-3 py-3"><Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className="hover:text-sky hover:underline">{courseName(r)}</Link></td>
                <td className="px-3 py-3"><ReachBadge reach={r.reach} provisional={!!r.latest?.provisional} /></td>
                <td className="px-3 py-3 text-right">
                  {r.latest ? <><Closing d={r.latest} />{r.latest.provisional && <Badge tone="warning" className="mt-1">Provisional</Badge>}</> : <Dash />}
                </td>
                <td className="px-3 py-3 text-right"><Closing d={r.byYear[2025]} /></td>
                <td className="px-3 py-3 text-right"><Closing d={r.byYear[2024]} /></td>
                <td className="px-3 py-3"><FeeBond r={r} /></td>
                <td className="px-2 py-2"><CompareToggle id={r.id} label={`${r.college.name}, ${courseName(r)}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden" aria-label={caption}>
        {rows.map((r, i) => (
          <li key={r.id} data-item={start + i + 1} tabIndex={-1}>
            <article className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-medium"><Link href={L.institute(r.college.slug)} className="hover:text-sky hover:underline">{r.college.name}</Link></h2>
                  <p className="text-xs text-muted-foreground">{courseName(r)} · {r.college.state} · {r.quota}</p>
                </div>
                <div className="flex shrink-0">
                  <ChoiceStar item={toChoiceItem(r)} />
                  <CompareToggle id={r.id} label={`${r.college.name}, ${courseName(r)}`} />
                </div>
              </div>
              <div className="mt-2"><ReachBadge reach={r.reach} provisional={!!r.latest?.provisional} /></div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">2026 R1{r.latest?.provisional ? " (provisional)" : ""}</dt><dd><Closing d={r.latest} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">2025 deepest</dt><dd><Closing d={r.byYear[2025]} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">2024 deepest</dt><dd><Closing d={r.byYear[2024]} /></dd></div>
              </dl>
              <p className="mt-3 text-sm"><FeeBond r={r} /></p>
              <Related r={r} L={L} />
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-sky">Rounds by year</summary>
                <div className="mt-2"><RoundGrid row={r} caption={`${r.college.name}, ${courseName(r)}: closing ranks by year and round`} /></div>
              </details>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}
