import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { z } from "zod";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead, Provisional, SetRankPrompt } from "@/features/decide/components/bits";
import { CsvLink } from "@/features/decide/components/csv-link";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { termDocs } from "@/features/decide/components/fees";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { FilterForm, FiltersPanel, ToolbarCount, ToolbarSearch } from "@/features/decide/components/filter-form";
import { InfoTip } from "@/features/decide/components/info-tip";
import { OptionsResults } from "@/features/decide/components/option-actions";
import { ViewField } from "@/features/decide/components/view-toggle";
import { chosenView } from "@/features/decide/server/view";
import { listRow } from "@/features/decide/components/options-view";
import { fmtDay, kindNote, seatKindNote, UnlistedSeats } from "@/features/decide/components/seats/seat-lists";
import { CourseReach, StillCanDo, type CourseHit } from "@/features/decide/components/still-can-do";
import { YourPicture } from "@/features/decide/components/your-picture";
import { GroupPrompt } from "@/features/decide/components/dashboard-parts";
import { TermFilterControls, UntypedNote } from "@/features/decide/components/term-filter-controls";
import { ActiveFilters, control, EmptyState, Field, smallLink, toolbar } from "@/features/decide/components/ui";
import { Button } from "@/components/ui/button";
import { ListOrdered } from "lucide-react";
import { iniElsewhere } from "@/features/decide/lib/college-aliases";
import { decideLinks } from "@/features/decide/lib/links";
import { roundName } from "@/features/decide/lib/round-status";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { deepestOf, eligibleCategories, latestText, reachLabel, reachOrder, reachWindow, resultsSpan, STRAY_NOT_COUNTED } from "@/features/decide/lib/reach";
import { readTermFilters, termChips, termValueLabel, untypedOnly } from "@/features/decide/lib/term-filters";
import { keepProfileParams, orderUnits, pairChoices, profileFromParams, profileToParams, toURLSearchParams } from "@/features/decide/profile";
import { examGroupCourses, getMeta, listOptions, nearestCourses, optionsPicture, optionsView, reachedOf, unlistedSeats } from "@/features/decide/service";
import { kindName, optionSorts, optionsViews, roundShort, seatKindLabel, seatKinds, type OptionSort, type SeatKind } from "@/features/decide/types";
import { activeExam, examInfo } from "@/features/exams/active";
import { authorityOf, DEFAULT_EXAM, examYears, headYearIn, latestOf, perGroup, sessionExams, yearName } from "@/features/exams/registry";
import { groupsIn, quotaIn } from "@/features/exams/exam";

export const metadata: Metadata = { title: "Options" };
const PAGE_SIZE = 25; // both the table and the phone cards are in the HTML: 25 rows keep the page light

/** Page filters (her profile filters are the profile params: sp, deg, quota, st, fee, bond; the term filters: lib/term-filters.ts). */
const filtersSchema = z.object({
  q: z.string().max(100).optional(),
  reach: z.enum(reachOrder).optional(),
  /** Closed-before options shown ("1") or hidden ("0"); absent = the view's default (round: shown, all: hidden). */
  closed: z.enum(["0", "1"]).optional(),
  prov: z.literal("0").optional(),
  /**
   * Seats in the newest round's lists: one list ("1", older links, = clear vacancy), "any" list, or "all" = with or
   * without; absent = the view's default (round: any, all: with or without). Lists are never added.
   */
  seats: z.enum(["1", "any", "all", ...seatKinds]).optional(),
  /** "round" or "all" (types.ts optionsViews); absent = the data's default (service.ts optionsView). */
  view: z.enum(optionsViews).optional(),
  /** types.ts optionSorts; absent = by label. */
  sort: z.enum(optionSorts).optional(),
  /** "1": every card's Details open. */
  details: z.literal("1").optional(),
  /** "1": only the options her caps and term filters hide on a known figure (another exam's "Show them"), each saying which. */
  capped: z.literal("1").optional(),
  page: pageValue.default(1),
});
const sortLabels = (last: string): Record<OptionSort, string> => ({
  label: "Label (reached first)",
  deep: `${last} closing: deepest first`,
  tight: `${last} closing: tightest first`,
  fee: "Fee, year 1: lowest first",
  stipend: "Stipend, year 1: highest first",
});

export default async function OptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  if (!profile) return <AppPage><PageHead title="Options" /><SetRankPrompt path="/decide/options" /></AppPage>;
  const exam = await activeExam();
  const E = await examInfo(exam); // its data: fees once its import has them
  // NEET SS: a rank is within one question group, so nothing is labelled until she picks hers.
  if (perGroup(exam) && !profile.quotas.length) return <AppPage><PageHead title="Options" /><GroupPrompt /></AppPage>;
  const PAST_YEARS = E.pastYears;

  const f = parseSearchParams(filtersSchema, params);
  // Term filters (college type, fee, stipend, bond, leaving): an absent maxfee / bondyrs is her profile's cap.
  const { params: tp, filters: terms } = readTermFilters(params, profile);
  const hasSeats = f.seats === "1" ? "clear" : f.seats === "all" ? false : f.seats;
  // The ones her caps hide ("Show them"): every one of them, whatever its seats or closing (the count said so).
  const capMode = f.capped === "1" && exam !== DEFAULT_EXAM;
  const filters = capMode
    ? { search: f.q, includeProvisional: !f.prov, showClosed: true, hasSeats: false, view: "all" as const, terms, sort: f.sort, capped: true }
    : { search: f.q, reach: f.reach ? [f.reach] : undefined, includeProvisional: !f.prov, showClosed: f.closed ? f.closed === "1" : undefined, hasSeats, view: f.view, terms, sort: f.sort };
  // A college type picked: the options it left out only because their type is not known (counted, never silently).
  const typeless = untypedOnly(terms);
  const [meta, r, view, untyped, pic] = await Promise.all([
    getMeta(exam),
    listOptions(profile, filters, { page: f.page, pageSize: PAGE_SIZE }, exam),
    chosenView(params, "options"),
    typeless ? listOptions(profile, { ...filters, terms: typeless }, { page: 1, pageSize: 1 }, exam).then((x) => x.total) : 0,
    // "Your picture": the same options the reach chips count (search, view, seats and terms as here).
    optionsPicture(profile, filters, exam),
  ]);
  // The sorts' year: the latest complete one (NEET PG: its later past year, as before).
  const HEAD = yearName(exam, headYearIn(exam, meta.sources)); // as the exam names it (INI-CET: "Jan 2026")
  const sortLabel = sortLabels(HEAD);
  const lists = r.seatLists;
  const roundView = r.view === "round";
  // The round view lists the seats with no past allotment as rows; the other view names them and links Seats.
  const unlisted = roundView ? null : await unlistedSeats(profile, r.seats === "virtual" || r.seats === "new" ? r.seats : "clear", exam);
  // Nothing with the round's seats: how many match without that filter (the empty state offers them).
  const withoutSeats = !r.total && r.seats ? (await listOptions(profile, { ...filters, hasSeats: false }, { page: 1, pageSize: 1 }, exam)).total : 0;
  const L = decideLinks(params);
  const pairNames = new Map(pairChoices(meta.courses).map((x) => [x.value, x.label]));
  const pairLabel = (c: string) => pairNames.get(c) ?? c.replace("~", " ");
  const here = (changes: Record<string, string | null>) => L.with("/decide/options", { page: null, ...changes });
  // The All chip counts what it lists: closed-before options only while they are shown.
  const all = reachOrder.reduce((s, x) => s + r.counts[x], 0) - (r.showClosed ? 0 : r.counts["closed-before"]);
  // The latest year's newest round (lib/reach.ts latestRound): the only one that can be provisional (MCC's provisional
  // result); the toggle exists only then.
  const latest = latestOf(meta.sources, exam);
  const latestName = `${yearName(exam, latest.year)} ${roundShort(latest.round, exam)}`;
  const by = authorityOf(exam); // MCC; INI-CET: AIIMS
  const counted = reachWindow(latest, PAST_YEARS, !f.prov);
  const round = lists[0] && `${yearName(exam, lists[0].year)} ${roundShort(lists[0].round, exam)}`;
  const roundWords = lists[0] && roundName[lists[0].round];
  // Switching views drops the filters whose default differs by view (seats, closed), so each view opens as itself, and
  // the "new" label, which only the round view has.
  const other = roundView ? "all" : "round";
  const otherView = here({ view: optionsView(undefined, lists, meta.sources) === other ? null : other, seats: null, closed: null, ...(f.reach === "new" ? { reach: null } : {}) });
  const sum = r.summary;
  // Every option labelled (closed-before ones too, shown or not), and those that reached her rank in R1 to R3 of a counted year.
  const labelled = reachOrder.reduce((s, x) => s + r.counts[x], 0);
  const reached = r.counts["reached-latest"] + r.counts["reached-both"] + r.counts["reached-one"];
  const headYear = headYearIn(exam, meta.sources);
  // None reached: the option that closed deepest in the head year (any round), so the verdict has a number.
  // An exam with sessions (INI-CET): the label counts every session of its years (Jul 2025, Jan 2026 and Jul 2026), so
  // the deepest is across all of them, its session named; every other exam's as before (the head year's).
  const sessions = sessionExams.includes(exam);
  const none = labelled > 0 && reached === 0;
  const deepestRows = none ? (await listOptions(profile, { ...filters, reach: undefined, showClosed: true, sort: "deep" }, { page: 1, pageSize: sessions ? labelled : 1 }, exam)).rows : [];
  const across = sessions ? deepestOf(deepestRows.flatMap((r) => examYears(exam).flatMap((y) => (r.byYear[y] ? [{ r, y, ...r.byYear[y]! }] : [])))) : null;
  const deepest = across ? across.r : deepestRows[0];
  const deepestYear = across ? across.y : headYear;
  const deepestAt = deepest?.byYear[deepestYear];
  // Which of her courses reached her rank (r.courses), linked to each on Options; none of hers: the nearest that did.
  const courseHit = (key: string, n: number): CourseHit => ({ key, name: pairLabel(key), n, href: L.with("/decide/options", { c: key, page: null, reach: null, q: null }) });
  const hit = Object.entries(r.courses).flatMap(([key, c]) => (reachedOf(c) ? [courseHit(key, reachedOf(c))] : [])).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const missed = orderUnits(profile)
    .filter((u) => !hit.some((h) => h.key === u || h.key.endsWith(`~${u}`)))
    .map((u) => (u.includes("~") ? pairLabel(u) : (meta.specialties.find((x) => x.code === u)?.name ?? u)));
  const nearest = labelled > 0 && reached === 0 ? (await nearestCourses(profile, filters, exam)).map((x) => courseHit(x.key, x.reached)) : undefined;
  const suggestButton = (
    <Button asChild variant="secondary" className="max-sm:w-full">
      <Link href={L.to("/decide/choices/suggest")}><ListOrdered className="size-4" aria-hidden />Suggest my list</Link>
    </Button>
  );
  const courseReach = <CourseReach hit={hit} missed={missed} nearest={nearest} rank={`${E.rankWord} ${formatRank(profile.rank)}`} when={reachWindow(latest, PAST_YEARS, !f.prov, true)} />;
  // NEET SS, nothing at all: her courses that are another question group's, said with the way to change it.
  const groupCourses = perGroup(exam) && !labelled ? await examGroupCourses(exam) : null;
  const mine = groupsIn(E, profile.quotas);
  const outside = groupCourses
    ? (profile.pairs?.length ? profile.pairs : profile.specialties).flatMap((c) => {
        const groups = Object.entries(groupCourses).filter(([, cs]) => cs.some((x) => x === c || x.endsWith(`~${c}`))).map(([g]) => g);
        return groups.length && !groups.some((g) => mine.includes(g)) ? [{ c, groups }] : [];
      })
    : [];
  const seats = eligibleCategories(profile.category, profile.pwd).join(" or ");
  const keep = keepProfileParams(params);
  // Same profile and filters for /api/v1/options, where "Show more" reads the next pages (and the CSV).
  const api = profileToParams(profile);
  for (const [k, v] of [["q", f.q], ["reach", f.reach], ["prov", f.prov], ["view", r.view], ["showClosed", r.showClosed ? "1" : "0"], ["hasSeats", r.seats ?? "all"], ["sort", f.sort]] as const) if (v) api.set(k, v);
  for (const [k, v] of Object.entries(tp)) if (v != null) api.set(k, Array.isArray(v) ? v.join(",") : String(v));
  // INI-CET: one list a session, AIIMS's seat position (never clear / virtual / newly added).
  const sp = kindName("clear", exam) === "Seat position";
  const caption = `Options for ${E.rankWord} ${formatRank(profile.rank)} (${profile.category}${profile.pwd ? " PwD" : ""}), closing ranks on ${seats} seats${lists.length ? (sp ? `; ${round} seat position` : `; ${round} seats per list (${lists.map((l) => l.kind).join(", ")}), never added`) : ""}`;
  // Chips for what narrows this list beyond her courses: each removes one filter, Clear all removes them all.
  // One name per value, the chip's and the Filters sheet's alike ("any" is any of the round's lists, never with or without).
  const seatsWords = (s: SeatKind | "any") => (s === "any" || sp ? `Has seats in ${sp ? `the ${round} seat position` : `any ${round} list`}` : `Has ${round} ${seatKindLabel[s].toLowerCase()}${s === "new" ? "" : " seats"}`);
  const closedDefault = roundView ? "1" : "0";
  const termKeys = ["ctype", "maxfee", "minstip", "bondyrs", "maxbond", "maxleave", "nd"] as const;
  const active = [
    capMode && { label: "Only the ones your caps hide", param: "capped", href: here({ capped: null }) },
    f.q && { label: `Search: “${f.q}”`, param: "q", href: here({ q: null }) },
    f.reach && { label: reachLabel(f.reach, latest, PAST_YEARS, !f.prov), href: here({ reach: null, closed: null }) },
    // The seats filter, the round view's default too ("Has seats in any 2026 R2 list", as the sheet names it): × shows the
    // options with or without seats.
    lists.length > 0 && r.seats && { label: seatsWords(r.seats), param: "seats", href: here({ seats: roundView ? "all" : null }) },
    lists.length > 0 && !r.seats && f.seats && { label: `With or without ${round} seats`, param: "seats", href: here({ seats: null }) },
    f.closed && f.closed !== closedDefault && !f.reach && { label: f.closed === "1" ? "Closed before your rank: shown" : "Closed before your rank: hidden", href: here({ closed: null }) },
    f.prov && { label: `Without ${latestName} (provisional)`, param: "prov", href: here({ prov: null }) },
    f.sort && f.sort !== "label" && { label: `Sorted: ${sortLabel[f.sort]}`, param: "sort", href: here({ sort: null }) },
    // One chip per course (or specialty and degree), quota and state, her profile's for this visit: the × takes that one out.
    ...(profile.pairs?.length
      ? profile.pairs.map((c) => ({ label: pairLabel(c), param: "c", href: L.without("/decide/options", "c", c) }))
      : [
          ...profile.specialties.map((sp) => ({ label: meta.specialties.find((x) => x.code === sp)?.name ?? sp, param: "sp", href: L.without("/decide/options", "sp", sp) })),
          ...profile.degrees.map((d) => ({ label: d, param: "deg", href: L.without("/decide/options", "deg", d) })),
        ]),
    // NEET SS: her quotas are her question group, kept (another group's seats aren't hers to compare): no × for them.
    ...(perGroup(exam) ? [] : profile.quotas.map((q) => ({ label: quotaIn(E, q), param: "quota", href: L.without("/decide/options", "quota", q) }))),
    ...profile.states.map((s) => ({ label: s, param: "st", href: L.without("/decide/options", "st", s) })),
    // Her profile's caps, while the page's own fee / bond filter does not replace them.
    profile.maxFeeLakh != null && tp.maxfee == null && { label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, param: "maxfee", href: here({ fee: null }) },
    profile.maxBondYears != null && tp.bondyrs == null && { label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, param: "bondyrs", href: here({ bond: null }) },
    ...termChips(tp).map((c) => ({ label: c.label, param: c.key, href: c.value ? L.without("/decide/options", c.key, c.value) : here({ [c.key]: null }) })),
  ].filter((x) => !!x);
  const clearAll = here({ capped: null, q: null, reach: null, seats: roundView ? "all" : null, closed: null, prov: null, sort: null, ...(perGroup(exam) ? {} : { quota: null }), st: null, fee: null, bond: null, ...Object.fromEntries(termKeys.map((k) => [k, null])) });
  // Another exam (most of its MCC profiles give no fee figure): a cap never empties the list unsaid.
  const capped = "capped" in r ? (r.capped ?? 0) : 0;
  const caps = [profile.maxFeeLakh != null && tp.maxfee == null && termValueLabel.maxfee(profile.maxFeeLakh), profile.maxBondYears != null && tp.bondyrs == null && termValueLabel.bondyrs(profile.maxBondYears)].filter(Boolean).join(", ");
  const capWords = caps ? `your cap (${caps})` : "the fee, stipend, bond or type filters";
  // Exactly the ones the caps hide, each saying which cap (OptionRow.capNote): the caps stay as they are.
  const showCapped = here({ capped: "1", view: null, seats: null, closed: null, reach: null });
  const capNote = exam !== DEFAULT_EXAM && (capped > 0 || r.unknownTerms > 0) && (
    <p role="status" className="flex flex-wrap items-center gap-x-3 rounded-md border border-sun/40 bg-sun/10 px-3 py-2 text-sm">
      {capped > 0 && (capMode ? (
        <span>
          Showing the <span className="numeric font-semibold">{formatRank(capped)}</span> {capped === 1 ? "option" : "options"} in your profile hidden by {capWords}, with or without seats this round; each says which cap hides it.{" "}
          <Link href={here({ capped: null })} className={`${smallLink} text-sky`}>Back to your options</Link>
        </span>
      ) : (
        <span>
          <span className="numeric font-semibold">{formatRank(capped)}</span> {capped === 1 ? "option" : "options"} in your profile hidden by {capWords}.{" "}
          <Link href={showCapped} className={`${smallLink} text-sky`}>Show them</Link>
        </span>
      ))}
      {r.unknownTerms > 0 && (
        <span>
          <span className="numeric font-semibold">{formatRank(r.unknownTerms)}</span> more with no published figure for {capWords}.{" "}
          <Link href={here({ nd: "keep" })} className={`${smallLink} text-sky`}>Include not published</Link>
        </span>
      )}
    </p>
  );
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input"}`;
  const n = (x: number) => <span className="numeric font-semibold">{formatRank(x)}</span>;
  // What the round's seat lists are, behind the (i) of the summary (round view) or of the link to that view.
  const listsTip = lists.length > 0 && (
    <>
      From {by}&apos;s {round} {sp ? "seat position" : "lists:"}{" "}
      {!sp && lists.map((l, i) => (
        <Fragment key={l.key}>
          {i > 0 && ", "}
          {kindName(l.kind, exam).toLowerCase()}
          {l.publishedAt && <> (<span className="numeric">{fmtDay(l.publishedAt)}</span>)</>}
        </Fragment>
      ))}
      {sp ? <> (PDF in Sources below), counted in your quotas and seat categories ({seats}): {kindNote("clear", exam)}</> : <>, each its own list (PDFs in Sources below), counted in your quotas and seat categories ({seats}). A seat can be in two lists, so they are never added:{" "}
      {lists.map((l) => `${seatKindLabel[l.kind]}: ${seatKindNote[l.kind]}`).join(" ")}</>} &quot;—&quot; when a list has none; select a number to see those seats.
    </>
  );

  // The round view's other views: inline from md, in the summary's (i) on phones.
  const viewLinks = sum && (
    <>
      {r.seats ? (
        <Link href={here({ seats: "all" })} className={`${smallLink} text-sky`}>Also without {roundShort(lists[0].round, exam)} seats</Link>
      ) : (
        <Link href={here({ seats: null })} className={`${smallLink} text-sky`}>Only with {roundShort(lists[0].round, exam)} seats</Link>
      )}
      <Link href={otherView} className={`${smallLink} text-sky`}>Every option with past allotments (closed hidden)</Link>
    </>
  );

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead
        title="Options"
        about={
          <>
            Every institute and course in your profile{roundView && r.seats ? ` with ${round} seats` : ""}, labelled by how your rank compares with the closing ranks of {counted} on {seats} seats,
            the seat categories you can take{profile.quotas.length ? "" : `, in the quotas open to everyone (${E.quotas.map((q) => quotaIn(E, q)).join(", ")})`}. Within 10%: in a past round the closing rank was at
            least 90% of yours ({`${E.rankWord} `}<span className="numeric">{formatRank(Math.ceil(profile.rank * 0.9))}</span> or later) but before your rank.
            {" "}{STRAY_NOT_COUNTED}; <Link href={L.to("/decide/last-ranks")} className="text-sky underline">see Last ranks for them</Link>.
            {roundView && <> Never allotted before = {by} allotted nobody to that course and quota there in any result Seatora has ({resultsSpan(meta.years, exam)}), in any round or seat category, so there is no closing rank to compare.</>}
          </>
        }
      >
        Labelled by your rank against past closing ranks.
      </PageHead>
      {reached > 0 && (
        <YourPicture pic={pic} profile={profile} E={E} latest={latest} includeLatest={!f.prov} L={L} scope={roundView && r.seats ? ` with ${round} seats` : ""} closedHref={here({ reach: "closed-before", closed: "1" })} />
      )}
      {/* Which of her courses reach her rank (none of them: in What you can still do, below), and her list in a suggested order. */}
      {reached > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {(missed.length > 0 || hit.length > 1) && <p className="min-w-0 flex-1 basis-80 text-sm">{courseReach}</p>}
          {suggestButton}
        </div>
      )}

      {/* Phones: one line (the counts that matter, the rest and the view links behind its (i)); md up as it was. */}
      {sum && (
        <section aria-label={`${round} seats in your courses`} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <p className="inline-flex flex-wrap items-center gap-x-1">
            <span>{n(sum.options)} with {round} seats<span className="max-md:hidden">:</span></span>
            {!sp && <span className="max-md:hidden">{n(sum.clear)} clear,</span>}
            {!sp && <span className="max-md:hidden">{n(sum.virtualOnly)} virtual only{sum.newOnly > 0 && <>, {n(sum.newOnly)} only newly added</>},</span>}
            <span className="md:hidden">·</span>
            {/* "Never allotted before" (no past allotment), never "new": "newly added" is only MCC's newly added seat list. */}
            {sum.fresh > 0 ? <Link href={here({ reach: "new", seats: null, q: null })} className={`${smallLink} text-sky`}>{n(sum.fresh)} never allotted before</Link> : <span>all allotted before</span>}
            <InfoTip label={`${round} seats`}>
              {sp ? (
                <>{formatRank(sum.options)} {sum.options === 1 ? "option has" : "options have"} seats in {by}&apos;s {round} seat position, in your courses; </>
              ) : (
                <>
                  {formatRank(sum.options)} {sum.options === 1 ? "option has" : "options have"} {roundWords} seats in your courses: {formatRank(sum.clear)} in the clear vacancy list,{" "}
                  {formatRank(sum.virtualOnly)} virtual only (seats there fall vacant only if their holder upgrades or leaves){sum.newOnly > 0 && `, ${formatRank(sum.newOnly)} only newly added`};{" "}
                  {formatRank(sum.withNew)} with seats in {by}&apos;s newly added list;{" "}
                </>
              )}
              {sum.fresh > 0 ? `${formatRank(sum.fresh)} never allotted before (no past allotment)` : "none never allotted before (every one has a past allotment)"}. {listsTip}{" "}
              Sorted by label (reached, then within 10%, then no allotment in your categories, then closed before your rank, never allotted before last in a group of its own), then {round} {sp ? "seats" : "clear vacancy seats"},{" "}
              {exam === DEFAULT_EXAM ? <>then the deepest {HEAD} closing.</> : <>then, within a reached label, the tightest closing first (the most sought seat that still reached your rank); within any other label, the deepest {HEAD} closing.</>}
              <span className="mt-2 flex flex-col items-start md:hidden">{viewLinks}</span>
            </InfoTip>
          </p>
          <p className="flex flex-wrap gap-x-4 max-md:hidden">{viewLinks}</p>
        </section>
      )}
      {/* None reached her rank: say so first, with what she can still do (Home's panel), not a list of dead ends. */}
      {labelled > 0 && reached === 0 && (
        <>
          {/* The current results (her courses and filters), never "N options – good": none of them reached her rank. */}
          <p className="flex flex-wrap items-center gap-x-3 text-body">
            <span className="font-semibold">None of these reached {`${E.rankWord} `}{n(profile.rank)}: {n(0)} of {n(labelled)} options in a past round ({counted}).</span>
            {deepest && deepestAt && (
              <span>
                {sessions ? "In those sessions" : `In ${HEAD}`} the deepest any closed was {n(deepestAt.closing)} ({sessions ? `${yearName(exam, deepestYear)} ` : ""}{roundShort(deepestAt.round, exam)}, {deepestAt.category} seat) at{" "}
                <Link href={L.institute(deepest.college.slug)} className={smallLink}>{deepest.college.name}</Link>, {deepest.course.degree} {deepest.course.name}
                {deepestAt.closing < profile.rank && <>: {n(profile.rank - deepestAt.closing)} ranks before yours</>}.
              </span>
            )}
            {r.counts["closed-before"] > 0 && !f.reach && (
              // One tap either way; closed ones are never hidden without saying so.
              <Link href={here({ closed: r.showClosed ? "0" : "1" })} className={`${smallLink} text-sky`}>
                {r.showClosed ? `Hide the ${formatRank(r.counts["closed-before"])} closed before your rank` : `Show the ${formatRank(r.hiddenClosed)} closed before your rank`}
              </Link>
            )}
          </p>
          <StillCanDo L={L} exam={exam} rank={profile.rank} list={roundView ? lists[0] : undefined} fresh={sum?.fresh ?? 0} counts={r.counts} cap={capNote ? { href: showCapped, words: capWords, n: capped } : undefined} id="still-h" title="What you can still do" courses={courseReach} />
          <div>{suggestButton}</div>
        </>
      )}
      {!roundView && lists.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1 text-sm">
          <Link href={otherView} className={`${smallLink} text-sky`}>Show the {round} view</Link>
          <InfoTip label={`the ${round} view`}>
            Every option with {roundWords} seats in your courses, new ones included, closed ones shown, most clear vacancy seats first within a label. {listsTip}
          </InfoTip>
        </p>
      )}

      {/* The profile filters are URL params, so this visit can differ from the saved profile. The toolbar (pinned on phones): the search box, Filters (the rest, in a sheet) and the count. The form, its buttons and the sheet stay mounted; only the fields remount to show what was applied. */}
      <FilterForm action="/decide/options" role="search" aria-label="Filter options" className={toolbar}>
        {(["rank", "cat", "pwd", "fee", "bond", "ord"] as const).map((k) => keep.get(k) && <input key={k} type="hidden" name={k} value={keep.get(k)!} />)}
        {/* NEET SS: no Quota filter; her group's quotas ride along. */}
        {perGroup(exam) && keep.get("quota") && <input type="hidden" name="quota" value={keep.get("quota")!} />}
        {f.reach && <input type="hidden" name="reach" value={f.reach} />}
        {f.closed && <input type="hidden" name="closed" value={f.closed} />}
        {f.view && <input type="hidden" name="view" value={f.view} />}
        {f.details && <input type="hidden" name="details" value="1" />}
        <ViewField />
        <ToolbarSearch>
          <Fragment key={params.toString()}>
            <label className="min-w-0">
              <span className="sr-only">Search institute, state or course</span>
              <input type="search" name="q" defaultValue={f.q ?? ""} maxLength={100} placeholder="Search" className={control} />
            </label>
          </Fragment>
        </ToolbarSearch>
        <FiltersPanel count={active.length} clear={clearAll} total={r.total} saveDefaults>
          <Fragment key={params.toString()}>
            {/* Exact courses in her profile (pairs) replace course x degree, so they get one exact-course filter. */}
            {profile.pairs?.length ? (
              <FilterDropdown label="Course" name="c" options={pairChoices(meta.courses)} selected={profile.pairs} />
            ) : (
              <>
                <FilterDropdown label="Course" name="sp" search options={meta.specialties.map((s) => ({ value: s.code, label: s.name }))} selected={profile.specialties} />
                <FilterDropdown label="Degree" name="deg" options={meta.degrees.map((d) => ({ value: d, label: d }))} selected={profile.degrees} />
              </>
            )}
            {/* NEET SS: the quota is her question group (her profile's), never another group's. */}
            {!perGroup(exam) && <FilterDropdown label="Quota" name="quota" options={meta.quotas.map((q) => ({ value: q, label: quotaIn(E, q) }))} selected={profile.quotas} none="Open quotas" info={E.quotasNote} />}
            <FilterDropdown label="State" name="st" options={meta.states.map((s) => ({ value: s, label: s }))} selected={profile.states} none="All states" info={E.scopeNote} />
            {lists.length > 0 && (
              <Field label="Seats">
                <select name="seats" defaultValue={r.seats ?? "all"} className={control}>
                  <option value="all">With or without {round} seats</option>
                  <option value="any">{seatsWords("any")}</option>
                  {lists.map((l) => <option key={l.kind} value={l.kind}>{seatsWords(l.kind)}</option>)}
                </select>
              </Field>
            )}
            <Field label="Sort by">
              <select name="sort" defaultValue={f.sort ?? "label"} className={control}>
                {optionSorts.filter((s) => E.has.fees || (s !== "fee" && s !== "stipend")).map((s) => <option key={s} value={s}>{sortLabel[s]}</option>)}
              </select>
            </Field>
            <TermFilterControls f={tp} caps={profile} fees={E.has.fees} />
            {latest.provisional && (
              <span className="flex min-h-12 items-center gap-1 border-b border-border text-sm">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" name="prov" value="0" defaultChecked={!!f.prov} className="size-5 accent-sky" />
                  Without {latestName} (provisional)
                </label>
                <InfoTip label={`${latestName} (provisional)`}>Leaves {by}&apos;s provisional {latestName} result out of the labels.</InfoTip>
              </span>
            )}
          </Fragment>
        </FiltersPanel>
        <ToolbarCount total={r.total} noun="options" />
      </FilterForm>
      <ActiveFilters items={active} clear={clearAll} />
      {/* Another exam: what her fee / bond cap (or a term filter) hides is said up front, with the way back. */}
      {capNote}
      <UntypedNote n={untyped} noun={untyped === 1 ? "option" : "options"} href={here({ ctype: null })} />

      {/* One row that scrolls sideways (never wraps), the closed-before toggle its last chip. */}
      <nav aria-label="Filter by reach" className="chip-row flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] *:shrink-0 *:whitespace-nowrap">
        <Link href={here({ reach: null })} aria-current={!f.reach ? "true" : undefined} className={chip(!f.reach)}>
          All <span className="numeric font-semibold">{formatRank(all)}</span><span className="sr-only"> options</span>
        </Link>
        {reachOrder.filter((x) => r.counts[x] > 0).map((x) => (
          <Link key={x} href={here({ reach: x, closed: x === "closed-before" ? "1" : null })} aria-current={f.reach === x ? "true" : undefined} className={chip(f.reach === x)}>
            {reachLabel(x, latest, PAST_YEARS, !f.prov)} <span className="numeric font-semibold">{formatRank(r.counts[x])}</span><span className="sr-only"> options</span>
            {x === "reached-latest" && <Provisional when={latest.provisional && !f.prov} />}
          </Link>
        ))}
        {(r.hiddenClosed > 0 || (r.showClosed && !f.reach && r.counts["closed-before"] > 0)) && (
          <span className="inline-flex items-center gap-1 border-l border-border pl-2">
            {/* One link in both states, so React keeps the element and focus stays on it after the toggle. */}
            <Link href={here({ closed: r.hiddenClosed > 0 ? "1" : "0" })} className={`${chip(false)} border-dashed`}>
              {r.hiddenClosed > 0 ? <>Closed before your rank: {n(r.hiddenClosed)} hidden · Show</> : "Closed ones shown · Hide them"}
            </Link>
            <InfoTip label="closed before your rank">
              Options whose closing rank came before yours in every round of {counted}
              {r.hiddenProvisional > 0 && ` (${formatRank(r.hiddenProvisional)} of the hidden ones only in the provisional ${latestName})`}.
            </InfoTip>
          </span>
        )}
      </nav>
      {/* Stays mounted across filter changes (OptionsResults remounts), so the new count is announced. */}
      <p role="status" className="sr-only">{formatRank(r.total)} {r.total === 1 ? "option matches" : "options match"}</p>

      {r.total ? (
        <OptionsResults
          key={`${api}|${r.page}`}
          initial={r.rows.map(listRow)}
          page={r.page}
          pageSize={r.pageSize}
          total={r.total}
          query={api.toString()}
          caption={caption}
          firstPageHref={r.page > 1 ? here({}) : undefined}
          // /api/v1 (Show more, the CSV) serves NEET PG only: another exam pages by link and has no CSV yet.
          moreHref={exam === DEFAULT_EXAM ? undefined : here({ page: String(r.page + 1) })}
          notes={<SeatSource lists={lists} L={L} />}
          tools={exam === DEFAULT_EXAM && <CsvLink href={`/api/v1/options/export?${api}`} what={`these ${formatRank(r.total)} options`} total={r.total} />}
          latest={latest}
          pastYears={PAST_YEARS}
          includeLatest={!f.prov}
          seatLists={lists}
          view={view}
          details={!!f.details}
          detailsHref={here({ details: f.details ? null : "1", page: f.page > 1 ? String(f.page) : null })}
          // Label order: the options with no allotment on her seat categories (and those closed before her rank) under their own heading.
          grouping={!f.sort || f.sort === "label" ? { counts: r.counts } : null}
          historyMore={
            <>
              {`Closing = the highest ${E.rankName} allotted in that round on a seat of that category; here `}{seats} seats, the ones you can take. {latestText(latest)} is {latest.round === "R1" ? "that round alone" : "the deepest of those rounds"}. Labels
              count every round of {yearName(exam, PAST_YEARS[0])} and {yearName(exam, PAST_YEARS[1])}{(!f.prov || latest.round !== "R1") && `, and ${latestText(latest, !f.prov)}`}; Rounds by year shows every round of every year (R2 and R3 included), older years
              too, which the labels do not count; its bracketed numbers are allotments made that round in every category, not the seat matrix.
            </>
          }
        />
      ) : withoutSeats > 0 ? (
        <EmptyState title="No options match" description={`${formatRank(withoutSeats)} ${withoutSeats === 1 ? "matches" : "match"} without ${roundShort(lists[0].round, exam)} seats.`}>
          <Link href={here({ seats: "all" })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Show {withoutSeats === 1 ? "it" : "them"}</Link>
        </EmptyState>
      ) : r.hiddenClosed > 0 && !f.q && !f.reach ? (
        // Every option here closed before her rank and "hide closed" hides them: the toggle that brings them back, and her profile.
        <EmptyState
          title={`All ${formatRank(r.hiddenClosed)} closed before your rank, and they are hidden`}
          description="“Closed before your rank: hidden” is on. Show them, or add courses, quotas or states in your profile (Edit beside your rank)."
        >
          <span className="flex flex-wrap justify-center gap-x-6">
            <Link href={here({ closed: "1" })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Show the {formatRank(r.hiddenClosed)} closed ones</Link>
            <Link href={L.to("/decide", { editProfile: 1 })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Edit your profile</Link>
          </span>
        </EmptyState>
      ) : outside.length ? (
        // NEET SS: her courses are another question group's, so nothing here can be hers.
        <EmptyState
          title={`${outside.length === 1 ? "This course is" : "These courses are"} in another question group`}
          description={`${outside.map((o) => `${pairLabel(o.c.includes("~") ? o.c : (meta.specialties.find((x) => x.code === o.c)?.name ?? o.c))} is in the ${o.groups.join(" and the ")}`).join("; ")}; your profile is set to the ${mine.join(" and the ") || "no question group"}. A rank is within one question group, so pick that group's courses, or change your group.`}
        >
          <Link href={L.to("/decide", { editProfile: 1 })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Change your question group or courses</Link>
        </EmptyState>
      ) : (
        <EmptyState
          title="No options match"
          description={iniElsewhere(f.q, exam) ? `${iniElsewhere(f.q, exam)}, not MCC's ${E.label} counselling, so it is not in MCC's data.` : `${f.q ? `Nothing here matches “${f.q}”. ` : ""}Clear the search, the label and the Filters sheet's page filters, or add courses, quotas or states in your profile (Edit beside your rank).${exam !== DEFAULT_EXAM && capped + r.unknownTerms > 0 ? ` ${formatRank(capped + r.unknownTerms)} are hidden by ${capWords} (above).` : ""}`}
        >
          <span className="flex flex-wrap justify-center gap-x-6">
            <Link href={here({ q: null, reach: null, closed: "1", seats: roundView ? "all" : null, ...Object.fromEntries(termKeys.map((k) => [k, null])) })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Clear search and page filters</Link>
            <Link href={L.to("/decide", { editProfile: 1 })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Edit your profile</Link>
          </span>
        </EmptyState>
      )}
      {!r.total && <SeatSource lists={lists} L={L} />}

      {r.virtualOnly && r.virtualOnly.options > 0 && (
        <p className="text-sm text-muted-foreground">
          {n(r.virtualOnly.options)} more only in the {yearName(exam, r.virtualOnly.list.year)} {roundShort(r.virtualOnly.list.round, exam)} virtual vacancy list.{" "}
          <Link href={here({ seats: "virtual" })} className={`${smallLink} text-sky`}>Show options with virtual vacancy seats</Link>
        </p>
      )}
      {unlisted && <UnlistedSeats u={unlisted} exam={exam} profile href={L.to("/decide/seats", { view: "list", list: unlisted.list.key, nohist: "1" })} />}
      {r.noState > 0 && (
        <p className="text-sm text-muted-foreground">
          {n(r.noState)} more with {round} seats left out by the state filter: no state in Decide&apos;s data.
        </p>
      )}
      {r.unknownTerms > 0 && exam === DEFAULT_EXAM && (
        <p className="text-sm text-muted-foreground">
          {n(r.unknownTerms)} more left out: no published figure for a filtered fee, stipend, bond or leaving penalty.{" "}
          <Link href={here({ nd: "keep" })} className={`${smallLink} text-sky`}>Include them</Link>
        </p>
      )}
      <DataSource terms={termDocs(r.rows.map((x) => x.fees))} />
    </AppPage>
  );
}
