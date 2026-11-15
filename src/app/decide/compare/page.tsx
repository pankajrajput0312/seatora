import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { z } from "zod";
import { formatRank } from "@/features/cutoffs/lib/format";
import { gridRounds } from "@/features/decide/api";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { Dash, HistoryNote, PageHead, ReachBadge } from "@/features/decide/components/bits";
import { CompareFromDevice, RemoveFromCompare } from "@/features/decide/components/compare-controls";
import { ClosingCell, courseName, RoundGrid } from "@/features/decide/components/options-view";
import { Beds } from "@/features/decide/components/pages/beds";
import { TermStatCells } from "@/features/decide/components/stat-cells";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { EmptyState, smallLink, tbl } from "@/features/decide/components/ui";
import { MAX_COMPARE } from "@/features/decide/lib/choices";
import { decideLinks } from "@/features/decide/lib/links";
import { parseSearchParams } from "@/features/decide/lib/params";
import { eligibleCategories } from "@/features/decide/lib/reach";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { statKeys, statLabel } from "@/features/decide/lib/stat-format";
import { currentOptionIds, getMeta, getOptionsByIds, LATEST_YEAR, PAST_YEARS, YEARS, type OptionRow } from "@/features/decide/service";

export const metadata: Metadata = { title: "Compare" };

/**
 * ids: repeated or comma-joined option ids, under the college key each college has now (an old link's retired keys);
 * duplicates and unknown ids are dropped, then anything past the 4th.
 */
const paramsSchema = z.object({ ids: z.array(z.string().min(1).max(300)).default([]) });

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const ids = [...new Set(await currentOptionIds([...new Set(parseSearchParams(paramsSchema, params, ["ids"]).ids)].slice(0, 5 * MAX_COMPARE)))];
  const [known, meta] = await Promise.all([getOptionsByIds(ids, profile), getMeta()]);
  const options = known.slice(0, MAX_COMPARE);
  const L = decideLinks(params);
  const yearLabel = (y: number) => meta.years.find((x) => x.year === y)?.label ?? String(y);
  const [older, last] = PAST_YEARS;
  // Each option's stat cells (one <td> per stat key, statKeys order), each placed in its key's row; left-aligned like
  // the column's other rows (`!`: the cell says text-right). ponytail: called as a function to split its <td>s across
  // rows; a one-cell export from stat-cells.tsx would replace it.
  const terms = new Map(options.map((r) => [r.id, TermStatCells({ t: r.fees, variant: "table", of: `${r.college.name}, ${courseName(r)}, ${r.quota}`, tdClassName: "p-3! text-left!" }) as React.ReactElement[]]));

  // `td`: a row whose cells come whole (the stat cells), else `cell`, the content of a plain cell.
  const rows: { label: string; cell?: (r: OptionRow) => React.ReactNode; td?: (r: OptionRow) => React.ReactElement }[] = [
    { label: "Quota", cell: (r) => r.quota },
    { label: "State", cell: (r) => r.college.state ?? <Dash /> },
    { label: "Type", cell: (r) => (r.hospital?.type ? <TypeBadge type={r.hospital.type} of={r.college.name} /> : <Dash />) },
    { label: "Beds (as reported)", cell: (r) => (r.hospital?.beds ? <Beds b={r.hospital.beds} inst={r.college.name} of={`${r.college.name}, ${courseName(r)}, ${r.quota}`} /> : <Dash />) },
    {
      label: "Your reach",
      cell: (r) =>
        profile ? (
          <ReachBadge reach={r.reach} provisional={r.reachProvisional} />
        ) : (
          <Link href={L.with("/decide/compare", { editProfile: "1" })} className={`${smallLink} text-sky`}>Set your rank to see</Link>
        ),
    },
    ...statKeys.map((k, i) => ({ label: statLabel[k], td: (r: OptionRow) => terms.get(r.id)![i] })),
    { label: `${LATEST_YEAR} R1 closing`, cell: (r) => <ClosingCell d={r.latest} /> },
    { label: `${last} deepest closing`, cell: (r) => <ClosingCell d={r.byYear[last]} /> },
    { label: `${older} deepest closing`, cell: (r) => <ClosingCell d={r.byYear[older]} /> },
    { label: "Closing by year and round", cell: (r) => <RoundGrid row={r} caption={`${r.college.name}, ${courseName(r)}, ${r.quota}: closing ranks by year and round`} /> },
    {
      label: "Allotments made (all rounds, all categories)",
      cell: (r) => (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
          {[...YEARS].sort((a, b) => b - a).flatMap((y) => [
            <dt key={`t${y}`} className="text-muted-foreground">{yearLabel(y)}</dt>,
            <dd key={`d${y}`} className="numeric text-right font-semibold">{r.allotmentsByYear[y] != null ? formatRank(r.allotmentsByYear[y]) : <Dash />}</dd>,
          ])}
        </dl>
      ),
    },
    {
      label: "More",
      cell: (r) =>
        r.reach !== "new" && (
          <span className="flex flex-wrap gap-x-4 text-xs">
            <Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className={`${smallLink} text-sky`}>Last ranks</Link>
            <Link href={L.allotments({ course: r.course.slug, inst: r.college.slug })} className={`${smallLink} text-sky`}>Allotments</Link>
          </span>
        ),
    },
  ];

  return (
    <AppPage className="py-6">
      <CompareFromDevice validIds={known.map((o) => o.id)} requested={ids} />
      <PageHead title="Compare" about={`Up to ${MAX_COMPARE} options side by side. Add them with the compare button on Options, Choices or an institute page.`} />

      {options.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Nothing to compare yet"
          description={`Pick up to ${MAX_COMPARE} options with the compare button, then open Compare again.`}
          href={L.options()}
          action="Pick options to compare"
        />
      ) : (
        <div role="region" aria-label="Comparison" tabIndex={0} className={`relative mt-8 rounded-xl border border-border bg-card [scroll-padding-inline-start:11rem] ${tbl.scroll}`}>
          <table className="w-full text-sm">
            <caption className="sr-only">Comparison of {options.length} {options.length === 1 ? "option" : "options"}</caption>
            <thead className={tbl.head}>
              <tr className="align-top">
                <td className="sticky left-0 z-10 w-44 bg-card p-3" />
                {options.map((r, i) => (
                  <th key={r.id} id={`col-${r.id}`} tabIndex={-1} scope="col" className="p-3 text-left font-medium">
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        <Link href={L.institute(r.college.slug)} className="hover:text-sky hover:underline">{r.college.name}</Link>
                        {/* The quota is the first row; screen readers hear it with each cell's column name. */}
                        <span className="block text-xs font-normal text-muted-foreground">{courseName(r)}<span className="sr-only">, {r.quota}</span></span>
                      </span>
                      <RemoveFromCompare id={r.id} label={`${r.college.name}, ${courseName(r)}, ${r.quota}`} nextFocus={options[i + 1]?.id ?? options[i - 1]?.id ?? null} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.label} className="border-b border-border align-top last:border-0">
                  <th scope="row" className="sticky left-0 z-[1] bg-card p-3 text-left text-xs font-normal text-muted-foreground">{s.label}</th>
                  {options.map((r) => (s.td ? <Fragment key={r.id}>{s.td(r)}</Fragment> : <td key={r.id} className="numeric p-3">{s.cell?.(r)}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
        <HistoryNote
          more={
            options.length > 0 && (
              <>
                {profile
                  ? `Closing ranks are on ${eligibleCategories(profile.category, profile.pwd).join(" or ")} seats, the seat categories you can take; each says which.`
                  : "No rank set, so closing ranks are the deepest on any seat category; each says which."}{" "}
                Allotments count every category and round, not the seat matrix.
              </>
            )
          }
        />
        <DataSource used={gridRounds(options)} />
      </div>
    </AppPage>
  );
}
