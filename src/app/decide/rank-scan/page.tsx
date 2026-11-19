import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { AboutData } from "@/features/decide/components/filter-form";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { seatCategories } from "@/features/decide/components/seats/find-seats";
import { courseFilter } from "@/features/decide/lib/course-filter";
import { eligibleCategories } from "@/features/decide/lib/reach";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { InstName, PageHead, Provisional } from "@/features/decide/components/bits";
import { InfoTip } from "@/features/decide/components/info-tip";
import { cardMeta, subLink, termCol, withRowInfo, youMarks } from "@/features/decide/components/ranks/rank-cards";
import { ResultCard } from "@/features/decide/components/result-card";
import { StatHead, TermStatCells } from "@/features/decide/components/stat-cells";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { ActiveFilters, control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView, pageSizeFor } from "@/features/decide/server/view";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams, rankShorthand } from "@/features/decide/lib/params";
import { readTermFilters, splitByTerms, termChips, termValueLabel } from "@/features/decide/lib/term-filters";
import { profileFromParams, profileHasCourse, profileQuotas, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, rankScan } from "@/features/decide/service";
import { statKeys } from "@/features/decide/lib/stat-format";
import { roundLabel, rounds } from "@/features/decide/types";
import { ScrollTable } from "@/features/decide/components/scroll-table";
import { examGate } from "@/features/exams/active";
import { activeExam, examInfo, RankListNote } from "@/features/exams/active";
import { authorityOf, groupsOf, perGroup, rankListIn, rankListOf, roundNameIn, yearName } from "@/features/exams/registry";
import { QuotaName } from "@/features/decide/components/round-name";
import { quotaIn } from "@/features/exams/exam";

export const metadata: Metadata = { title: "Rank scan" };
const VIEW = "rank-scan";
// ponytail: 50 a page (rounds in order, ranks within a round): each card carries its five term cells and their (i)s,
// and both views are in the page. ±500 is about 550 rows in a busy year; ±5,000 about ten times that, read and
// filtered (course, degree, seat category) before the terms are attached.
const PAGE_SIZE = 50; // a phone: 25 (pageSizeFor)
/** ± ranks, or ± a percentage of her rank; either way at most ±5,000 (MAX_WINDOW). */
const windows = ["100", "250", "500", "1000", "2500", "5000", "1%", "2%", "5%", "10%"] as const;
const MAX_WINDOW = 5000;
const halfWindow = (w: (typeof windows)[number], rank: number) => Math.min(MAX_WINDOW, w.endsWith("%") ? Math.max(1, Math.round((rank * parseFloat(w)) / 100)) : Number(w));
const schema = z.object({
  scan: rankShorthand.optional(), // "25k", "2.5 lakh" as on Last ranks
  year: z.coerce.number().int().optional(),
  w: z.enum(windows).default("500"),
  round: z.enum(rounds).optional(),
  page: pageValue.optional(),
});
const multi = (params: URLSearchParams, k: string) => params.getAll(k).flatMap((v) => v.split(",")).filter(Boolean);

export default async function RankScanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gated = await examGate("/decide/rank-scan");
  if (gated) return gated;
  const params = toURLSearchParams(await searchParams);
  const [view, pageSize] = await Promise.all([chosenView(params, VIEW), pageSizeFor(PAGE_SIZE)]);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const tp = readTermFilters(params, profile);
  const exam = await activeExam();
  const E = await examInfo(exam); // its data: fees once its import has them
  const meta = await getMeta(exam);
  const typed = params.get("scan")?.trim() || null;
  // NEET SS: a rank is within one question group: her group's allotments only, unless she lifts it (grp=all).
  const group = perGroup(exam) && profile?.quotas.length && params.get("grp") !== "all" ? profile.quotas : undefined;
  // INI-CET: her quotas (the open ones when she ticked none, as Options), unless she lifts it (rq=all).
  const mineQ = E.quotaScoped && profile && params.get("rq") !== "all" ? profileQuotas(profile, E.quotas) : undefined;
  const invalid = typed != null && f.scan == null;
  const rank = invalid ? null : (f.scan ?? profile?.rank ?? null);
  // Default: the newest year whose results are final.
  const year = meta.years.find((y) => y.year === f.year) ?? meta.years.find((y) => !y.provisional) ?? meta.years[0];
  const window = halfWindow(f.w, rank ?? 0);
  const round = f.round && year?.rounds.includes(f.round) ? f.round : undefined;
  // Her courses, and the seat categories she can take, unless she picks others ("all" lifts one): what is near her rank for her.
  const cf = courseFilter(params, profile, meta.courses);
  const degrees = multi(params, "degree").filter((d) => meta.degrees.includes(d));
  const scatPicked = multi(params, "scat");
  const mineCats = profile ? eligibleCategories(profile.category, profile.pwd) : [];
  const allCats = scatPicked.includes("all");
  const cats = allCats ? null : scatPicked.length ? scatPicked : mineCats.length ? mineCats : null;
  const courseSlug = new Map(meta.courses.map((c) => [`${c.degree}|${c.specialty}`, c.slug]));
  // INI-CET ranks MDS on a list of its own: ranks near hers on her list only (registry rankListIn; null: one list).
  const list = rankListIn(exam, params.get("list"), profile ? meta.courses.filter((c) => profileHasCourse(profile, c)).map((c) => c.degree) : []);
  const wanted = (a: { degree: string; specialty: string; category: string; round: string }) =>
    (list == null || rankListOf(exam, a.degree) === list) &&
    (!round || a.round === round) &&
    (!cf.slugs || cf.slugs.has(courseSlug.get(`${a.degree}|${a.specialty}`) ?? "")) &&
    (!degrees.length || degrees.includes(a.degree)) &&
    (!cats || cats.includes(a.category));
  const scanned = rank && year ? await withRowInfo((await rankScan(rank, year.year, window, exam, group ?? mineQ)).flatMap((g) => g.rows).filter(wanted), exam) : [];
  // Fee, stipend, bond, leaving and type filters on each allotment's course and quota (lib/term-filters.ts).
  const { kept, unknown } = splitByTerms(scanned, tp.filters, (a) => a.fees, (a) => a.hospital?.type?.value);
  type Row = (typeof kept)[number];
  const you = rank ? youMarks(kept, rank) : new Set<Row>();
  const page = Math.min(Math.max(1, Math.ceil(kept.length / pageSize)), f.page ?? 1);
  const rows = kept.slice((page - 1) * pageSize, page * pageSize);
  const groups = rounds.map((rd) => ({ round: rd, rows: rows.filter((a) => a.round === rd) })).filter((g) => g.rows.length);
  const courseOf = new Map(meta.courses.map((c) => [`${c.degree}|${c.specialty}`, c]));
  const provisional = (rd: string) => meta.sources.some((s) => s.year === year?.year && s.round === rd && s.provisional);
  const R = "/decide/rank-scan";
  const roundOf = (rd: (typeof rounds)[number]) => (year ? roundNameIn(exam, meta.sources, year.year, rd) : roundLabel[rd]);
  const yearWords = year && yearName(exam, year.year); // INI-CET: "Jan 2026"
  const chips = [
    ...(group ? [{ label: `Your question group (${groupsOf(exam, group).join(", ")})`, param: "grp", href: L.with(R, { grp: "all", page: null }) }] : []),
    ...(mineQ ? [{ label: `Your quotas (${mineQ.map((q) => quotaIn(E, q)).join(", ")})`, param: "rq", href: L.with(R, { rq: "all", page: null }) }] : []),
    ...cf.chips((v) => L.with(R, { course: v, page: null }), (s) => L.without(R, "course", s)),
    ...degrees.map((d) => ({ label: d, param: "degree", href: L.without(R, "degree", d) })),
    ...(allCats ? [{ label: "All seat categories", param: "scat", href: L.with(R, { scat: null, page: null }) }] : scatPicked.length ? scatPicked.map((c) => ({ label: `${c} seats`, param: "scat", href: L.without(R, "scat", c) })) : mineCats.length ? [{ label: `Your seat categories (${mineCats.join(", ")})`, param: "scat", href: L.with(R, { scat: "all", page: null }) }] : []),
    // Her profile's caps apply here as on Options and Fees (an absent maxfee / bondyrs is hers); "any" lifts one.
    ...(profile?.maxFeeLakh != null && tp.params.maxfee == null ? [{ label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, param: "maxfee", href: L.with("/decide/rank-scan", { maxfee: "any", page: null }) }] : []),
    ...(profile?.maxBondYears != null && tp.params.bondyrs == null ? [{ label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, param: "bondyrs", href: L.with("/decide/rank-scan", { bondyrs: "any", page: null }) }] : []),
    ...termChips(tp.params).map((c) => ({ label: c.label, param: c.key, href: c.value ? L.without("/decide/rank-scan", c.key, c.value) : L.with("/decide/rank-scan", { [c.key]: null, page: null }) })),
  ];
  const clear = L.with("/decide/rank-scan", { course: "all", degree: null, scat: "all", ctype: null, maxfee: null, minstip: null, bondyrs: null, maxbond: null, maxleave: null, nd: null, page: null });
  const course = (a: Row) => courseOf.get(`${a.degree}|${a.specialty}`);
  const courseName = (a: Row) => `${a.degree} ${course(a)?.name ?? a.specialty}`;
  const youText = rank ? `Your rank, ${formatRank(rank)}, falls here` : "";

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead
        title="Rank scan"
        about={`Allotments to ranks near yours, round by round, in one year's ${authorityOf(exam)} results: every course and seat category. In R2 and later only new or upgraded allotments are listed.`}
      />

      <FilterBar
        action="/decide/rank-scan"
        params={params}
        active={chips.length}
        clear={clear}
        total={rank && year && !invalid ? kept.length : undefined}
        noun="allotments"
        search={
          <label className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">Rank</span>
            <input name="scan" enterKeyHint="search" defaultValue={typed ?? rank ?? ""} placeholder={`e.g. ${E.exampleRank}`} aria-invalid={invalid || undefined} aria-describedby={invalid ? "scan-error" : undefined} className={`${control} numeric min-w-0`} />
          </label>
        }
      >
        <Field label="Year"><Select name="year" value={year ? String(year.year) : undefined} options={meta.years.map((y) => ({ value: String(y.year), label: y.label }))} /></Field>
        <Field label="Range"><Select name="w" value={f.w} options={windows.map((w) => ({ value: w, label: w.endsWith("%") ? `± ${w} of your rank${rank ? ` (± ${formatRank(halfWindow(w, rank))})` : ""}` : `± ${formatRank(Number(w))}` }))} /></Field>
        <Field label="Round"><Select name="round" value={round} all="All rounds" options={(year?.rounds ?? []).map((r) => ({ value: r, label: roundOf(r) }))} /></Field>
        {/* Her courses and seat categories by default (none ticked), as Residents; the shared searchable chips. */}
        <FilterDropdown label="Course" name="course" search options={cf.choices} selected={cf.selected} none={cf.none} info={cf.mine.length ? "None ticked means your courses. Tick All courses for every one." : undefined} />
        <FilterDropdown label="Degree" name="degree" options={meta.degrees.map((d) => ({ value: d, label: d }))} selected={degrees} none="Any degree" />
        {params.get("grp") === "all" && <input type="hidden" name="grp" value="all" />}
        {params.get("rq") === "all" && <input type="hidden" name="rq" value="all" />}
        {list != null && params.get("list") && <input type="hidden" name="list" value={params.get("list")!} />}
        {E.categories.length > 1 && <FilterDropdown
          label="Seat category"
          name="scat"
          options={[...(mineCats.length ? [{ value: "all", label: "All seat categories" }] : []), ...seatCategories.map((c) => ({ value: c, label: c }))]}
          selected={allCats ? ["all"] : scatPicked}
          none={mineCats.length ? `Yours (${mineCats.join(", ")})` : "All seat categories"}
          info={mineCats.length ? "None ticked means the seat categories you can take. Tick All seat categories for every one." : undefined}
        />}
        <TermFilterControls f={tp.params} caps={profile} fees={E.has.fees} />
      </FilterBar>
      <ActiveFilters items={chips} clear={clear} />
      {list != null && <RankListNote exam={exam} list={list} href={(l) => L.with(R, { list: l, page: null })} />}

      {invalid ? (
        <p id="scan-error" role="alert" className="text-sm text-ember">“{typed}” isn&apos;t a rank. Enter a rank between 1 and 3,00,000, for example {E.exampleRank} (25k or 2.5 lakh work too).</p>
      ) : !rank || !year ? (
        <EmptyState title="Enter a rank to scan" description={`Type ${E.rankName === "All India Rank" ? "an" : "a"} ${E.rankName} above, or set your rank, to see the allotments made to ranks around it.`} />
      ) : (
        <>
          <div className={toolbarRow}>
            {/* The results' sources here, before the panes: the MCC result is numbered first (the term (i)s come after). */}
            <AboutData className="flex flex-wrap items-center gap-x-2">
              <p id="results" tabIndex={-1} aria-live="polite" className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
                <span><span className="numeric font-semibold text-foreground">{rangeLabel({ rows, page, pageSize, total: kept.length })}</span> allotments: history, not a prediction</span>
                <InfoTip label="these allotments">
                  Ranks <span className="numeric">{formatRank(Math.max(1, rank - window))}–{formatRank(rank + window)}</span> in {year.label},{" "}
                  {cf.slugs ? (cf.typed.length ? "the courses picked" : "your courses") : "every course"}{degrees.length ? ` (${degrees.join(", ")})` : ""},{" "}
                  {cats ? `${cats.join(", ")} seats` : "every seat category"}{round ? `, ${roundOf(round)} only` : ""}. A “Your rank falls here” line marks where ranks pass yours. What happened then, not what will happen now.
                </InfoTip>
                {unknown.length > 0 && (
                  <Link href={L.with("/decide/rank-scan", { nd: "keep", page: null })} className={`${smallLink} text-sky`}>
                    Include <span className="numeric mx-1">{formatRank(unknown.length)}</span> without a published figure
                  </Link>
                )}
               <ColourLegend className="ml-1 align-middle" /></p>
              <DataSource used={[{ year: year.year }]} />
            </AboutData>
            {groups.length > 0 && <ViewToggle page={VIEW} view={view} />}
          </div>
          {groups.length === 0 && (
            // The real controls: a wider range, every course, every seat category (her profile's are the default).
            <EmptyState title="No allotments in this range" description={`No seat ${cf.slugs ? "in your courses " : ""}was allotted to ranks ${formatRank(Math.max(1, rank - window))}–${formatRank(rank + window)} in ${yearWords}, or none passed the filters.`}>
              <span className="flex flex-wrap justify-center gap-x-6">
                {window < MAX_WINDOW && <Link href={L.with(R, { w: String(MAX_WINDOW), page: null })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Widen to ± {formatRank(MAX_WINDOW)}</Link>}
                {cf.slugs && <Link href={L.with(R, { course: "all", page: null })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Every course</Link>}
                {cats && <Link href={L.with(R, { scat: "all", page: null })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Every seat category</Link>}
              </span>
            </EmptyState>
          )}
          {groups.map((g) => {
            const label = `${yearWords} ${roundOf(g.round)} allotments`;
            const courseLink = (a: Row) => L.allotments({ course: course(a)?.slug, inst: a.collegeSlug, year: year.year, round: g.round });
            const of = (a: Row) => `${a.collegeName}, ${courseName(a)}, rank ${formatRank(a.rank)}`;
            return (
              <section key={g.round} aria-labelledby={`r-${g.round}`} className="grid grid-cols-1 gap-3">
                <h2 id={`r-${g.round}`} className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  <span><span className="numeric">{yearWords}</span> {roundOf(g.round)}</span> <Provisional when={provisional(g.round)} />
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
                              chips={[<QuotaName key="q" quota={a.quota} />, `${a.category} seat`, a.remark]}
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
                    // Wide: the page scrolls, the header row stays pinned under the top bar and the Rank column in view (ScrollTable).
                    // Phones: the seat category and a short institute name ride in the pinned Rank cell.
                    <ScrollTable label={label} scrollClassName="max-md:scroll-pl-[8.5rem]">
                      <table className={tbl.table}>
                        <caption className="sr-only">{yearWords} {roundOf(g.round)}: allotments to ranks near {formatRank(rank)}</caption>
                        <thead className={tbl.head}>
                          <tr className={tbl.headRow}>
                            <th scope="col" className={`${tbl.th} sticky left-0 z-[3] bg-card text-right max-md:text-left ${tbl.pin}`}>Rank<span className="md:hidden">, seat, institute</span></th>
                            <th scope="col" className={`${tbl.th} max-md:hidden`}>Seat category</th>
                            <th scope="col" className={tbl.th}>Institute and course</th>
                            {statKeys.map((k) => <th key={k} scope="col" className={`${termCol.th(k)} whitespace-nowrap`}><StatHead k={k} /></th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.flatMap((a, i) => [
                            ...(you.has(a) ? [<tr key="you" className="bg-sky/10"><td colSpan={3 + statKeys.length} className="px-4 py-1.5 text-xs font-semibold text-sky">{youText}</td></tr>] : []),
                            <tr key={i} className={tbl.row}>
                              <td className={`${tbl.num} sticky left-0 z-[1] bg-card max-md:text-left ${tbl.pin}`}>
                                {formatRank(a.rank)}
                                <span className="block text-xs font-normal md:hidden">{a.category} seat</span>
                                <span title={a.collegeName} className="block text-xs font-normal text-muted-foreground md:hidden"><InstName name={a.collegeName} state={a.state} /></span>
                              </td>
                              <td className={`${tbl.td} max-md:hidden`}>{a.category}</td>
                              <td className={`${tbl.td} min-w-52`}>
                                <Link href={L.institute(a.collegeSlug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline max-md:hidden">{a.collegeName}</Link>
                                <span className="block"><Link href={courseLink(a)} className={subLink}>{courseName(a)}</Link></span>
                                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                                  <TypeBadge type={a.hospital?.type} of={a.collegeName} />
                                  <span><QuotaName quota={a.quota} />{a.remark && ` · ${a.remark}`}</span>
                                </span>
                              </td>
                              <TermStatCells t={a.fees} variant="compact" of={of(a)} tdClassName={termCol.td} />
                            </tr>,
                          ])}
                        </tbody>
                      </table>
                    </ScrollTable>
                  }
                />
              </section>
            );
          })}
          <Pager page={page} pageSize={pageSize} total={kept.length} href={(n) => L.with("/decide/rank-scan", { page: n })} focusId="results" label="Rank scan" />
        </>
      )}
    </AppPage>
  );
}
