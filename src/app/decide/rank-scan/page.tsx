import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { PageHead, Provisional } from "@/features/decide/components/bits";
import { InfoTip } from "@/features/decide/components/info-tip";
import { cardMeta, subLink, termCol, withRowInfo, youMarks } from "@/features/decide/components/ranks/rank-cards";
import { ResultCard } from "@/features/decide/components/result-card";
import { StatHead, TermStatCells } from "@/features/decide/components/stat-cells";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { ActiveFilters, control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView } from "@/features/decide/server/view";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams, rankValue } from "@/features/decide/lib/params";
import { readTermFilters, splitByTerms, termChips, termValueLabel } from "@/features/decide/lib/term-filters";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, rankScan } from "@/features/decide/service";
import { statKeys } from "@/features/decide/lib/stat-format";
import { roundLabel, rounds } from "@/features/decide/types";

export const metadata: Metadata = { title: "Rank scan" };
const VIEW = "rank-scan";
// ponytail: 50 a page (rounds in order, ranks within a round): each card carries its five term cells and their (i)s,
// and both views are in the page. ±500 is about 550 rows in a busy year.
const PAGE_SIZE = 50;
const windows = ["100", "250", "500"] as const;
const schema = z.object({
  scan: rankValue.optional(),
  year: z.coerce.number().int().optional(),
  w: z.enum(windows).default("250"),
  round: z.enum(rounds).optional(),
  page: pageValue.optional(),
});

export default async function RankScanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const view = await chosenView(params, VIEW);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const tp = readTermFilters(params, profile);
  const meta = await getMeta();
  const typed = params.get("scan")?.trim() || null;
  const invalid = typed != null && f.scan == null;
  const rank = invalid ? null : (f.scan ?? profile?.rank ?? null);
  // Default: the newest year whose results are final.
  const year = meta.years.find((y) => y.year === f.year) ?? meta.years.find((y) => !y.provisional) ?? meta.years[0];
  const window = Number(f.w);
  const round = f.round && year?.rounds.includes(f.round) ? f.round : undefined;
  const scanned = rank && year ? await withRowInfo((await rankScan(rank, year.year, window)).flatMap((g) => g.rows).filter((a) => !round || a.round === round)) : [];
  // Fee, stipend, bond, leaving and type filters on each allotment's course and quota (lib/term-filters.ts).
  const { kept, unknown } = splitByTerms(scanned, tp.filters, (a) => a.fees, (a) => a.hospital?.type?.value);
  type Row = (typeof kept)[number];
  const you = rank ? youMarks(kept, rank) : new Set<Row>();
  const page = Math.min(Math.max(1, Math.ceil(kept.length / PAGE_SIZE)), f.page ?? 1);
  const rows = kept.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const groups = rounds.map((rd) => ({ round: rd, rows: rows.filter((a) => a.round === rd) })).filter((g) => g.rows.length);
  const courseOf = new Map(meta.courses.map((c) => [`${c.degree}|${c.specialty}`, c]));
  const provisional = (rd: string) => meta.sources.some((s) => s.year === year?.year && s.round === rd && s.provisional);
  const chips = [
    // Her profile's caps apply here as on Options and Fees (an absent maxfee / bondyrs is hers); "any" lifts one.
    ...(profile?.maxFeeLakh != null && tp.params.maxfee == null ? [{ label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, href: L.with("/decide/rank-scan", { maxfee: "any", page: null }) }] : []),
    ...(profile?.maxBondYears != null && tp.params.bondyrs == null ? [{ label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, href: L.with("/decide/rank-scan", { bondyrs: "any", page: null }) }] : []),
    ...termChips(tp.params).map((c) => ({ label: c.label, href: L.with("/decide/rank-scan", { [c.key]: null, page: null }) })),
  ];
  const clear = L.with("/decide/rank-scan", { ctype: null, maxfee: null, minstip: null, bondyrs: null, maxbond: null, maxleave: null, nd: null, page: null });
  const course = (a: Row) => courseOf.get(`${a.degree}|${a.specialty}`);
  const courseName = (a: Row) => `${a.degree} ${course(a)?.name ?? a.specialty}`;
  const youText = rank ? `Your rank, ${formatRank(rank)}, falls here` : "";

  return (
    <AppPage className="grid grid-cols-1 gap-4">
      <PageHead
        title="Rank scan"
        about="Allotments to ranks near yours, round by round, in one year's MCC results: every course and seat category. In R2 and later only new or upgraded allotments are listed."
      />

      <FilterBar
        action="/decide/rank-scan"
        params={params}
        cols="md:grid-cols-4 [&>label]:min-w-0"
        active={chips.length}
        clear={clear}
        search={
          <Field label="Rank" className="w-48">
            <input name="scan" inputMode="numeric" defaultValue={typed ?? rank ?? ""} placeholder="e.g. 42,284" aria-invalid={invalid || undefined} aria-describedby={invalid ? "scan-error" : undefined} className={`${control} numeric`} />
          </Field>
        }
      >
        <Field label="Year"><Select name="year" value={year ? String(year.year) : undefined} options={meta.years.map((y) => ({ value: String(y.year), label: y.label }))} /></Field>
        <Field label="Range"><Select name="w" value={f.w} options={windows.map((w) => ({ value: w, label: `± ${formatRank(Number(w))}` }))} /></Field>
        <Field label="Round"><Select name="round" value={round} all="All rounds" options={(year?.rounds ?? []).map((r) => ({ value: r, label: roundLabel[r] }))} /></Field>
        <TermFilterControls f={tp.params} caps={profile} />
      </FilterBar>
      <ActiveFilters items={chips} clear={clear} />

      {invalid ? (
        <p id="scan-error" role="alert" className="text-sm text-ember">“{typed}” isn&apos;t a rank. Enter a whole number between 1 and 3,00,000, for example 42,284.</p>
      ) : !rank || !year ? (
        <EmptyState title="Enter a rank to scan" description="Type an All India Rank above, or set your rank, to see the allotments made to ranks around it." />
      ) : (
        <>
          <div className={toolbarRow}>
            {/* The results' sources here, before the panes: the MCC result is numbered first (the term (i)s come after). */}
            <div className="grid gap-0.5">
              <p id="results" tabIndex={-1} aria-live="polite" className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
                <span><span className="numeric font-semibold text-foreground">{rangeLabel({ rows, page, pageSize: PAGE_SIZE, total: kept.length })}</span> allotments: history, not a prediction</span>
                <InfoTip label="these allotments">
                  Ranks <span className="numeric">{formatRank(Math.max(1, rank - window))}–{formatRank(rank + window)}</span> in {year.label}, every course and seat
                  category{round ? `, ${roundLabel[round]} only` : ""}. A “Your rank falls here” line marks where ranks pass yours. What happened then, not what will happen now.
                </InfoTip>
                {unknown.length > 0 && (
                  <Link href={L.with("/decide/rank-scan", { nd: "keep", page: null })} className={`${smallLink} text-sky`}>
                    Include <span className="numeric mx-1">{formatRank(unknown.length)}</span> not declared
                  </Link>
                )}
               <ColourLegend className="ml-1 align-middle" /></p>
              <DataSource used={[{ year: year.year }]} />
            </div>
            {groups.length > 0 && <ViewToggle page={VIEW} view={view} />}
          </div>
          {groups.length === 0 && <EmptyState title="No allotments in this range" description="No seat was allotted to these ranks that year, or none passed the filters. Try a wider range, another year or fewer filters." />}
          {groups.map((g) => {
            const label = `${year.year} ${roundLabel[g.round]} allotments`;
            const courseLink = (a: Row) => L.allotments({ course: course(a)?.slug, inst: a.collegeSlug, year: year.year, round: g.round });
            const of = (a: Row) => `${a.collegeName}, ${courseName(a)}, rank ${formatRank(a.rank)}`;
            return (
              <section key={g.round} aria-labelledby={`r-${g.round}`} className="grid grid-cols-1 gap-3">
                <h2 id={`r-${g.round}`} className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  <span><span className="numeric">{year.year}</span> {roundLabel[g.round]}</span> <Provisional when={provisional(g.round)} />
                </h2>
                <ViewPanes
                  page={VIEW}
                  view={view}
                  cards={
                    <div role="region" aria-label={label}>
                      <ul role="list" className="grid gap-3 lg:grid-cols-2">
                        {g.rows.flatMap((a, i) => [
                          ...(you.has(a) ? [<li key="you" className="rounded-md bg-sky/10 px-4 py-1.5 text-xs font-semibold text-sky lg:col-span-2">{youText}</li>] : []),
                          <li key={i} className="grid min-w-0">
                            <ResultCard
                              chips={[a.quota, `${a.category} seat`, a.remark]}
                              stat={{
                                label: "Rank",
                                value: <span className="numeric inline-flex min-h-11 items-center">{formatRank(a.rank)}</span>,
                              }}
                              title={a.collegeName}
                              href={a.collegeSlug ? L.institute(a.collegeSlug) : undefined}
                              external={a.mcc ? { href: a.mcc, label: `MCC profile: ${a.collegeName}` } : undefined}
                              subtitle={<Link href={courseLink(a)} className={subLink}>{courseName(a)}</Link>}
                              meta={cardMeta(a, a.collegeName)}
                              footer={<TermStatCells t={a.fees} of={of(a)} />}
                            />
                          </li>,
                        ])}
                      </ul>
                    </div>
                  }
                  table={
                    <div role="region" aria-label={label} tabIndex={0} className={tbl.wrap}>
                      <table className={tbl.table}>
                        <caption className="sr-only">{year.year} {roundLabel[g.round]}: allotments to ranks near {formatRank(rank)}</caption>
                        <thead>
                          <tr className={tbl.headRow}>
                            <th scope="col" className={`${tbl.th} text-right`}>Rank</th>
                            <th scope="col" className={tbl.th}>Seat category</th>
                            <th scope="col" className={tbl.th}>Institute and course</th>
                            {statKeys.map((k) => <th key={k} scope="col" className={`${termCol.th(k)} whitespace-nowrap`}><StatHead k={k} /></th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.flatMap((a, i) => [
                            ...(you.has(a) ? [<tr key="you" className="bg-sky/10"><td colSpan={3 + statKeys.length} className="px-4 py-1.5 text-xs font-semibold text-sky">{youText}</td></tr>] : []),
                            <tr key={i} className={tbl.row}>
                              <td className={tbl.num}>{formatRank(a.rank)}</td>
                              <td className={tbl.td}>{a.category}</td>
                              <td className={`${tbl.td} min-w-52`}>
                                <Link href={L.institute(a.collegeSlug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{a.collegeName}</Link>
                                <span className="block"><Link href={courseLink(a)} className={subLink}>{courseName(a)}</Link></span>
                                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                                  {a.hospital?.type && <TypeBadge type={a.hospital.type} of={a.collegeName} />}
                                  <span>{a.quota}{a.remark && ` · ${a.remark}`}</span>
                                </span>
                              </td>
                              <TermStatCells t={a.fees} variant="compact" of={of(a)} tdClassName={termCol.td} />
                            </tr>,
                          ])}
                        </tbody>
                      </table>
                    </div>
                  }
                />
              </section>
            );
          })}
          <Pager page={page} pageSize={PAGE_SIZE} total={kept.length} href={(n) => L.with("/decide/rank-scan", { page: n })} focusId="results" label="Rank scan" />
        </>
      )}
    </AppPage>
  );
}
