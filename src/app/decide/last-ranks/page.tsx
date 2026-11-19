import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { WaitForSaved } from "@/features/decide/components/dashboard-parts";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { AboutData } from "@/features/decide/components/filter-form";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, HistoryNote, InstName, PageHead, Provisional } from "@/features/decide/components/bits";
import { InfoTip } from "@/features/decide/components/info-tip";
import { hospitalInfo } from "@/features/decide/components/institute/institute-data";
import { bigClosing, cardMeta } from "@/features/decide/components/ranks/rank-cards";
import { ResultCard, ResultCards } from "@/features/decide/components/result-card";
import { StatHead, TermStatCells } from "@/features/decide/components/stat-cells";
import { TermFilterControls, UntypedNote } from "@/features/decide/components/term-filter-controls";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { ActiveFilters, control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView } from "@/features/decide/server/view";
import { decideLinks, type DecideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams, rankRange } from "@/features/decide/lib/params";
import { statKeys } from "@/features/decide/lib/stat-format";
import { anyTermFilter, readTermFilters, splitByTerms, termChips, termsPass, termValueLabel, untypedOnly } from "@/features/decide/lib/term-filters";
import { profileFromParams, profileQuotas, toURLSearchParams } from "@/features/decide/profile";
import { courseFilter } from "@/features/decide/lib/course-filter";
import { eligibleCategories, LATER_ROUNDS_NOTE } from "@/features/decide/lib/reach";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { courseName } from "@/features/decide/components/options-view";
import { getCollege, getMeta, lastRanks, type OptionRow } from "@/features/decide/service";
import { baseCategories, rounds, type Round } from "@/features/decide/types";
import { ScrollTable } from "@/features/decide/components/scroll-table";
import { activeExam, examInfo } from "@/features/exams/active";
import { DEFAULT_EXAM, exams, perGroup, roundNameIn } from "@/features/exams/registry";
import { quotaIn, roundIn, type Exam } from "@/features/exams/exam";
import { RoundNames, QuotaName } from "@/features/decide/components/round-name";

export const metadata: Metadata = { title: "Last ranks" };
// ponytail: 25 a page: each card carries its five term cells and their (i)s (both views are in the page).
const PAGE_SIZE = 25;
const VIEW = "last-ranks";
const categories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;
const schema = z.object({
  lcat: z.enum(categories).optional(),
  /** One quota, "all" for every one; absent = her quotas (the open ones when she ticked none), as Options. */
  lquota: z.string().max(100).optional(),
  q: z.string().trim().max(100).optional(),
  inst: z.string().max(200).optional(),
  /** A year-round column, e.g. "2025-R1" or "2024-special_stray". */
  sort: z.string().regex(new RegExp(`^\\d{4}-(${rounds.join("|")})$`)).optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  since: z.coerce.number().int().optional(),
  /** Closing rank against her AIR: "reached" (at or after it), "near" (within 10% either side). */
  rk: z.enum(["reached", "near"]).optional(),
  /** A closing-rank range typed in ("40,000"); either end may be open. Wins over rk. */
  rmin: z.string().max(12).optional(),
  rmax: z.string().max(12).optional(),
  page: pageValue.optional(),
});


type Col = { year: number; rounds: Round[]; provisional: boolean };

/** A closing with the allotments made that round in brackets: "11,842 (20)". `stack`: the count on its own line (cards). */
/** Her rank would have got this seat: it closed at or after her AIR (the page's note says so beside the same mark). */
const GOT = "rounded bg-sky/15 px-1 font-semibold text-foreground";

function Cell({ c, stack, rank }: { c: OptionRow["grid"][number][Round]; stack?: boolean; rank?: number }) {
  if (!c) return <Dash />;
  return <><span className={rank != null && c.closing >= rank ? GOT : undefined}>{formatRank(c.closing)}</span> <span className={`${stack ? "block text-xs" : "text-xs"} text-muted-foreground`}>({formatRank(c.n)})</span></>;
}

/** A card's year × round grid, newest year first, rounds R1 → special stray. */
function YearGrid({ r, cols, rds, caption, rank }: { r: OptionRow; cols: Col[]; rds: Round[]; caption: string; rank?: number }) {
  return (
    <div className="overflow-x-auto overflow-y-hidden px-2 pb-1">
      <table className="w-full text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="px-1.5 py-1.5 text-left font-semibold">Year</th>
            {rds.map((rd) => <th key={rd} scope="col" className="px-1.5 py-1.5 text-right font-semibold"><RoundNames years={cols.filter((c) => c.rounds.includes(rd)).map((c) => c.year)} round={rd} /></th>)}
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
              {rds.map((rd) => (c.rounds.includes(rd) ? <td key={rd} className="numeric px-1.5 py-1.5 text-right align-top"><Cell c={r.grid[c.year]?.[rd]} stack rank={rank} /></td> : <td key={rd} />))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LastRankCard({ r, cols, rds, stat, range, mcc, L, mine, rank, E }: {
  r: OptionRow;
  E: Exam;
  cols: Col[];
  rds: Round[];
  /** The sorted column; else each card shows its own newest closing (its newest year's R1, else that year's first round). */
  stat: { year: number; round: Round } | null;
  /** The closing-rank filter: the big number is the newest round that closed in it (the one that matched). */
  range?: { min?: number; max?: number };
  mcc: string | null | undefined;
  L: DecideLinks;
  mine?: boolean;
  rank?: number;
}) {
  const course = { slug: r.course.slug, label: courseName(r) };
  const of = `${r.college.name}, ${course.label}, ${quotaIn(E, r.quota)}`;
  const big = bigClosing(r.grid, cols.map((c) => c.year), stat, range);
  return (
    <ResultCard
      className={mine ? "border-sky" : undefined}
      chips={[quotaIn(E, r.quota)]}
      actions={<Link href={L.allotments({ course: course.slug, inst: r.college.slug })} className={`${smallLink} px-3 text-xs text-sky`}>Allotments</Link>}
      stat={big ? { label: `${big.year} ${roundIn(E, big.year, big.round)}`, value: <span className="numeric">{big.cell ? formatRank(big.cell.closing) : <Dash />}</span> } : undefined}
      title={r.college.name}
      href={L.institute(r.college.slug)}
      external={mcc ? { href: mcc, label: `MCC profile: ${r.college.name}` } : undefined}
      subtitle={course.label}
      meta={cardMeta({ state: r.college.state, hospital: r.hospital }, r.college.name)}
      footer={
        <>
          <YearGrid r={r} cols={cols} rds={rds} caption={`${of}: closing rank (allotments) by year and round, newest year first`} rank={rank} />
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
  const exam = await activeExam();
  const E = await examInfo(exam); // its data: fees once its import has them
  const EI = await examInfo(exam);
  const meta = await getMeta(exam);
  // Every one of her courses by default (lib/course-filter.ts), the picked ones otherwise; no profile courses: the first course.
  const cf = courseFilter(params, profile, meta.courses);
  const picked = cf.slugs ? meta.courses.filter((c) => cf.slugs!.has(c.slug)) : [];
  const courses = picked.length ? picked : [meta.courses[0]];
  const course = courses[0];
  // NEET PG: one seat category (hers, or the one picked). Another exam with nothing picked: every seat category she can
  // take (Open and her own, as Options and Rank scan), so a seat only Open is offered on (deemed) still shows.
  const mineCats = !f.lcat && exam !== DEFAULT_EXAM && profile ? eligibleCategories(profile.category, profile.pwd) : null;
  const category = mineCats ? mineCats.join(" or ") : (f.lcat ?? profile?.category ?? "Open");
  // Her quotas (the open ones when she ticked none) unless one is picked, or "all".
  const quota = f.lquota && meta.quotas.includes(f.lquota) ? f.lquota : undefined;
  const allQuotas = f.lquota === "all";
  const mineQ = profile ? profileQuotas(profile, exams[exam].quotas) : [];
  const quotas = quota ? [quota] : allQuotas || !mineQ.length ? undefined : mineQ;
  const [sortYear, sortRound] = f.sort?.split("-") ?? [];
  const sort = f.sort ? { year: Number(sortYear), round: sortRound as Round, dir: f.dir } : undefined;
  const filtered = anyTermFilter(tp.filters);
  // The closing-rank filter: a typed range, else her rank's preset (the profile's AIR). NEET SS: her rank compares only
  // with her question group's quotas, so with another group's (or every quota) there is no "would have got".
  const myRank = !perGroup(exam) || (quotas?.length && quotas.every((q) => mineQ.includes(q))) ? profile?.rank : undefined;
  // Typed ends read as people type them (40,000, 40k, 4.5L), swapped when reversed; what isn't a rank is said and ignored.
  const range = rankRange(f.rmin, f.rmax);
  const { min: rmin, max: rmax } = range;
  const closing = rmin || rmax ? { min: rmin, max: rmax } : myRank && f.rk === "reached" ? { min: myRank } : myRank && f.rk === "near" ? { min: Math.round(myRank * 0.9), max: Math.round(myRank * 1.1) } : undefined;
  const closingLabel = !closing ? null
    : rmin || rmax ? `Closing ${rmin && rmax ? `${formatRank(rmin)}–${formatRank(rmax)}` : rmin ? `${formatRank(rmin)} or later` : `up to ${formatRank(rmax!)}`}`
    : f.rk === "reached" ? `Would have got ${E.rankWord} ${formatRank(myRank!)}` : `Near ${E.rankWord} ${formatRank(myRank!)} (±10%)`;
  const base = { courses: courses.map((c) => ({ degree: c.degree, specialty: c.specialty })), ...(mineCats ? { categories: mineCats } : { category }), quotas, search: f.q, sort, closing: closing && { ...closing, since: f.since } };
  const [lr, all, inst, info, view] = await Promise.all([
    lastRanks({ ...base, terms: tp.filters }, undefined, exam),
    // A term filter set: every row as well, to count those left out only for a value not declared (as Rank scan), and
    // to tell an institute the filters hide from one with no closing.
    filtered ? lastRanks(base, undefined, exam) : null,
    f.inst ? getCollege(f.inst, exam) : null,
    hospitalInfo(exam),
    chosenView(params, VIEW),
  ]);

  // The service builds every row for the course anyway (one SQL read); only this page's rows are rendered. A link
  // from an institute (inst) opens the page that holds its row unless a page is asked for (so the Pager always sets one).
  const at = inst ? lr.rows.findIndex((r) => r.college.slug === inst.slug) : -1;
  const hidden = !!inst && at < 0 && !!all?.rows.some((r) => r.college.slug === inst.slug);
  const unknown = all ? splitByTerms(all.rows, tp.filters, (r) => r.fees, (r) => r.hospital?.type?.value).unknown.length : 0;
  // A college type picked: the rows it left out only because their type is not known.
  const typeless = untypedOnly(tp.filters);
  const untyped = all && typeless ? all.rows.filter((r) => termsPass(r.fees, r.hospital?.type?.value, typeless)).length : 0;
  const page = Math.min(Math.max(1, Math.ceil(lr.total / PAGE_SIZE)), f.page ?? (at >= 0 ? Math.floor(at / PAGE_SIZE) + 1 : 1));
  const rows = lr.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Newest year first; rounds R1 → special stray within a year (the service's order).
  const cols: Col[] = lr.columns.filter((c) => !f.since || c.year >= f.since).sort((a, b) => b.year - a.year);
  const years = cols.map((c) => c.year);
  const rds = rounds.filter((rd) => cols.some((c) => c.rounds.includes(rd)));
  // The card's big number: the sorted column (else each row's newest closing).
  const stat = sort && cols.some((c) => c.year === sort.year) ? { year: sort.year, round: sort.round } : null;
  const courseLabel = courses.length === 1 ? `${course.degree} ${course.name}` : courses.map((c) => `${c.degree} ${c.name}`).join(", ");
  const qn = (q: string) => quotaIn(E, q);
  const quotaLabel = quotas ? quotas.map(qn).join(", ") : "every quota";
  const caption = `Closing ranks for ${courseLabel}, ${category} seats, ${quotaLabel}`;
  const LR = "/decide/last-ranks";
  const sortHref = (key: string) => L.with("/decide/last-ranks", { sort: key, dir: f.sort === key && f.dir === "desc" ? "asc" : "desc", page: null });
  const pinned = at >= 0 ? lr.rows[at] : null;
  const mcc = (r: OptionRow) => info.get(r.college.key)?.mccProfileUrl;
  const chips = [
    ...(f.q ? [{ label: `Search: “${f.q}”`, param: "q", href: L.with(LR, { q: null, page: null }) }] : []),
    ...(closingLabel ? [{ label: closingLabel, param: "rk", href: L.with(LR, { rk: null, rmin: null, rmax: null, page: null }) }] : []),
    ...cf.chips((v) => L.with(LR, { course: v, page: null }), (s) => L.without(LR, "course", s)).filter((c) => c.label !== "All courses"),
    ...(quota ? [{ label: qn(quota), param: "lquota", href: L.with(LR, { lquota: null, page: null }) }] : allQuotas ? [{ label: "All quotas", param: "lquota", href: L.with(LR, { lquota: null, page: null }) }] : quotas ? [{ label: `Your quotas (${quotaLabel})`, param: "lquota", href: L.with(LR, { lquota: "all", page: null }) }] : []),
    // Her profile's caps apply here as on Options and Fees (an absent maxfee / bondyrs is hers); "any" lifts one.
    ...(profile?.maxFeeLakh != null && tp.params.maxfee == null ? [{ label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, param: "maxfee", href: L.with("/decide/last-ranks", { maxfee: "any", page: null }) }] : []),
    ...(profile?.maxBondYears != null && tp.params.bondyrs == null ? [{ label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, param: "bondyrs", href: L.with("/decide/last-ranks", { bondyrs: "any", page: null }) }] : []),
    ...termChips(tp.params).map((c) => ({ label: c.label, param: c.key, href: c.value ? L.without("/decide/last-ranks", c.key, c.value) : L.with("/decide/last-ranks", { [c.key]: null, page: null }) })),
  ];
  const clear = L.with("/decide/last-ranks", { q: null, rk: null, rmin: null, rmax: null, course: null, lquota: null, ctype: null, maxfee: null, minstip: null, bondyrs: null, maxbond: null, maxleave: null, nd: null, page: null });
  const about = (
    <>
      {`Closing = the highest ${E.rankName} allotted that round on a `}{category} seat. Brackets = allotments made that round
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
                    <Link href={sortHref(key)} aria-label={`${c.year} ${roundNameIn(exam, meta.sources, c.year, r)}, sort ${on && f.dir === "desc" ? "ascending" : "descending"}`} className="inline-flex min-h-11 items-center justify-end px-1 hover:text-foreground">
                      {roundNameIn(exam, meta.sources, c.year, r)}{on ? (f.dir === "asc" ? " ↑" : " ↓") : ""}
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
                <th scope="row" className={`sticky left-0 z-[1] max-w-64 min-w-[8.5rem] px-3 py-2 text-left font-normal md:min-w-60 ${here ? "bg-mist" : "bg-card"} ${tbl.pin}`}>
                  <Link href={L.institute(r.college.slug)} title={r.college.name} className="font-medium hover:text-sky hover:underline"><InstName name={r.college.name} state={r.college.state} /></Link>
                  <span className="block text-xs">{courseName(r)}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>{r.college.state ?? <Dash />}, <QuotaName quota={r.quota} /></span>
                    <TypeBadge type={r.hospital?.type} of={r.college.name} />
                  </span>
                  <Link href={L.allotments({ course: r.course.slug, inst: r.college.slug })} className={`${smallLink} text-xs text-sky`}>Allotments</Link>
                </th>
                {cols.flatMap((c) =>
                  c.rounds.map((round, i) => (
                    <td key={`${c.year}-${round}`} className={`numeric px-2 py-2 text-right ${i === 0 ? "border-l border-border" : ""}`}>
                      <Cell c={r.grid[c.year]?.[round]} rank={myRank} />
                    </td>
                  )),
                )}
                <TermStatCells t={r.fees} variant="compact" of={`${r.college.name}, ${courseName(r)}`} tdClassName="px-2 py-2" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollTable>
  );

  const content = (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead
        title="Last ranks"
        about={about}
        note={
          <>
            {`The last ${E.rankName} that got each seat on `}{category} seats, by year and round, newest first. (2) = seats given that round.
            {myRank != null && <> <span className={GOT}>Highlighted</span>: your {E.rankWord} <span className="numeric">{formatRank(myRank)}</span> would have got it.</>}
          </>
        }
      >
        {LATER_ROUNDS_NOTE}
      </PageHead>

      {/* Filters, the count and the results tools on one row (globals.css .filter-row); chips and notes under it. */}
      <div className="filter-row">
      <FilterBar
        action="/decide/last-ranks"
        params={params}
        active={chips.length}
        clear={clear}
        total={lr.total}
        noun="options"
        search={
          <label className="grid min-w-0 text-sm">
            <span className="sr-only">Institute or state</span>
            <input name="q" type="search" defaultValue={f.q ?? ""} maxLength={100} placeholder="Institute or state" className={control} />
          </label>
        }
      >
        {inst && <input type="hidden" name="inst" value={inst.slug} />}
        {/* Her courses by default (none ticked); the shared searchable chips, never a 100-item native list. */}
        <FilterDropdown label="Course" name="course" search options={cf.choices.filter((c) => c.value !== "all")} selected={cf.typed} none={cf.mine.length ? `Your courses (${cf.mine.length})` : `${course.degree} ${course.name}`} info={cf.mine.length ? "None ticked means your courses." : undefined} />
        {E.categories.length > 1 && <Field label="Seat category"><Select name="lcat" value={mineCats ? undefined : category} all={mineCats ? `Yours (${category})` : undefined} options={(E.pwd ? [...E.categories, ...E.categories.map((c) => `${c} PwD`)] : E.categories).map((c) => ({ value: c, label: c }))} /></Field>}
        <Field label="Quota"><Select name="lquota" value={f.lquota} all={mineQ.length ? `Your quotas (${mineQ.map(qn).join(", ")})` : "All quotas"} options={[...(mineQ.length ? [{ value: "all", label: "All quotas" }] : []), ...meta.quotas.map((q) => ({ value: q, label: qn(q) }))]} /></Field>
        {myRank != null && (
          <Field label="Your rank">
            <Select name="rk" value={f.rk} all="Any closing rank" options={[{ value: "reached", label: `Would have got ${E.rankWord} ${formatRank(myRank)}` }, { value: "near", label: `Near ${E.rankWord} ${formatRank(myRank)} (±10%)` }]} />
          </Field>
        )}
        <Field label="Closing rank from"><input name="rmin" defaultValue={f.rmin ?? ""} aria-invalid={range.bad.includes(f.rmin ?? "") || undefined} aria-describedby={range.bad.length ? "range-note" : undefined} placeholder={exam === DEFAULT_EXAM ? "e.g. 40,000 or 40k" : `e.g. ${E.exampleRank}`} className={`${control} numeric`} /></Field>
        <Field label="Closing rank to"><input name="rmax" defaultValue={f.rmax ?? ""} aria-invalid={range.bad.includes(f.rmax ?? "") || undefined} aria-describedby={range.bad.length ? "range-note" : undefined} placeholder={exam === DEFAULT_EXAM ? "e.g. 60,000 or 0.6L" : "e.g. 5k"} className={`${control} numeric`} /></Field>
        <Field label="From year"><Select name="since" value={f.since ? String(f.since) : undefined} all="All years" options={[...lr.columns].sort((a, b) => b.year - a.year).map((c) => ({ value: String(c.year), label: String(c.year) }))} /></Field>
        <TermFilterControls f={tp.params} caps={profile} fees={E.has.fees} />
      </FilterBar>
      <ActiveFilters items={chips} clear={clear} />
      <UntypedNote n={untyped} noun={untyped === 1 ? "option" : "options"} href={L.with("/decide/last-ranks", { ctype: null, page: null })} />
      {(range.swapped || range.bad.length > 0) && (
        <p id="range-note" role="status" className="text-sm text-sun">
          {range.bad.length > 0 && <>“{range.bad.join("”, “")}” isn&apos;t a rank (a whole number from 1, or 40k / 4.5L), so it was left out. </>}
          {range.swapped && "The closing-rank range was the wrong way round, so it reads from the lower to the higher."}
        </p>
      )}

      {inst && at < 0 && (
        <p className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          {hidden ? (
            <>
              {inst.name} doesn&apos;t match these filters.{" "}
              <Link href={L.with("/decide/last-ranks", { ctype: null, maxfee: "any", minstip: null, bondyrs: "any", maxbond: null, maxleave: null, nd: null, page: null })} className={`${smallLink} text-sky`}>Show it without them</Link>
            </>
          ) : (
            <>
              {inst.name}: no {category}-seat closing for {courseLabel}, {quotaLabel}.{" "}
              {category !== "Open" && <Link href={L.with("/decide/last-ranks", { lcat: "Open", page: null })} className={`${smallLink} text-sky`}>Show Open seats</Link>}{" "}
              <Link href={L.allotments({ course: course.slug, inst: inst.slug })} className={`${smallLink} text-sky`}>See its allotments</Link>
            </>
          )}
        </p>
      )}

      <div className={toolbarRow}>
        {/* The results' sources here, before the panes: MCC results are numbered first (the cards' term (i)s come after). */}
        <AboutData className="grid gap-0.5">
          <p id="results" tabIndex={-1} aria-live="polite" className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            <span><span className="numeric font-semibold text-foreground">{rangeLabel({ ...lr, rows, page, pageSize: PAGE_SIZE })}</span> options</span>
            <InfoTip label="these options">
              Each option is an institute, course and quota with a closing on {category} seats: {courseLabel}; {quotaLabel}
              {lr.empty > 0 && <>; <span className="numeric">{formatRank(lr.empty)}</span> more had no {category}-seat allotments for it</>}.
            </InfoTip>
            {unknown > 0 && (
              <Link href={L.with("/decide/last-ranks", { nd: "keep", page: null })} className={`${smallLink} text-sky`}>
                Include <span className="numeric mx-1">{formatRank(unknown)}</span> without a published figure
              </Link>
            )}
           <ColourLegend className="ml-1 align-middle" /></p>
          <DataSource used={years.map((year) => ({ year }))} />
        </AboutData>
        {lr.total > 0 && <ViewToggle page={VIEW} view={view} />}
      </div>
      </div>

      {/* Her institute (a link from it, #inst-…) in view in either view: its card above the list. */}
      {pinned && (
        <div id={`inst-${pinned.college.slug}`} tabIndex={-1} className="scroll-mt-24">
          <LastRankCard r={pinned} cols={cols} rds={rds} stat={stat} range={closing} mcc={mcc(pinned)} L={L} mine rank={myRank} E={EI} />
        </div>
      )}

      {lr.total === 0 ? (
        <EmptyState title={closing ? "No seats closed in this rank range" : filtered && all?.total ? "No options match these filters" : `No ${category}-seat closings for ${courseLabel}, ${quotaLabel}${f.q ? `, “${f.q}”` : ""}`} description="Try another seat category, quota, search or filter." href={L.to("/decide/last-ranks", { lquota: "all", maxfee: "any", bondyrs: "any" })} />
      ) : (
        <ViewPanes
          page={VIEW}
          view={view}
          cards={
            <ResultCards title={caption} hideTitle>
              {rows.map((r) => <LastRankCard key={r.id} r={r} cols={cols} rds={rds} stat={stat} range={closing} mcc={mcc(r)} L={L} mine={inst?.slug === r.college.slug} rank={myRank} E={EI} />)}
            </ResultCards>
          }
          table={table}
        />
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={lr.total} href={(n) => L.with("/decide/last-ranks", { page: n })} focusId="results" label="Last ranks" />

      <HistoryNote />
    </AppPage>
  );
  // No profile in the address: Open seats, unless a saved one is on its way (as Options' loading line).
  if (profile) return content;
  return <WaitForSaved wait={<AppPage><PageHead title="Last ranks" /><p role="status" className="mt-6 text-sm text-muted-foreground">Loading your saved rank and courses…</p></AppPage>}>{content}</WaitForSaved>;
}
