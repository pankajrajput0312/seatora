import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Globe } from "lucide-react";
import { notFound, permanentRedirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { AppPage } from "@/features/decide/components/app-page";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { DataSource, ListsHistory, SeatSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Closing, Dash, HistoryNote, PageHead, Provisional, ReachBadge } from "@/features/decide/components/bits";
import { FeesSection, programmeTitle, termDocs } from "@/features/decide/components/fees";
import { InfoTip } from "@/features/decide/components/info-tip";
import { ChoiceStar, CompareToggle } from "@/features/decide/components/option-actions";
import { HideableRow } from "@/features/decide/components/residents/hideable-row";
import { flagShort, reportedCount, SELF_REPORTED, ValueSource } from "@/features/decide/components/institute/hospital-bits";
import { allotmentMixAt, clinicalAt, headerLists, hospitalInfo, optionSeats, roundSeatsAt, roundSeatTotals, websiteUrl } from "@/features/decide/components/institute/institute-data";
import { AllotmentMixTable, CategoryToggle, CollegeSeatTable, HospitalFacts } from "@/features/decide/components/institute/institute-parts";
import { courseName, RoundGrid, SeatsBelowNote, seatKindShort, toChoiceItem } from "@/features/decide/components/options-view";
import { ResultCard } from "@/features/decide/components/result-card";
import { kindNote, listSeats, listTitle, UnlistedSeats } from "@/features/decide/components/seats/seat-lists";
import { TermStatCells } from "@/features/decide/components/stat-cells";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { FilterForm, FiltersPanel } from "@/features/decide/components/filter-form";
import { EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, StatStrip, tbl, toolbar } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { SortMenu } from "@/features/decide/components/view-menu";
import { byNumber, byText, chain, type Cmp } from "@/features/decide/lib/sorts";
import { feeValue } from "@/features/decide/lib/term-filters";
import { chosenView, pageSizeFor } from "@/features/decide/server/view";
import { fmtDay } from "@/features/decide/lib/format";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { eligibleCategories, latestText, reachOrder } from "@/features/decide/lib/reach";
import { MISSING_WORDS, statKeys, statLabel } from "@/features/decide/lib/stat-format";
import { profileFromParams, profileHasCourse, toURLSearchParams } from "@/features/decide/profile";
import { getCollege, getInstitute, getMeta, listAllotments, optionsView, renamedCollege } from "@/features/decide/service";
import { feesFor } from "@/features/decide/server/facts";
import { programmeOfDegree, programmes } from "@/features/decide/server/terms";
import { canSeeResidents, groupResidents, listResidents, residentsDenied } from "@/features/decide/server/residents";
import { residentYears } from "@/features/decide/server/residents-all";
import { deviceAid } from "@/features/funnel/service";
import { Paywall } from "@/features/plans/components/paywall";
import { checkAndCount, currentPlan } from "@/features/plans/usage";
import { kindName, type SeatList } from "@/features/decide/types";
import { hideResidentAction } from "./actions";
import { ScrollTable } from "@/features/decide/components/scroll-table";
import { authorityOf, DEFAULT_EXAM, headYearIn, inExamWords, latestOf, rankListParam, yearName } from "@/features/exams/registry";
import { activeExam, examInfo } from "@/features/exams/active";
import { quotaIn, roundIn, type Exam } from "@/features/exams/exam";
import { QuotaName } from "@/features/decide/components/round-name";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const tabs = [
  { key: "overview", label: "Overview" },
  { key: "residents", label: "Residents", accent: true }, // the main feature: second, in its own colour
  { key: "courses", label: "Courses" },
  { key: "seats", label: "Seats" },
  { key: "fees", label: "Fees & bond" },
  { key: "clinical", label: "Hospital facts" },
  { key: "allotments", label: "Allotments" },
] as const;
const PAGE_SIZE = 50; // a phone: 25 (pageSizeFor)
const schema = z.object({
  tab: z.enum(["overview", "courses", "seats", "allotments", "fees", "clinical", "residents"]).default("overview"),
  /** Courses tab seat columns: every seat category instead of hers (as Seats' `scat=all`). */
  scat: z.literal("all").optional(),
  year: z.coerce.number().int().optional(),
  course: z.string().max(100).optional(),
  /** Courses tab: courseSorts; Allotments tab: service.ts allotmentSorts (rank, course). Absent: the tab's own order. */
  sort: z.string().max(20).optional(),
  page: pageValue.default(1),
});
/** The Courses tab's Sort (`short`: a phone's); "": as listed (degree, then course, then quota). */
const courseSorts = ["", "reach", "name", "deep", "tight", "fee"] as const;

/** The tabs the exam has (its data: features/exams/active.tsx examInfo): residents and hospital facts are NEET PG's. */
const tabsFor = ({ has }: Exam) => {
  return tabs.filter((t) => (t.key !== "residents" || has.residents) && (t.key !== "fees" || has.fees) && (t.key !== "clinical" || has.clinical));
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const exam = await activeExam();
  const college = await getCollege((await params).slug, exam).catch((e) => {
    unstable_rethrow(e);
    return null;
  });
  const { tab } = parseSearchParams(schema, toURLSearchParams(await searchParams));
  // People's names: never indexed.
  const robots = tab === "residents" ? { index: false, follow: false } : undefined;
  // The tab is in the title, so switching tabs is announced (Next's route announcer reads the title).
  return { title: `${(tabsFor(await examInfo(exam)).find((t) => t.key === tab) ?? tabs[0]).label} · ${college?.name ?? "Institute"}`, robots };
}

export default async function InstitutePage({ params, searchParams }: Props) {
  const sp = toURLSearchParams(await searchParams);
  const profile = profileFromParams(sp);
  const L = decideLinks(sp);
  const slug = (await params).slug;
  const f = parseSearchParams(schema, sp);
  const exam = await activeExam();
  const [inst, meta] = await Promise.all([getInstitute(slug, profile, exam), getMeta(exam)]);
  if (!inst) {
    // A slug of a college key an MCC import retired (merged, or a neutral name): 308 to the college it became.
    const to = await renamedCollege(slug, exam);
    if (to) permanentRedirect(`/decide/institutes/${to.slug}${sp.size ? `?${sp}` : ""}`);
    notFound();
  }
  const { college, options, yours, allotmentsByYear, fees, unlistedBy } = inst;
  // The plan's distinct institutes a day (features/plans): opening one again today, or any tab of it, is free.
  const me = await currentPlan();
  const view = me && (await checkAndCount(me.user.id, "institutes", college.key, { account: me.user, aid: await deviceAid() }));
  if (me && view && !view.allowed) {
    return (
      <AppPage className="grid grid-cols-1 gap-3">
        <PageHead title={college.name} />
        <Paywall feature="institutes" eff={me.eff} used={view.used} device={view.device} />
      </AppPage>
    );
  }
  // Residents, fees and hospital facts are NEET PG's: no tab for an exam without them (fees: once its data has them).
  const E = await examInfo(exam);
  const { latestYear: LATEST_YEAR, pastYears: PAST_YEARS } = E;
  const shownTabs = tabsFor(E);
  const tab = shownTabs.some((t) => t.key === f.tab) ? f.tab : "overview";
  const yearInfo = (y: number) => meta.years.find((x) => x.year === y);
  const latest = latestOf(meta.sources, exam);
  const maxN = Math.max(1, ...allotmentsByYear.map((a) => a.n ?? 0));
  const courses = [...new Map(options.map((o) => [o.course.slug, o.course])).values()];
  // Another exam: the courses here for the Fees tab, hers marked (none without a course in her profile), so it shows
  // each course's own fee where the college lists one per course (NEET PG: its year table as before).
  const hasCourses = !!profile && !!(profile.specialties.length || profile.pairs?.length);
  const feeCourses = exam === DEFAULT_EXAM ? [] : courses.map((c) => ({ degree: c.degree, specialty: c.specialty, name: `${c.degree} ${c.name}`, mine: hasCourses && profileHasCourse(profile!, c) }));
  // The Overview's counts are of past allotments, as the Institutes list's: courses and quotas only in the round's seat lists ("new") aside.
  const past = options.filter((o) => o.reach !== "new");
  const pastCourses = new Set(past.map((o) => o.course.slug)).size;
  const newNote = (n: number, what: string) => (n ? ` ${n} more ${n === 1 ? what : `${what}s`} only in this round's seat lists (new) are on the Courses tab.` : "");
  const listed = profile ? yours : options;
  const allotYear = yearInfo(f.year ?? 0)?.year;
  const allotCourse = courses.find((c) => c.slug === f.course)?.slug;

  // Headlines: the latest complete year (NEET PG: its later past year, as before); the fourth cell the latest year, or
  // (that one is complete: another exam) the year before it.
  const HEAD = headYearIn(exam, meta.sources);
  const yn = (y: number) => yearName(exam, y); // as the exam names it (INI-CET: "Jan 2026")
  const by = authorityOf(exam); // MCC; INI-CET: AIIMS
  const pinNote = E.pinNotes?.[college.key]; // INI-CET: "Part A printed 801505" where the institute's own PIN replaced the brochure's
  const onePosition = kindName("clear", exam) === "Seat position"; // INI-CET: one seat list a session
  const w = (s: string) => inExamWords(exam, s); // a sentence in the exam's words (NEET PG, SS, MDS: as written)
  const head = yn(HEAD);
  // The Courses tab's order (lib/sorts.ts: none last; ties keep the listed order).
  const courseSort = (courseSorts as readonly string[]).includes(f.sort ?? "") && tab === "courses" ? (f.sort as (typeof courseSorts)[number]) : "";
  type CourseRow = (typeof options)[number];
  const deepOf = (r: CourseRow) => r.byYear[HEAD]?.closing;
  const courseCmp: Cmp<CourseRow> | null = {
    "": null,
    reach: chain(byNumber((r: CourseRow) => reachOrder.indexOf(r.reach)), byNumber(deepOf, "desc")),
    name: chain(byText((r: CourseRow) => r.course.name), byText((r) => r.course.degree)),
    deep: byNumber(deepOf, "desc"),
    tight: byNumber(deepOf),
    fee: byNumber((r: CourseRow) => feeValue.yearly(r.fees)),
  }[courseSort];
  const courseSortWords: Record<(typeof courseSorts)[number], { label: string; short: string }> = {
    "": { label: "Degree, then course", short: "Degree" },
    reach: { label: "Reach (reached first)", short: "Reach" },
    name: { label: "Course A–Z", short: "Course" },
    deep: { label: `${head} closing: deepest first`, short: "Deepest" },
    tight: { label: `${head} closing: tightest first`, short: "Tightest" },
    fee: { label: "Fee a year: lowest first", short: "Fee" },
  };
  const courseRows = courseCmp ? [...options].sort(courseCmp) : options;
  const n2025 = allotmentsByYear.find((a) => a.year === HEAD)?.n ?? null;
  const LATER = HEAD === LATEST_YEAR ? PAST_YEARS[1] : LATEST_YEAR;
  const nLatest = allotmentsByYear.find((a) => a.year === LATER)?.n ?? null;

  // Allotments tab: one page from SQL; a page past the end shows the last page.
  // The Allotments tab's Sort: rank (newest round first) or course first (one institute: no institute sort).
  const allotSort = f.sort === "course" ? "course" : undefined;
  const allot = tab === "allotments" ? await listAllotments({ year: allotYear, course: allotCourse, sort: allotSort }, { page: f.page, pageSize: await pageSizeFor(PAGE_SIZE) }, college.key, exam) : null;
  // ponytail: every row on one page (largest institute ~930 rows, ~1.6 MB HTML); add a course filter if that grows.
  const residentsAccess = tab !== "residents" ? null : !(await canSeeResidents()) ? "locked" : ((await residentsDenied("read")) ?? "ok");
  const residents = residentsAccess === "ok" ? await listResidents(college.key) : null;
  // Few batches here: say why before she wonders ("only 5 residents?"): from the years MCC's admitted lists cover and the
  // years with names here. "First allotted" only when this page's allotment counts show zero in an earlier year (a year
  // outside the allotment data is unknown, not zero).
  const residentsNote = residents && residents.total > 0 ? await (async () => {
    const listYears = await residentYears();
    const have = [...new Set(residents.rows.map((r) => r.year))].sort((a, b) => a - b);
    const missing = listYears.filter((y) => !have.includes(y)).sort((a, b) => a - b);
    if (!missing.length) return null;
    const first = have[0];
    const pending = listYears.includes(LATEST_YEAR) ? "" : ` The ${LATEST_YEAR} batch shows once MCC publishes this year's admitted lists.`;
    if (missing.every((y) => y < first)) {
      const firstAllot = allotmentsByYear.filter((a) => (a.n ?? 0) > 0).map((a) => a.year).sort((a, b) => a - b)[0];
      const started = firstAllot === first && allotmentsByYear.some((a) => a.year < first && a.n === 0) ? ` (MCC first allotted seats here in ${first})` : "";
      return `Names here start in ${first}${started}: ${have.length === 1 ? "one batch" : `${have.length} batches`} on MCC's admitted lists so far.${pending}`;
    }
    return `No names here on MCC's admitted lists for ${missing.join(", ")}.${pending}`;
  })() : null;
  // The tab's own filters: course and year, one or more of each (rcourse / ryear), over this college's residents.
  const rCourses = sp.getAll("rcourse");
  const rYears = sp.getAll("ryear").map(Number).filter(Number.isFinite);
  const residentRows = residents ? residents.rows.filter((r) => (!rCourses.length || rCourses.includes(r.course.slug)) && (!rYears.length || rYears.includes(r.year))) : [];
  const residentGroups = residents ? groupResidents(residentRows, profile) : [];
  // The sheet's count as she ticks: every row is here, so by course and year (no second read of the names).
  const tallied = new Map<string, { values: { rcourse: string; ryear: string }; n: number }>();
  for (const r of residents?.rows ?? []) {
    const k = `${r.course.slug}|${r.year}`;
    const t = tallied.get(k) ?? tallied.set(k, { values: { rcourse: r.course.slug, ryear: String(r.year) }, n: 0 }).get(k)!;
    t.n++;
  }
  const residentTally = [...tallied.values()];
  const residentCourseOptions = residents ? [...new Map(residents.rows.map((r) => [r.course.slug, `${r.course.degree} ${r.course.name}`])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)) : [];
  const residentYearOptions = residents ? [...new Set(residents.rows.map((r) => r.year))].sort((a, b) => b - a).map((y) => ({ value: String(y), label: String(y) })) : [];
  // Seats here with no past allotments: not in the lists below; Seats shows them, and while Options opens in the round
  // view, Options lists those in her profile as new options (search: this institute's name, within its 100 characters).
  const newOnOptions = profile && optionsView(undefined, inst.seatList ? [inst.seatList] : [], meta.sources) === "round" ? L.options({ reach: "new", q: college.name.slice(0, 100) }) : undefined;
  // One note per list of the round with such seats (clear, virtual, newly added: they overlap, so never added).
  const unlisted = unlistedBy.filter((u) => u.seats > 0);
  // One line per list; the why behind each one's (i).
  const unlistedNote = unlisted.length > 0 && (
    <div className="grid">
      {unlisted.map((u) => <UnlistedSeats key={u.list.key} u={u} exam={exam} profile={!!profile} here href={L.to("/decide/seats", { view: "list", list: u.list.key, inst: slug, nohist: "1" })} options={newOnOptions} />)}
    </div>
  );
  // The newest round's seat lists here (Courses columns, Seats tab), each separate; the header's totals from them there,
  // else from one grouped sum; allotments by quota and seat category (Overview).
  // Fees tab: the fee table by seat-type group per programme (none for MCh, MPH); Hospital facts tab: clinical facts.
  const listsTab = tab === "courses" || tab === "seats";
  const [round, totals, mix, info, feeGroups, clinical] = await Promise.all([
    listsTab ? roundSeatsAt(college.key, exam) : [],
    listsTab ? null : roundSeatTotals(college.key, exam),
    tab === "overview" ? allotmentMixAt(college.key, exam) : null,
    hospitalInfo(exam).then((m) => m.get(college.key) ?? null),
    tab === "fees" ? Promise.all(fees.map((p) => feesFor(college.key, p.programme, exam))) : [],
    tab === "clinical" ? clinicalAt(college.key, profile, exam) : null,
  ]);
  const website = websiteUrl(info?.website ?? null);
  const roundLists = round.map((x) => x.list);
  const stick = "sticky left-0 z-[1] border-r border-border bg-card";
  // The Courses table's own columns, a little tighter than tbl's (px-3): with the five term cells it fits 1366px.
  const thTight = "px-3 py-3 text-xs font-semibold text-muted-foreground";
  const numTight = "px-3 py-3 text-right align-top text-[15px] font-semibold tabular-nums";
  const roundName = round[0] && `${yn(round[0].list.year)} ${roundIn(E, round[0].list.year, round[0].list.round)}`;
  const mine = profile ? eligibleCategories(profile.category, profile.pwd) : null;
  const seatCats = mine && f.scat !== "all" ? mine : undefined;
  const beds = info?.beds ? { ...reportedCount(info.beds), period: info.beds.meta?.period } : null;
  // The flags in view, short (rounded is the "+"); their full words are in the (i).
  const bedsFlags = beds?.flags.flatMap((x) => flagShort[x] ?? []) ?? [];
  // One option's seats in each list of the round, as links to them on Seats ("4 R2 clear"; the PDF's date where the round
  // has two lists of that kind): the cards' meta line and the table's course cell (seat columns would push the fee and
  // bond cells off a laptop screen). A span holds each link: a flex item would grow with the link's 44px hit padding.
  const seatLinks = (r: (typeof options)[number]) =>
    round.flatMap(({ list, rows }) => {
      const n = optionSeats(rows, { ...r.course, quota: r.quota }, seatCats);
      const twin = roundLists.some((l) => l.key !== list.key && l.kind === list.kind);
      return n == null ? [] : [
        <span key={list.key}>
          <Link href={L.to("/decide/seats", { view: "list", list: list.key, inst: slug, course: r.course.slug, squota: r.quota, scat: mine && !seatCats ? "all" : undefined })} className="py-3 text-sky underline hover:text-foreground">
            <span className="numeric font-semibold">{formatRank(n)}</span>&nbsp;{roundIn(E, list.year, list.round)} {seatKindShort(list.kind, exam)}{twin && ` (${list.publishedAt ? fmtDay(list.publishedAt) : list.name})`}
            <span className="sr-only"> seats, {seatCats ? "your seat categories" : "every seat category"}</span>
          </Link>
        </span>,
      ];
    });
  // Header: this round's clear and virtual vacancies here (the newest PDF of each kind); the lists overlap, so never added.
  const isApart = (q: string | null) => !!q && !!E.apartQuotas?.quotas.includes(q);
  const roundSeats: { list: SeatList; n: number; apart?: number }[] =
    totals ??
    headerLists(round.map((r) => r.list)).map((list) => {
      const rows = round.find((r) => r.list === list)!.rows;
      return { list, n: rows.reduce((a, r) => a + r.seats, 0), ...(E.apartQuotas && { apart: rows.filter((r) => isApart(r.quota)).reduce((a, r) => a + r.seats, 0) }) };
    });

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      {/* A div: globals.css hides every <header> on paper (the app bar), and this one holds the name and address. Its one
          column is minmax(0, 1fr) and it may shrink: the type and beds line (one row that scrolls on phones) never widens the page. */}
      <div className="grid min-w-0 grid-cols-1 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href={L.institutes()} className={smallLink}>Institutes</Link>
            {college.state && <> / <Link href={L.institutes({ state: college.state })} className={smallLink}>{college.state}</Link></>}
          </p>
          <PageHead title={college.name} />
          {/* Type, place and beds on one line (on phones one row that scrolls sideways); the address, MCC profile and website one tap away. */}
          <p className="chip-row mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <TypeBadge type={info?.type} />
            {(college.state || college.pincode) && <span>{college.state}{college.pincode && <span className="numeric text-muted-foreground"> {college.pincode}</span>}</span>}
            {/* NEET MDS: no hospital beds (dental colleges). */}
            {E.has.beds && <span className="inline-flex items-center gap-1">
              {beds && !E.has.clinical ? (
                <span><span className="numeric font-semibold">{beds.text}</span>&nbsp;beds</span>
              ) : beds ? (
                <Link href={L.institute(slug, "clinical")} className="inline-flex min-h-11 items-center text-sky hover:underline"><span className="numeric font-semibold">{beds.text}</span>&nbsp;beds<span className="sr-only">: see Hospital facts</span></Link>
              ) : (
                <span className="text-muted-foreground">Beds: not published</span>
              )}
              {bedsFlags.length > 0 && <span className="text-xs text-sun">{bedsFlags.join(", ")}</span>}
              <InfoTip label="beds">
                {beds ? (
                  <>
                    <span className="block">{SELF_REPORTED}{beds.period && `, ${beds.period}`}{info!.beds!.kind && `: ${info!.beds!.kind}`}.</span>
                    {/* Only this count's flags, once (ValueSource's badges): the block's others may be about another figure. */}
                    <span className="mt-1 block"><ValueSource m={beds.meta} /></span>
                  </>
                ) : (
                  w("No bed count found in this institute's own disclosures, its NBEMS mandatory disclosure or its MCC profile. Seatora does not use paid aggregators' figures.")
                )}
              </InfoTip>
            </span>}
            {roundSeats.map(({ list, n, apart }) => (
              <span key={list.key} className="inline-flex items-center gap-0.5">
                <Link href={L.to(`/decide/institutes/${slug}`, { tab: "seats" })} className="inline-flex min-h-11 items-center hover:underline">
                  <span className="text-muted-foreground">{yn(list.year)} {roundIn(E, list.year, list.round)} {seatKindShort(list.kind, exam)}:</span>&nbsp;{n > 0 ? <span className={`numeric font-semibold ${list.kind === "virtual" ? "text-sun" : "text-leaf"}`}>{apart ? `${formatRank(n - apart)} open + ${formatRank(apart)} ${E.apartQuotas!.name}` : formatRank(n)}</span> : <span className="numeric text-muted-foreground">0 seats</span>}
                  <span className="sr-only"> seats: see Seats</span>
                </Link>
                <InfoTip label={listSeats(list, exam)}>
                  The {listTitle(list, exam)} list. {n > 0 ? (list.kind === "virtual" ? "Free only if the holder upgrades or leaves." : "Every course, quota and category here.") : `The ${by} list prints none here.`}{onePosition ? "" : " The lists overlap, so they are never added."}
                </InfoTip>
              </span>
            ))}
            {college.address && (
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                Address<InfoTip label="address">{pinNote ? `${college.address} (PIN from the institute's own site; ${by}'s ${pinNote})` : <>{college.address} (as printed by {by})</>}</InfoTip>
              </span>
            )}
            {info?.mccProfileUrl && (
              <a href={info.mccProfileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sky hover:text-foreground">
                MCC profile<ExternalLink className="size-4" strokeWidth={2} aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" title={info!.website ?? undefined} className="inline-flex min-h-11 items-center gap-1 text-sky hover:text-foreground">
                <Globe className="size-4" strokeWidth={2} aria-hidden />Website<span className="sr-only">: {info!.website}, {exam === "ini-cet" ? "its own site" : "as declared on its MCC profile"} (opens in a new tab)</span>
              </a>
            )}
          </p>
          {/* On paper the tip doesn't open: the address prints in full. */}
          {college.address && <p className="hidden text-sm print:block">{pinNote ? `Address (PIN from the institute's own site; ${by}'s ${pinNote}): ${college.address}` : <>Address as printed by {by}: {college.address}</>}</p>}
        </div>
      </div>

      <SubTabs label="Institute sections" current={tab} items={shownTabs.map((t) => ({ key: t.key, label: t.label, accent: "accent" in t && t.accent, href: L.to(`/decide/institutes/${slug}`, { tab: t.key }) }))} />

      {tab === "overview" && (
        <>
          <StatStrip
            items={[
              { label: "Courses", value: formatRank(pastCourses), info: courses.length > pastCourses ? `Courses with past ${by} allotments here.${newNote(courses.length - pastCourses, "course")}` : undefined },
              { label: "Options", value: formatRank(past.length), info: `Course and quota options here (with past allotments).${newNote(options.length - past.length, "option")}` },
              { label: `Allotments ${head}`, value: n2025 != null ? formatRank(n2025) : <Dash />, info: "All rounds and seat categories. This counts allotments, not seats." },
              // Four cells fill the strip: hers when she has a profile, else the latest year's allotments.
              profile
                ? { label: "Yours", value: formatRank(yours.length), info: "The course and quota options here that match your courses, quotas, states and caps." }
                : { label: `Allotments ${yearInfo(LATER)?.label ?? yn(LATER)}`, value: nLatest != null ? formatRank(nLatest) : <Dash />, info: "All seat categories. This counts allotments, not seats." },
            ]}
          />

          <section aria-labelledby="yours" className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="yours" className="text-lg font-semibold">{profile ? "Your options here" : "Courses and quotas here"}</h2>
              <Link href={L.institute(slug, "courses")} className={`${smallLink} text-sm text-sky`}>All courses</Link>
            </div>
            {unlistedNote && <div className="mt-2">{unlistedNote}</div>}
            {listed.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {profile ? "None of the courses and quotas with past allotments here match your profile." : "No courses with past allotments here."}{" "}
                {options.length > 0 && <Link href={L.institute(slug, "courses")} className={`${smallLink} text-sky`}>See every course here</Link>}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {listed.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>
                      <span className="font-medium">{courseName(o)}</span> <span className="text-sm text-muted-foreground"><QuotaName quota={o.quota} /></span>
                      <span className="flex gap-4 text-sm">
                        <Link href={L.lastRanks(o.course.slug, { inst: slug })} className={`${smallLink} text-sky`}>Last ranks</Link>
                        <Link href={L.institute(slug, "allotments", { course: o.course.slug })} className={`${smallLink} text-sky`}>Allotments</Link>
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      {profile && <ReachBadge reach={o.reach} provisional={o.reachProvisional} latest={latest} otherGroup={o.otherGroup} from={o.reachFrom} seats={o} />}
                      <span className="text-right"><span className="block text-xs text-muted-foreground">{head} deepest</span><Closing d={o.byYear[HEAD]} year={HEAD} /></span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <HistoryNote className="mt-3" more={!profile && "Closing ranks shown across all seat categories."} />
          </section>

          {E.has.fees && <section aria-labelledby="terms-h" className="grid gap-3 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="terms-h" className="flex items-center gap-1 text-lg font-semibold">
                Fees, stipend and bond
                <InfoTip label="fees, stipend and bond">
                  {exam === "ini-cet" ? <>Year 1 figures, as the INI-CET prospectus (Part B) prints them. &quot;—&quot; means it prints none, not &quot;none&quot;.</> : <>Year 1 figures, from what the college declared to MCC and NBEMS rules. &quot;—&quot; means not in the MCC profile fields Seatora imports, not &quot;none&quot;.</>}{" "}
                  Bond and leaving: a range when the amount depends on course type. Each cell&apos;s (i) has the exact words and their source; the Fees &amp; bond tab has every year by seat type.
                </InfoTip>
              </h2>
              <Link href={L.institute(slug, "fees")} className={`${smallLink} text-sm text-sky`}>Year by year</Link>
            </div>
            {fees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses here in the {by} data.</p>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {fees.map((p) => (
                  <li key={p.programme} className="grid min-w-0 rounded-lg border border-border">
                    <h3 className="px-3 pt-2 text-sm font-semibold">{programmeTitle(p)}</h3>
                    <TermStatCells t={p} of={`${college.name}, ${programmeTitle(p)}`} className="mt-2" />
                  </li>
                ))}
              </ul>
            )}
            <DataSource terms={termDocs(fees)} results={false} />
          </section>}

          <section aria-labelledby="trend" className="rounded-xl border border-border bg-card p-5">
            <h2 id="trend" className="flex items-center gap-1 text-lg font-semibold">
              Allotments made by year
              <InfoTip label="allotments made by year">All courses, rounds and seat categories here. This counts allotments, not seats.</InfoTip>
            </h2>
            <table className="mt-4 w-full max-w-xl text-sm">
              <caption className="sr-only">Allotments made by year at {college.name}</caption>
              <tbody>
                {[...allotmentsByYear].sort((a, b) => b.year - a.year).map((a) => (
                  <tr key={a.year}>
                    <th scope="row" className="w-48 py-1.5 text-left font-normal text-muted-foreground">{yearInfo(a.year)?.label ?? yn(a.year)}</th>
                    <td className="py-1.5">{a.n != null && <div className="h-3 rounded-r-[4px] bg-mark" style={{ width: `${(a.n / maxN) * 100}%` }} aria-hidden />}</td>
                    <td className="numeric w-16 py-1.5 text-right font-semibold">{a.n != null ? formatRank(a.n) : <Dash />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="mix-h" className="grid gap-3 rounded-xl border border-border bg-card p-5">
            <h2 id="mix-h" className="flex items-center gap-1 text-lg font-semibold">
              Allotments by quota and seat category
              <InfoTip label="allotments by quota and seat category">
                All courses here, from {by}&apos;s allotment results: the latest round, then each year with all its rounds. These count allotments (in R2 and later rounds, only fresh
                and upgraded ones), not seats. The seat category is the seat&apos;s, not the candidate&apos;s.
              </InfoTip>
            </h2>
            {mix ? <AllotmentMixTable mix={mix} name={college.name} /> : <p className="text-sm text-muted-foreground">No {by} allotments here in the imported results.</p>}
          </section>
          <DataSource used={[...PAST_YEARS.map((year) => ({ year })), { year: LATEST_YEAR }, ...(mix?.columns.map((c) => ({ year: c.year, round: c.round })) ?? [])]} />
        </>
      )}

      {tab === "courses" && (
        <section aria-labelledby="courses-h" className="grid grid-cols-1 gap-3">
          <h2 id="courses-h" className="sr-only">Courses</h2>
          {unlistedNote}
          <div className={toolbarRow}>
            {mine && round.length > 0 && options.length > 0 ? (
              <CategoryToggle mine={mine} all={!seatCats} href={(all) => L.with(`/decide/institutes/${slug}`, { scat: all ? "all" : null })} />
            ) : <span className="max-md:hidden" />}
            {options.length > 0 && (
              <span className="flex flex-wrap items-center gap-2">
                <SortMenu value={courseSort} choices={courseSorts.filter((s) => (s !== "reach" || profile) && (s !== "fee" || E.has.fees)).map((s) => ({ value: s, ...courseSortWords[s], href: L.with(`/decide/institutes/${slug}`, { sort: s || null, page: null }) }))} />
                <ViewToggle page="institute-courses" />
              </span>
            )}
          </div>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses with past {by} allotments here, so there are no closing ranks to show.</p>
          ) : (
            <ViewPanes
              page="institute-courses"
              view={await chosenView(sp, "institute-courses")}
              cards={
                <ul className="grid gap-3 lg:grid-cols-2">
                  {courseRows.map((r) => {
                    const d = r.byYear[HEAD];
                    const name = `${college.name}, ${courseName(r)}, ${quotaIn(E, r.quota)}`;
                    return (
                      <li key={r.id} className="grid min-w-0">
                        <ResultCard
                          chips={[quotaIn(E, r.quota), profile && <ReachBadge reach={r.reach} provisional={r.reachProvisional} latest={latest} otherGroup={r.otherGroup} from={r.reachFrom} seats={r} />]}
                          actions={<>{profile && <ChoiceStar item={toChoiceItem(r, latest)} />}<CompareToggle id={r.id} label={name} /></>}
                          stat={{ label: `${head} deepest`, value: d ? <span className="numeric">{formatRank(d.closing)}</span> : <Dash /> }}
                          title={courseName(r)}
                          href={L.lastRanks(r.course.slug, { inst: slug })}
                          subtitle={d && <span className="text-xs text-muted-foreground">{roundIn(E, HEAD, d.round)}, {d.category} seat</span>}
                          meta={[
                            <span key="r1">{latestText(latest)}: {r.latest ? <span className="numeric font-semibold text-foreground">{formatRank(r.latest.closing)}</span> : "—"} <Provisional when={r.latest?.provisional && !(profile && r.reachProvisional)} /></span>,
                            ...seatLinks(r),
                            r.seatsBelow?.length ? <SeatsBelowNote key="below" r={r} latest={latest} /> : null,
                          ]}
                          footer={<TermStatCells t={r.fees} of={name} />}
                        />
                      </li>
                    );
                  })}
                </ul>
              }
              table={
                <ScrollTable label="Courses offered">
                  <table className={tbl.table}>
                    <caption className="sr-only">Courses at {college.name}, with past closing ranks, fees, stipend and bond</caption>
                    <thead className={tbl.head}>
                      <tr className={tbl.headRow}>
                        <th scope="col" className="w-12 px-1 py-3"><span className="sr-only">Add to choices, compare</span></th>
                        {/* Sticky: scrolled sideways to the fee columns, the course stays in view (the star scrolls under it).
                            Reach and the round's seats sit under the course, so every fee and bond cell fits a 1366px screen. */}
                        <th scope="col" className={`${thTight} ${stick} z-[3]`}>Course</th>
                        <th scope="col" className={`${thTight} text-right`}>{latestText(latest)}</th>
                        <th scope="col" className={`${thTight} text-right`}>{head} deepest</th>
                        {statKeys.map((k) => <th key={k} scope="col" data-col={k} className={`${tbl.th} text-right`}>{statLabel[k]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {courseRows.flatMap((r) => [
                        <tr key={r.id} className={`expand-host ${tbl.row}`}>
                          {/* Without a rank the reach is unknown, so nothing would be saved with the choice: star only with a profile. */}
                          <td className="px-1 py-2"><div className="grid justify-items-center">{profile && <ChoiceStar item={toChoiceItem(r, latest)} />}<CompareToggle id={r.id} label={`${college.name}, ${courseName(r)}, ${quotaIn(E, r.quota)}`} /></div></td>
                          <th scope="row" className={`${stick} min-w-48 px-3 py-3 text-left align-top font-medium`}>
                            <Link href={L.lastRanks(r.course.slug, { inst: slug })} className="hover:text-sky hover:underline">{courseName(r)}</Link>
                            <span className="block text-xs font-normal text-muted-foreground"><QuotaName quota={r.quota} /></span>
                            {profile && <span className="mt-1 block font-normal"><ReachBadge reach={r.reach} provisional={r.reachProvisional} latest={latest} otherGroup={r.otherGroup} from={r.reachFrom} seats={r} /><SeatsBelowNote r={r} latest={latest} /></span>}
                            {round.length > 0 && <span className="mt-1 flex flex-wrap gap-x-3 text-xs font-normal">{seatLinks(r).length ? seatLinks(r) : <span className="text-muted-foreground">No {roundIn(E, round[0].list.year, round[0].list.round)} seats</span>}</span>}
                            <div className="flex flex-wrap items-center gap-x-3 text-xs font-normal">
                              <details className="w-fit"><summary className="cursor-pointer py-3 text-sky">Rounds by year</summary></details>
                              <Link href={L.institute(slug, "allotments", { course: r.course.slug })} className="py-3 text-sky underline hover:text-foreground">Allotments</Link>
                            </div>
                          </th>
                          <td className={numTight}>
                            <Closing d={r.latest} year={latest.year} />
                            {/* ReachBadge already carries the marker for the latest round's label. */}
                            <Provisional when={r.latest?.provisional && !(profile && r.reachProvisional)} />
                          </td>
                          <td className={numTight}><Closing d={r.byYear[HEAD]} year={HEAD} /></td>
                          <TermStatCells t={r.fees} variant="table" of={`${college.name}, ${courseName(r)}, ${quotaIn(E, r.quota)}`} />
                        </tr>,
                        <tr key={`${r.id}-rounds`} className="expand-row bg-muted/30">
                          <td />
                          <td colSpan={3 + statKeys.length} className="px-4 pb-4"><RoundGrid row={r} caption={`${courseName(r)}, ${quotaIn(E, r.quota)}: closing ranks by year and round`} /></td>
                        </tr>,
                      ])}
                    </tbody>
                  </table>
                </ScrollTable>
              }
            />
          )}
          <HistoryNote
            more={
              <>
                {profile ? "Closing ranks are on the seat categories you can take." : "Closing ranks shown across all seat categories."}
                {roundName &&
                  ` ${roundName} seats: in each of ${by}'s ${roundName} lists (${[...new Set(roundLists.map((l) => kindName(l.kind, exam).toLowerCase()))].join(", ")}), that quota and ${seatCats ? "your seat categories" : "every seat category"}; a list with none here is left out. The lists overlap, so their seats are never added together. Each number opens those seats on Seats.`}
              </>
            }
          />
          <DataSource />
          <SeatSource lists={roundLists} L={L} />
        </section>
      )}

      {tab === "seats" &&
        (round.length === 0 ? (
          <EmptyState title="Seat lists not imported yet" description={`No ${by} seat list is in the data yet, so there are no seats to show here.`} href={L.institute(slug, "courses")} action="See the courses here" />
        ) : (
          <section aria-labelledby="seats-h" className="grid grid-cols-1 gap-8">
            <div className="grid gap-2">
              <h2 id="seats-h" className="flex items-center gap-1 text-lg font-semibold">
                {roundName} seat lists here
                <InfoTip label="seat lists">
                  Every course here, each list as its {by} PDF printed it.{onePosition ? "" : " The kinds of list overlap (most newly added seats are also clear vacancies), so their seats are never added together."}
                </InfoTip>
              </h2>
              <ListsHistory lists={roundLists} />
            </div>
            {round.map(({ list, rows }, i) => {
              const n = rows.reduce((a, r) => a + r.seats, 0);
              // INI-CET: the open seats, and each restricted quota's (Sponsored, Foreign National…) said apart, never one total.
              // INI-CET: the quotas AIIMS's seat position notifies apart (Sponsored / Foreign National), one figure beside the open seats.
              const apartN = rows.filter((r) => isApart(r.quota)).reduce((a, r) => a + r.seats, 0);
              const restricted = E.apartQuotas && apartN ? [[E.apartQuotas.name, apartN] as const] : [];
              const open = n - restricted.reduce((a, [, m]) => a + m, 0);
              return (
                <section key={list.key} aria-labelledby={`seats-${i}`} className="grid gap-3">
                  <h3 id={`seats-${i}`} className="flex flex-wrap items-center gap-x-2 text-base font-semibold">
                    {kindName(list.kind, exam)}
                    {rows.length > 0 && (
                      <span className="numeric text-sm font-normal text-muted-foreground">
                        {formatRank(restricted.length ? open : n)} {restricted.length ? "open" : (n === 1 ? "seat" : "seats")}{restricted.length ? "" : " here"}
                        {restricted.map(([q, m]) => <Fragment key={q}> + {formatRank(m)} {q}{" "}here</Fragment>)}
                      </span>
                    )}
                    <InfoTip label={kindName(list.kind, exam).toLowerCase()}><span className="first-letter:uppercase">{kindName(list.kind, exam)}: {kindNote(list.kind, exam)}</span></InfoTip>
                  </h3>
                  {rows.length > 0 ? (
                    <CollegeSeatTable rows={rows} caption={`${listSeats(list, exam)} at ${college.name} (${by} PDF), by course`} />
                  ) : (
                    <p className="text-sm text-muted-foreground">This list prints no seats here.</p>
                  )}
                  <SeatSource lists={[list]} L={L} />
                </section>
              );
            })}
          </section>
        ))}

      {tab === "allotments" && allot && (
        <section aria-labelledby="allot-h" className="grid grid-cols-1 gap-4">
          <h2 id="allot-h" className="sr-only">Allotments</h2>
          <FilterBar
            action={`/decide/institutes/${slug}`}
            params={sp}
            active={(allotYear ? 1 : 0) + (allotCourse ? 1 : 0)}
            clear={L.institute(slug, "allotments", { sort: allotSort })}
            total={allot.total}
            noun="allotments"
            sort={
              (allot.total > 0 || allotSort) && (
                <SortMenu
                  value={allotSort ?? "rank"}
                  choices={[
                    { value: "rank", label: "Rank (newest round first)", short: "Rank", href: L.with(`/decide/institutes/${slug}`, { sort: null, page: null }) },
                    { value: "course", label: "Course A–Z", short: "Course", href: L.with(`/decide/institutes/${slug}`, { sort: "course", page: null }) },
                  ]}
                />
              )
            }
          >
            <input type="hidden" name="tab" value="allotments" />
            <Field label="Year"><Select name="year" value={allotYear ? String(allotYear) : undefined} all="All years" options={meta.years.map((y) => ({ value: String(y.year), label: y.label }))} /></Field>
            <Field label="Course"><Select name="course" value={allotCourse} all="All courses" options={courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
          </FilterBar>
          <div className={toolbarRow}>
            <p id="results" tabIndex={-1} aria-live="polite" className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
              <span className="max-md:sr-only"><span className="numeric font-semibold text-foreground">{rangeLabel(allot)}</span> allotments</span>
              <InfoTip label="allotments here">Newest first. Ranks only, never names. Select a rank to scan the allotments around it that year.</InfoTip>
              <Link href={L.allotments({ inst: slug, course: allotCourse, year: allotYear })} className={`${smallLink} text-sky`}>Open in Allotments</Link>
            </p>
            {allot.total > 0 && <ViewToggle page="institute-allotments" />}
          </div>
          {allot.total === 0 ? (
            <EmptyState title="No allotments match these filters." href={L.institute(slug, "allotments")} />
          ) : (
            <ViewPanes
              page="institute-allotments"
              view={await chosenView(sp, "institute-allotments")}
              cards={
                <ul className="grid gap-3 lg:grid-cols-2">
                  {allot.rows.map((a, i) => (
                    <li key={i} className="grid min-w-0">
                      <ResultCard
                        chips={[<span key="yr"><span className="numeric">{yn(a.year)}</span> · {roundIn(E, a.year, a.round)}</span>, a.quota, `${a.category} seat`, a.provisional && <Provisional key="p" when />]}
                        stat={{ label: "Rank", value: <Link href={L.rankScan(a.rank, a.year, rankListParam(exam, a.degree))} className="numeric inline-flex min-h-11 items-center hover:text-sky hover:underline">{formatRank(a.rank)}<span className="sr-only">: scan ranks around it</span></Link> }}
                        title={a.courseName}
                        href={L.lastRanks(a.courseSlug, { inst: slug })}
                        meta={[a.remark]}
                      />
                    </li>
                  ))}
                </ul>
              }
              table={
                // The rank pinned (phones: with its round under it, so a row swiped sideways still says when; tighter cells, so
                // the five columns fit 360px).
                <ScrollTable label="Allotments at this institute">
                  <table className={tbl.table}>
                    <caption className="sr-only">Allotments at {college.name}</caption>
                    <thead className={tbl.head}><tr className={tbl.headRow}>
                      <th scope="col" className={`${tbl.th} ${stick} text-right max-md:px-2`}>Rank<span className="md:hidden"> and round</span></th><th scope="col" className={`${tbl.th} max-md:hidden`}>Round</th><th scope="col" className={`${tbl.th} max-md:px-2`}>Course</th><th scope="col" className={`${tbl.th} max-md:px-2`}>Quota</th><th scope="col" className={`${tbl.th} max-md:px-2`}>Seat category</th><th scope="col" className={`${tbl.th} max-md:px-2`}>Remark</th>
                    </tr></thead>
                    <tbody>
                      {allot.rows.map((a, i) => (
                        <tr key={i} className={tbl.row}>
                          <td className={`${tbl.num} ${stick} max-md:px-2`}>
                            <Link href={L.rankScan(a.rank, a.year, rankListParam(exam, a.degree))} className="hover:text-sky hover:underline" title="Scan ranks around this one">{formatRank(a.rank)}</Link>
                            <span className="block text-xs font-normal whitespace-nowrap md:hidden"><span className="numeric">{yn(a.year)}</span> {roundIn(E, a.year, a.round)} <Provisional when={a.provisional} /></span>
                          </td>
                          <td className={`${tbl.td} whitespace-nowrap max-md:hidden`}><span className="numeric">{yn(a.year)}</span> {roundIn(E, a.year, a.round)} <Provisional when={a.provisional} /></td>
                          <td className={`${tbl.td} max-md:px-2`}><Link href={L.lastRanks(a.courseSlug, { inst: slug })} className="hover:text-sky hover:underline">{a.courseName}</Link></td>
                          <td className={`${tbl.td} max-md:px-2`}><QuotaName quota={a.quota} /></td>
                          <td className={`${tbl.td} max-md:px-2`}>{a.category}</td>
                          <td className={`${tbl.td} text-muted-foreground max-md:px-2`}>{a.remark}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollTable>
              }
            />
          )}
          <Pager page={allot.page} pageSize={allot.pageSize} total={allot.total} href={(n) => L.page(`/decide/institutes/${slug}`, n)} focusId="results" label="Allotments" />
          <DataSource used={[...new Map(allot.rows.map((a) => [`${a.year}|${a.round}`, { year: a.year, round: a.round }])).values()]} />
        </section>
      )}

      {tab === "fees" && (
        <section aria-labelledby="fees-h" className="grid grid-cols-1 gap-4">
          <h2 id="fees-h" className="sr-only">Fees, stipend and bond</h2>
          {fees.length === 0 ? (
            <EmptyState title={`No courses here in the ${by} data`} description="There is no programme here to show fees, stipend or bond for." href={L.institute(slug, "courses")} action="See the courses here" />
          ) : (
            <>
              {fees.length > 1 && (
                <nav aria-label="Programmes here" className="flex flex-wrap gap-x-4 text-sm">
                  {fees.map((p) => <a key={p.programme} href={`#fees-${programmes[p.programme].slug}`} className={`${smallLink} text-sky`}>{programmeTitle(p)}</a>)}
                </nav>
              )}
              {fees.map((p, i) => (
                <div key={p.programme} className="rounded-xl border border-border bg-card p-5">
                  <FeesSection t={p} groups={feeGroups[i]} courses={feeCourses.filter((c) => programmeOfDegree(c.degree, exam) === p.programme)} id={`fees-${programmes[p.programme].slug}`} />
                </div>
              ))}
            </>
          )}
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
            {MISSING_WORDS}{exam === DEFAULT_EXAM && " NBEMS maximum and minimum are NBEMS's limits."}
            <InfoTip label="fees and bond">
              {exam === DEFAULT_EXAM ? (
                <>
                  One section per programme offered here ({fees.map(programmeTitle).join(", ") || "none"}), by seat type (All India, {quotaIn(E, "Deemed/Paid")}, NRI, DNB Quota) where the MCC profile gives them. Fee that year and stipend per month as declared to MCC; where the profile&apos;s fee is not one clearly labelled amount per year, its own words with their link instead, never a figure. NBEMS maximum and minimum are NBEMS&apos;s limits, not the college&apos;s figures. Not published: not in the MCC profile fields Seatora imports (the profile may say more), never zero.
                  Leaving the course after joining is the college&apos;s or state&apos;s penalty from its bond document; resigning from Round 2 is MCC&apos;s separate forfeit.
                </>
              ) : exam === "ini-cet" ? (
                <>
                  One section per programme offered here ({fees.map(programmeTitle).join(", ") || "none"}), as the INI-CET prospectus (Part B) prints them for this institute: fee that year and stipend per month; where it gives no one figure, its own words. Not published: not in the prospectus, never zero.
                  The bond and the leaving penalty are the prospectus&apos;s terms (&quot;Not known&quot;: it neither states nor rules out service after the course).
                </>
              ) : (
                <>
                  One section per programme offered here ({fees.map(programmeTitle).join(", ") || "none"}), by seat type where the college&apos;s MCC institute profile gives them. Fee that year and stipend per month as declared to MCC; where the profile&apos;s fee is not one clearly labelled amount per year, its own words with their link instead (a figure they state, beside them). Not published: not in the profile fields Seatora imports (the profile may say more), never zero.
                  The bond is from MCC&apos;s institute list: &quot;No bond&quot;, a stated bond, &quot;No bond declared&quot; (a DrNB hospital that declared none: NBEMS&apos;s rule lets it impose none this session), or &quot;Not known&quot; (a document Seatora couldn&apos;t read, a blank form, none declared on a D.M. / M.Ch. or MDS seat: the bond box says which); resigning from Round 2 is MCC&apos;s separate forfeit.
                </>
              )}
            </InfoTip>
          </p>
          {college.state && <p className="text-sm"><Link href={L.fees({ state: college.state })} className={`${smallLink} text-sky`}>Compare fees with other institutes in {college.state}</Link></p>}
          {/* Another exam: its fee figures' source, the MCC institute-profile snapshot (DataSource adds it). */}
          {exam !== DEFAULT_EXAM && <DataSource terms={termDocs(fees)} results={false} />}
        </section>
      )}

      {tab === "clinical" &&
        (clinical ? (
          <HospitalFacts f={clinical} name={college.name} />
        ) : (
          <EmptyState
            title="No hospital facts found yet"
            description="Seatora has found no beds, patient numbers or facilities published by this institute, and no NBEMS mandatory disclosure check for it."
            href={L.institute(slug, "courses")}
            action="See the courses here"
          />
        ))}
      {residentsAccess === "locked" && (
        <EmptyState title="Sign in to see residents" description="Names are shown only to the signed-in, invited account." href={L.institute(slug, "courses")} action="See the courses here" />
      )}
      {(residentsAccess === "plan_limit" || residentsAccess === "device_limit") && me && <Paywall feature="residents" eff={me.eff} device={residentsAccess === "device_limit"} />}
      {residentsAccess === "rate_limited" && (
        <EmptyState title="Too many requests" description="Residents were opened too many times from this network or account. Try again in an hour, or tomorrow." href={L.institute(slug, "courses")} action="See the courses here" />
      )}
      {tab === "residents" && residents && (
        <section aria-labelledby="res-h" className="grid grid-cols-1 gap-4">
          <h2 id="res-h" className="sr-only">Residents</h2>
          {residents.total > 0 && (
            <FilterForm action={`/decide/institutes/${slug}`} className={toolbar}>
              {[...sp.entries()].filter(([k]) => !["rcourse", "ryear", "tab"].includes(k)).map(([k, v], i) => <input key={`${k}-${i}`} type="hidden" name={k} value={v} />)}
              <input type="hidden" name="tab" value="residents" />
              <FiltersPanel count={(rCourses.length > 0 ? 1 : 0) + (rYears.length > 0 ? 1 : 0)} clear={L.to(`/decide/institutes/${slug}`, { tab: "residents" })} total={residentRows.length} counts={residentTally}>
                <FilterDropdown label="Course" name="rcourse" search options={residentCourseOptions} selected={rCourses} none="All courses" />
                <FilterDropdown label="Year" name="ryear" options={residentYearOptions} selected={rYears.map(String)} none="All years" />
              </FiltersPanel>
              <span className="ml-auto self-center text-sm text-muted-foreground"><span className="numeric font-semibold text-foreground">{formatRank(residentRows.length)}</span> {residentRows.length === 1 ? "resident" : "residents"}</span>
            </FilterForm>
          )}
          {residents.total === 0 ? (
            <EmptyState title="No residents listed here" description="MCC's admitted-candidates lists have no names at this institute, or they were hidden." href={L.institute(slug, "courses")} action="See the courses here" />
          ) : (
            <>
              {residentsNote && <p className="text-sm text-muted-foreground">{residentsNote}</p>}
              {residentGroups.map((g) => (
                <section key={g.course.slug} aria-labelledby={`res-${g.course.slug}`} className="grid gap-2">
                  <h3 id={`res-${g.course.slug}`} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    {g.course.degree} {g.course.name} <span className="numeric text-sm font-normal text-muted-foreground">{formatRank(g.total)}</span>
                    {profile && g.mine && <Badge tone="info">In your profile</Badge>}
                  </h3>
                  <div role="region" aria-label={`Residents, ${g.course.degree} ${g.course.name}`} tabIndex={0} className={tbl.wrap}>
                    <table className={tbl.table}>
                      <caption className="sr-only">Residents in {g.course.degree} {g.course.name} at {college.name}, newest year first</caption>
                      <thead><tr className={tbl.headRow}>
                        <th scope="col" className={tbl.th}>Name</th><th scope="col" className={tbl.th}>Year</th>
                      </tr></thead>
                      {g.years.map((y) => (
                        <tbody key={y.year}>
                          {y.rows.map((r) => (
                            <HideableRow key={r.id} id={r.id} name={r.name} hide={hideResidentAction} colSpan={2} className={tbl.row}>
                              <th scope="row" className={`${tbl.td} text-left font-medium`}>{r.name}</th>
                              <td className={`${tbl.td} numeric`}>{r.year}</td>
                            </HideableRow>
                          ))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                </section>
              ))}
            </>
          )}
          {/* No rank shown, so the NBEMS results it came from are not cited. */}
        </section>
      )}
      {/* Every tab: a wrong figure here goes to Help's Report wrong data with the college named. */}
      <p className="text-xs" data-print-hide>
        <Link href={L.to("/decide/requests", { about: college.name }, "#report")} className={`${smallLink} text-muted-foreground underline hover:text-foreground`}>Report wrong data</Link>
      </p>
    </AppPage>
  );
}
