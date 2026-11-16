import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, HistoryNote, PageHead, Provisional } from "@/features/decide/components/bits";
import { InfoTip } from "@/features/decide/components/info-tip";
import { hospitalInfo } from "@/features/decide/components/institute/institute-data";
import { bigClosing, cardMeta } from "@/features/decide/components/ranks/rank-cards";
import { ResultCard, ResultCards } from "@/features/decide/components/result-card";
import { StatHead, TermStatCells } from "@/features/decide/components/stat-cells";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { ActiveFilters, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView } from "@/features/decide/server/view";
import { decideLinks, type DecideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { statKeys } from "@/features/decide/lib/stat-format";
import { anyTermFilter, readTermFilters, splitByTerms, termChips, termValueLabel } from "@/features/decide/lib/term-filters";
import { profileFromParams, profileHasCourse, toURLSearchParams } from "@/features/decide/profile";
import { getCollege, getMeta, lastRanks, type OptionRow } from "@/features/decide/service";
import { baseCategories, roundLabel, rounds, type Round } from "@/features/decide/types";
import { ScrollTable } from "@/features/decide/components/scroll-table";

export const metadata: Metadata = { title: "Last ranks" };
// ponytail: 25 a page: each card carries its five term cells and their (i)s (both views are in the page).
const PAGE_SIZE = 25;
const VIEW = "last-ranks";
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

type Col = { year: number; rounds: Round[]; provisional: boolean };

/** A closing with the allotments made that round in brackets: "11,842 (20)". `stack`: the count on its own line (cards). */
function Cell({ c, stack }: { c: OptionRow["grid"][number][Round]; stack?: boolean }) {
  if (!c) return <Dash />;
  return <>{formatRank(c.closing)} <span className={`${stack ? "block text-xs" : "text-xs"} text-muted-foreground`}>({formatRank(c.n)})</span></>;
}

/** A card's year × round grid, newest year first, rounds R1 → special stray. */
function YearGrid({ r, cols, rds, caption }: { r: OptionRow; cols: Col[]; rds: Round[]; caption: string }) {
  return (
    <div className="overflow-x-auto overflow-y-hidden px-2 pb-1">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="px-1.5 py-1.5 text-left font-semibold">Year</th>
            {rds.map((rd) => <th key={rd} scope="col" className="px-1.5 py-1.5 text-right font-semibold">{roundLabel[rd]}</th>)}
          </tr>
        </thead>
        <tbody>
          {cols.map((c) => (
            <tr key={c.year} className="border-t border-border">
              <th scope="row" className="px-1.5 py-1.5 text-left align-top font-semibold">
                <span className="numeric">{c.year}</span>
                {Object.values(r.grid[c.year] ?? {}).some((x) => x?.provisional) && <span className="block"><Provisional when /></span>}
              </th>
              {/* A round that year never had: a blank cell, not "—" (no allotment). */}
              {rds.map((rd) => (c.rounds.includes(rd) ? <td key={rd} className="numeric px-1.5 py-1.5 text-right align-top"><Cell c={r.grid[c.year]?.[rd]} stack /></td> : <td key={rd} />))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LastRankCard({ r, cols, rds, stat, mcc, L, course, mine }: {
  r: OptionRow;
  cols: Col[];
  rds: Round[];
  /** The sorted column; else each card shows its own newest closing (its newest year's R1, else that year's first round). */
  stat: { year: number; round: Round } | null;
  mcc: string | null | undefined;
  L: DecideLinks;
  course: { slug: string; label: string };
  mine?: boolean;
}) {
  const of = `${r.college.name}, ${r.quota}`;
  const big = bigClosing(r.grid, cols.map((c) => c.year), stat);
  return (
    <ResultCard
      className={mine ? "border-sky" : undefined}
      chips={[r.quota]}
      actions={<Link href={L.allotments({ course: course.slug, inst: r.college.slug })} className={`${smallLink} px-3 text-xs text-sky`}>Allotments</Link>}
      stat={big ? { label: `${big.year} ${roundLabel[big.round]}`, value: <span className="numeric">{big.cell ? formatRank(big.cell.closing) : <Dash />}</span> } : undefined}
      title={r.college.name}
      href={L.institute(r.college.slug)}
      external={mcc ? { href: mcc, label: `MCC profile: ${r.college.name}` } : undefined}
      meta={cardMeta({ state: r.college.state, hospital: r.hospital }, r.college.name)}
      footer={
        <>
          <YearGrid r={r} cols={cols} rds={rds} caption={`${of}: closing rank (allotments) by year and round, newest year first`} />
          <TermStatCells t={r.fees} of={`${r.college.name}, ${course.label}`} />
        </>
      }
    />
  );
}

export default async function LastRanksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const tp = readTermFilters(params, profile);
  const meta = await getMeta();
  // Default: one of her courses (when she named any), MD/MS first, then DNB, then the rest (meta sorts Diploma first).
  const order = (d: string) => (["MD", "MS", "DNB"].includes(d) ? ["MD", "MS", "DNB"].indexOf(d) : 3);
  const mine = profile && (profile.pairs?.length || profile.specialties.length) ? meta.courses.filter((c) => profileHasCourse(profile, c)) : [];
  const course = meta.courses.find((c) => c.slug === f.course) ?? mine.sort((a, b) => order(a.degree) - order(b.degree))[0] ?? meta.courses[0];
  const category = f.lcat ?? profile?.category ?? "Open";
  const quota = f.lquota && meta.quotas.includes(f.lquota) ? f.lquota : undefined;
  const [sortYear, sortRound] = f.sort?.split("-") ?? [];
  const sort = f.sort ? { year: Number(sortYear), round: sortRound as Round, dir: f.dir } : undefined;
  const filtered = anyTermFilter(tp.filters);
  const base = { specialty: course.specialty, degree: course.degree, category, quota, sort };
  const [lr, all, inst, info, view] = await Promise.all([
    lastRanks({ ...base, terms: tp.filters }),
    // A term filter set: every row as well, to count those left out only for a value not declared (as Rank scan), and
    // to tell an institute the filters hide from one with no closing.
    filtered ? lastRanks(base) : null,
    f.inst ? getCollege(f.inst) : null,
    hospitalInfo(),
    chosenView(params, VIEW),
  ]);

  // The service builds every row for the course anyway (one SQL read); only this page's rows are rendered. A link
  // from an institute (inst) opens the page that holds its row unless a page is asked for (so the Pager always sets one).
  const at = inst ? lr.rows.findIndex((r) => r.college.slug === inst.slug) : -1;
  const hidden = !!inst && at < 0 && !!all?.rows.some((r) => r.college.slug === inst.slug);
  const unknown = all ? splitByTerms(all.rows, tp.filters, (r) => r.fees, (r) => r.hospital?.type?.value).unknown.length : 0;
  const page = Math.min(Math.max(1, Math.ceil(lr.total / PAGE_SIZE)), f.page ?? (at >= 0 ? Math.floor(at / PAGE_SIZE) + 1 : 1));
  const rows = lr.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Newest year first; rounds R1 → special stray within a year (the service's order).
  const cols: Col[] = lr.columns.filter((c) => !f.since || c.year >= f.since).sort((a, b) => b.year - a.year);
  const years = cols.map((c) => c.year);
  const rds = rounds.filter((rd) => cols.some((c) => c.rounds.includes(rd)));
  // The card's big number: the sorted column (else each row's newest closing).
  const stat = sort && cols.some((c) => c.year === sort.year) ? { year: sort.year, round: sort.round } : null;
  const courseLabel = `${course.degree} ${course.name}`;
  const courseRef = { slug: course.slug, label: courseLabel };
  const caption = `Closing ranks for ${courseLabel}, ${category} seats${quota ? `, ${quota}` : ""}`;
  const sortHref = (key: string) => L.with("/decide/last-ranks", { sort: key, dir: f.sort === key && f.dir === "desc" ? "asc" : "desc", page: null });
  const pinned = at >= 0 ? lr.rows[at] : null;
  const mcc = (r: OptionRow) => info.get(r.college.key)?.mccProfileUrl;
  const chips = [
    // Her profile's caps apply here as on Options and Fees (an absent maxfee / bondyrs is hers); "any" lifts one.
    ...(profile?.maxFeeLakh != null && tp.params.maxfee == null ? [{ label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, href: L.with("/decide/last-ranks", { maxfee: "any", page: null }) }] : []),
    ...(profile?.maxBondYears != null && tp.params.bondyrs == null ? [{ label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, href: L.with("/decide/last-ranks", { bondyrs: "any", page: null }) }] : []),
    ...termChips(tp.params).map((c) => ({ label: c.label, href: L.with("/decide/last-ranks", { [c.key]: null, page: null }) })),
  ];
  const clear = L.with("/decide/last-ranks", { ctype: null, maxfee: null, minstip: null, bondyrs: null, maxbond: null, maxleave: null, nd: null, page: null });
  const about = (
    <>
      Closing = the highest All India Rank allotted that round on a {category} seat. Brackets = allotments made that round
      in every seat category (in R2 and later, new or upgraded allotments only), not the seat matrix. Fee, stipend, bond and
      leaving: the row&apos;s cells, each (i) with the exact words and source.
    </>
  );

  const table = (
    <ScrollTable label={caption} scrollClassName="[scroll-padding-inline-start:16rem] max-md:[scroll-padding-inline-start:8.5rem]">
      <table className="w-full min-w-[56rem] text-sm">
        <caption className="sr-only">{caption}, page {page}, newest year first</caption>
        <colgroup />
        {cols.map((c) => <colgroup key={c.year} span={c.rounds.length} />)}
        <thead className={tbl.head}>
          <tr className="text-xs text-muted-foreground">
            <th rowSpan={2} scope="col" className={`sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold ${tbl.pin}`}>Institute</th>
            {cols.map((c) => (
              <th key={c.year} scope="colgroup" colSpan={c.rounds.length} className="border-l border-border px-2 py-2 text-center text-xs font-semibold">
                <span className="numeric">{c.year}</span> <Provisional when={c.provisional} />
              </th>
            ))}
            {/* The course's terms after the closing ranks (the page's figures come first; the cards lead with both). */}
            {statKeys.map((k) => <th key={k} rowSpan={2} scope="col" className="px-2 py-2 text-right text-xs font-semibold whitespace-nowrap"><StatHead k={k} /></th>)}
          </tr>
          <tr className="text-xs text-muted-foreground">
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
            const here = inst?.slug === r.college.slug;
            return (
              <tr key={r.id} className={`border-b border-border last:border-0 hover:bg-muted/50 ${here ? "bg-sky/10" : ""}`}>
                <th scope="row" className={`sticky left-0 z-[1] max-w-64 px-3 py-2 text-left font-normal ${here ? "bg-mist" : "bg-card"} ${tbl.pin}`}>
                  <Link href={L.institute(r.college.slug)} title={r.college.name} className={`font-medium hover:text-sky hover:underline ${tbl.clamp}`}>{r.college.name}</Link>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>{r.college.state ?? <Dash />}, {r.quota}</span>
                    {r.hospital?.type && <TypeBadge type={r.hospital.type} of={r.college.name} />}
                  </span>
                  <Link href={L.allotments({ course: course.slug, inst: r.college.slug })} className={`${smallLink} text-xs text-sky`}>Allotments</Link>
                </th>
                {cols.flatMap((c) =>
                  c.rounds.map((round, i) => (
                    <td key={`${c.year}-${round}`} className={`numeric px-2 py-2 text-right ${i === 0 ? "border-l border-border" : ""}`}>
                      <Cell c={r.grid[c.year]?.[round]} />
                    </td>
                  )),
                )}
                <TermStatCells t={r.fees} variant="compact" of={`${r.college.name}, ${courseLabel}`} tdClassName="px-2 py-2" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollTable>
  );

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead title="Last ranks" about={about}>Newest year first.</PageHead>

      {/* Filters, the count and the results tools on one row (globals.css .filter-row); chips and notes under it. */}
      <div className="filter-row">
      <FilterBar action="/decide/last-ranks" params={params} cols="md:grid-cols-4 [&>label]:min-w-0" active={chips.length} clear={clear}>
        {inst && <input type="hidden" name="inst" value={inst.slug} />}
        <Field label="Course"><Select name="course" value={course.slug} options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
        <Field label="Seat category"><Select name="lcat" value={category} options={categories.map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Quota"><Select name="lquota" value={quota} all="All quotas" options={meta.quotas.map((q) => ({ value: q, label: q }))} /></Field>
        <Field label="From year"><Select name="since" value={f.since ? String(f.since) : undefined} all="All years" options={[...lr.columns].sort((a, b) => b.year - a.year).map((c) => ({ value: String(c.year), label: String(c.year) }))} /></Field>
        <TermFilterControls f={tp.params} caps={profile} />
      </FilterBar>
      <ActiveFilters items={chips} clear={clear} />

      {inst && at < 0 && (
        <p className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          {hidden ? (
            <>
              {inst.name} doesn&apos;t match these filters.{" "}
              <Link href={L.with("/decide/last-ranks", { ctype: null, maxfee: "any", minstip: null, bondyrs: "any", maxbond: null, maxleave: null, nd: null, page: null })} className={`${smallLink} text-sky`}>Show it without them</Link>
            </>
          ) : (
            <>
              {inst.name}: no {category}-seat closing for {courseLabel}{quota ? `, ${quota}` : ""}.{" "}
              {category !== "Open" && <Link href={L.with("/decide/last-ranks", { lcat: "Open", page: null })} className={`${smallLink} text-sky`}>Show Open seats</Link>}{" "}
              <Link href={L.allotments({ course: course.slug, inst: inst.slug })} className={`${smallLink} text-sky`}>See its allotments</Link>
            </>
          )}
        </p>
      )}

      <div className={toolbarRow}>
        {/* The results' sources here, before the panes: MCC results are numbered first (the cards' term (i)s come after). */}
        <div className="grid gap-0.5">
          <p id="results" tabIndex={-1} aria-live="polite" className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            <span><span className="numeric font-semibold text-foreground">{rangeLabel({ ...lr, rows, page, pageSize: PAGE_SIZE })}</span> options</span>
            <InfoTip label="these options">
              Each option is an institute and quota with a closing on {category} seats for {courseLabel}
              {lr.empty > 0 && <>; <span className="numeric">{formatRank(lr.empty)}</span> more had no {category}-seat allotments for it</>}.
            </InfoTip>
            {unknown > 0 && (
              <Link href={L.with("/decide/last-ranks", { nd: "keep", page: null })} className={`${smallLink} text-sky`}>
                Include <span className="numeric mx-1">{formatRank(unknown)}</span> without a published figure
              </Link>
            )}
           <ColourLegend className="ml-1 align-middle" /></p>
          <DataSource used={years.map((year) => ({ year }))} />
        </div>
        {lr.total > 0 && <ViewToggle page={VIEW} view={view} />}
      </div>
      </div>

      {/* Her institute (a link from it, #inst-…) in view in either view: its card above the list. */}
      {pinned && (
        <div id={`inst-${pinned.college.slug}`} tabIndex={-1} className="scroll-mt-24">
          <LastRankCard r={pinned} cols={cols} rds={rds} stat={stat} mcc={mcc(pinned)} L={L} course={courseRef} mine />
        </div>
      )}

      {lr.total === 0 ? (
        <EmptyState title={filtered && all?.total ? "No options match these filters" : `No ${category}-seat closings for ${courseLabel}${quota ? `, ${quota}` : ""}`} description="Try another seat category, quota or filter." href={L.to("/decide/last-ranks", { course: course.slug, maxfee: "any", bondyrs: "any" })} />
      ) : (
        <ViewPanes
          page={VIEW}
          view={view}
          cards={
            <ResultCards title={caption} hideTitle>
              {rows.map((r) => <LastRankCard key={r.id} r={r} cols={cols} rds={rds} stat={stat} mcc={mcc(r)} L={L} course={courseRef} mine={inst?.slug === r.college.slug} />)}
            </ResultCards>
          }
          table={table}
        />
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={lr.total} href={(n) => L.with("/decide/last-ranks", { page: n })} focusId="results" label="Last ranks" />

      <HistoryNote />
    </AppPage>
  );
}
