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
import { fmtDay, seatKindNote, UnlistedSeats } from "@/features/decide/components/seats/seat-lists";
import { StillCanDo } from "@/features/decide/components/still-can-do";
import { GroupPrompt } from "@/features/decide/components/dashboard-parts";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { ActiveFilters, control, EmptyState, Field, smallLink, toolbar } from "@/features/decide/components/ui";
import { iniCetIn, iniWord } from "@/features/decide/lib/college-aliases";
import { decideLinks } from "@/features/decide/lib/links";
import { roundName } from "@/features/decide/lib/round-status";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { eligibleCategories, latestText, reachLabel, reachOrder, reachWindow, resultsSpan } from "@/features/decide/lib/reach";
import { readTermFilters, termChips, termValueLabel } from "@/features/decide/lib/term-filters";
import { keepProfileParams, pairChoices, profileFromParams, profileToParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, listOptions, optionsView, unlistedSeats } from "@/features/decide/service";
import { optionSorts, optionsViews, roundLabel, seatKindLabel, seatKinds, type OptionSort, type SeatKind } from "@/features/decide/types";
import { activeExam } from "@/features/exams/active";
import { DEFAULT_EXAM, exams, headYearIn, latestOf, perGroup } from "@/features/exams/registry";
import { quotaIn } from "@/features/exams/exam";

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
  page: pageValue.default(1),
});
const sortLabels = (last: number): Record<OptionSort, string> => ({
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
  const E = exams[exam];
  // NEET SS: a rank is within one question group, so nothing is labelled until she picks hers.
  if (perGroup(exam) && !profile.quotas.length) return <AppPage><PageHead title="Options" /><GroupPrompt /></AppPage>;
  const PAST_YEARS = E.pastYears;

  const f = parseSearchParams(filtersSchema, params);
  // Term filters (college type, fee, stipend, bond, leaving): an absent maxfee / bondyrs is her profile's cap.
  const { params: tp, filters: terms } = readTermFilters(params, profile);
  const hasSeats = f.seats === "1" ? "clear" : f.seats === "all" ? false : f.seats;
  const filters = { search: f.q, reach: f.reach ? [f.reach] : undefined, includeProvisional: !f.prov, showClosed: f.closed ? f.closed === "1" : undefined, hasSeats, view: f.view, terms, sort: f.sort };
  const [meta, r, view] = await Promise.all([getMeta(exam), listOptions(profile, filters, { page: f.page, pageSize: PAGE_SIZE }, exam), chosenView(params, "options")]);
  // The sorts' year: the latest complete one (NEET PG: its later past year, as before).
  const HEAD = headYearIn(exam, meta.sources);
  const sortLabel = sortLabels(HEAD);
  const lists = r.seatLists;
  const roundView = r.view === "round";
  // The round view lists the seats with no past allotment as rows; the other view names them and links Seats.
  const unlisted = roundView ? null : await unlistedSeats(profile, r.seats === "virtual" || r.seats === "new" ? r.seats : "clear", exam);
  // Nothing with the round's seats: how many match without that filter (the empty state offers them).
  const withoutSeats = !r.total && r.seats ? (await listOptions(profile, { ...filters, hasSeats: false }, { page: 1, pageSize: 1 }, exam)).total : 0;
  const L = decideLinks(params);
  const here = (changes: Record<string, string | null>) => L.with("/decide/options", { page: null, ...changes });
  // The All chip counts what it lists: closed-before options only while they are shown.
  const all = reachOrder.reduce((s, x) => s + r.counts[x], 0) - (r.showClosed ? 0 : r.counts["closed-before"]);
  // The latest year's newest round (lib/reach.ts latestRound): the only one that can be provisional (MCC's provisional
  // result); the toggle exists only then.
  const latest = latestOf(meta.sources, exam);
  const latestName = `${latest.year} ${roundLabel[latest.round]}`;
  const counted = reachWindow(latest, PAST_YEARS, !f.prov);
  const round = lists[0] && `${lists[0].year} ${roundLabel[lists[0].round]}`;
  const roundWords = lists[0] && roundName[lists[0].round];
  // Switching views drops the filters whose default differs by view (seats, closed), so each view opens as itself, and
  // the "new" label, which only the round view has.
  const other = roundView ? "all" : "round";
  const otherView = here({ view: optionsView(undefined, lists, meta.sources) === other ? null : other, seats: null, closed: null, ...(f.reach === "new" ? { reach: null } : {}) });
  const sum = r.summary;
  // Every option labelled (closed-before ones too, shown or not), and those that reached her rank in R1 to R3 of a counted year.
  const labelled = reachOrder.reduce((s, x) => s + r.counts[x], 0);
  const reached = r.counts["reached-latest"] + r.counts["reached-both"] + r.counts["reached-one"];
  const seats = eligibleCategories(profile.category, profile.pwd).join(" or ");
  const keep = keepProfileParams(params);
  // Same profile and filters for /api/v1/options, where "Show more" reads the next pages (and the CSV).
  const api = profileToParams(profile);
  for (const [k, v] of [["q", f.q], ["reach", f.reach], ["prov", f.prov], ["view", r.view], ["showClosed", r.showClosed ? "1" : "0"], ["hasSeats", r.seats ?? "all"], ["sort", f.sort]] as const) if (v) api.set(k, v);
  for (const [k, v] of Object.entries(tp)) if (v != null) api.set(k, Array.isArray(v) ? v.join(",") : String(v));
  const caption = `Options for ${E.rankWord} ${formatRank(profile.rank)} (${profile.category}${profile.pwd ? " PwD" : ""}), closing ranks on ${seats} seats${lists.length ? `; ${round} seats per list (${lists.map((l) => l.kind).join(", ")}), never added` : ""}`;
  // Chips for what narrows this list beyond her courses: each removes one filter, Clear all removes them all.
  const pairLabel = (c: string) => pairChoices(meta.courses).find((x) => x.value === c)?.label ?? c.replace("~", " ");
  const seatsWords = (s: SeatKind | "any") => (s === "any" ? `Has seats in a ${round} list` : `Has ${round} ${seatKindLabel[s].toLowerCase()}${s === "new" ? "" : " seats"}`);
  const closedDefault = roundView ? "1" : "0";
  const termKeys = ["ctype", "maxfee", "minstip", "bondyrs", "maxbond", "maxleave", "nd"] as const;
  const active = [
    f.q && { label: `Search: “${f.q}”`, param: "q", href: here({ q: null }) },
    f.reach && { label: reachLabel(f.reach, latest, PAST_YEARS, !f.prov), href: here({ reach: null, closed: null }) },
    // The seats filter, the round view's default too ("Only with R2 seats"): × shows the options with or without seats.
    lists.length > 0 && r.seats && { label: r.seats === "any" ? `Only with ${roundLabel[lists[0].round]} seats` : seatsWords(r.seats), param: "seats", href: here({ seats: roundView ? "all" : null }) },
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
  const clearAll = here({ q: null, reach: null, seats: roundView ? "all" : null, closed: null, prov: null, sort: null, ...(perGroup(exam) ? {} : { quota: null }), st: null, fee: null, bond: null, ...Object.fromEntries(termKeys.map((k) => [k, null])) });
  // Another exam (most of its MCC profiles give no fee figure): a cap never empties the list unsaid.
  const capped = "capped" in r ? (r.capped ?? 0) : 0;
  const caps = [profile.maxFeeLakh != null && tp.maxfee == null && termValueLabel.maxfee(profile.maxFeeLakh), profile.maxBondYears != null && tp.bondyrs == null && termValueLabel.bondyrs(profile.maxBondYears)].filter(Boolean).join(", ");
  const capWords = caps ? `your cap (${caps})` : "the fee, stipend, bond or type filters";
  const capNote = exam !== DEFAULT_EXAM && (capped > 0 || r.unknownTerms > 0) && (
    <p role="status" className="flex flex-wrap items-center gap-x-3 rounded-md border border-sun/40 bg-sun/10 px-3 py-2 text-sm">
      {capped > 0 && (
        <span>
          <span className="numeric font-semibold">{formatRank(capped)}</span> {capped === 1 ? "option" : "options"} in your profile hidden by {capWords}.{" "}
          <Link href={here({ fee: null, bond: null, maxfee: "any", bondyrs: "any", ctype: null, minstip: null, maxbond: null, maxleave: null })} className={`${smallLink} text-sky`}>Show them</Link>
        </span>
      )}
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
      From MCC&apos;s {round} lists:{" "}
      {lists.map((l, i) => (
        <Fragment key={l.key}>
          {i > 0 && ", "}
          {seatKindLabel[l.kind].toLowerCase()}
          {l.publishedAt && <> (<span className="numeric">{fmtDay(l.publishedAt)}</span>)</>}
        </Fragment>
      ))}
      , each its own list (PDFs in Sources below), counted in your quotas and seat categories ({seats}). A seat can be in two lists, so they are never added:{" "}
      {lists.map((l) => `${seatKindLabel[l.kind]}: ${seatKindNote[l.kind]}`).join(" ")} &quot;—&quot; when a list has none; select a number to see those seats.
    </>
  );

  // The round view's other views: inline from md, in the summary's (i) on phones.
  const viewLinks = sum && (
    <>
      {r.seats ? (
        <Link href={here({ seats: "all" })} className={`${smallLink} text-sky`}>Also without {roundLabel[lists[0].round]} seats</Link>
      ) : (
        <Link href={here({ seats: null })} className={`${smallLink} text-sky`}>Only with {roundLabel[lists[0].round]} seats</Link>
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
            {roundView && <> Never allotted before = MCC allotted nobody to that course and quota there in any result Seatora has ({resultsSpan(meta.years)}), in any round or seat category, so there is no closing rank to compare.</>}
          </>
        }
      >
        Labelled by your rank against past closing ranks.
      </PageHead>

      {/* Phones: one line (the counts that matter, the rest and the view links behind its (i)); md up as it was. */}
      {sum && (
        <section aria-label={`${round} seats in your courses`} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <p className="inline-flex flex-wrap items-center gap-x-1">
            <span>{n(sum.options)} with {round} seats<span className="max-md:hidden">:</span></span>
            <span className="max-md:hidden">{n(sum.clear)} clear,</span>
            <span className="max-md:hidden">{n(sum.virtualOnly)} virtual only{sum.newOnly > 0 && <>, {n(sum.newOnly)} only newly added</>},</span>
            <span className="md:hidden">·</span>
            {/* "Never allotted before" (no past allotment), never "new": "newly added" is only MCC's newly added seat list. */}
            {sum.fresh > 0 ? <Link href={here({ reach: "new", seats: null, q: null })} className={`${smallLink} text-sky`}>{n(sum.fresh)} never allotted before</Link> : <span>all allotted before</span>}
            <InfoTip label={`${round} seats`}>
              {formatRank(sum.options)} {sum.options === 1 ? "option has" : "options have"} {roundWords} seats in your courses: {formatRank(sum.clear)} in the clear vacancy list,{" "}
              {formatRank(sum.virtualOnly)} virtual only (seats there fall vacant only if their holder upgrades or leaves){sum.newOnly > 0 && `, ${formatRank(sum.newOnly)} only newly added`};{" "}
              {formatRank(sum.withNew)} with seats in MCC&apos;s newly added list; {sum.fresh > 0 ? `${formatRank(sum.fresh)} never allotted before (no past allotment)` : "none never allotted before (every one has a past allotment)"}. {listsTip}{" "}
              Sorted by label (reached, then within 10%, then never allotted before and no allotment in your categories, closed before your rank last), then {round} clear vacancy seats, then the deepest{" "}
              {HEAD} closing.
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
            {r.counts["closed-before"] > 0 && !f.reach && (
              // One tap either way; closed ones are never hidden without saying so.
              <Link href={here({ closed: r.showClosed ? "0" : "1" })} className={`${smallLink} text-sky`}>
                {r.showClosed ? `Hide the ${formatRank(r.counts["closed-before"])} closed before your rank` : `Show the ${formatRank(r.hiddenClosed)} closed before your rank`}
              </Link>
            )}
          </p>
          <StillCanDo L={L} exam={exam} rank={profile.rank} list={roundView ? lists[0] : undefined} fresh={sum?.fresh ?? 0} counts={r.counts} id="still-h" title="What you can still do" />
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
        {(["rank", "cat", "pwd", "fee", "bond"] as const).map((k) => keep.get(k) && <input key={k} type="hidden" name={k} value={keep.get(k)!} />)}
        {/* NEET SS: no Quota filter; her group's quotas ride along. */}
        {perGroup(exam) && keep.get("quota") && <input type="hidden" name="quota" value={keep.get("quota")!} />}
        {f.reach && <input type="hidden" name="reach" value={f.reach} />}
        {f.closed && <input type="hidden" name="closed" value={f.closed} />}
        {f.view && <input type="hidden" name="view" value={f.view} />}
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
            {E.has.fees && <TermFilterControls f={tp} caps={profile} />}
            {latest.provisional && (
              <span className="flex min-h-12 items-center gap-1 border-b border-border text-sm">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" name="prov" value="0" defaultChecked={!!f.prov} className="size-5 accent-sky" />
                  Without {latestName} (provisional)
                </label>
                <InfoTip label={`${latestName} (provisional)`}>Leaves MCC&apos;s provisional {latestName} result out of the labels.</InfoTip>
              </span>
            )}
          </Fragment>
        </FiltersPanel>
        <ToolbarCount total={r.total} noun="options" />
      </FilterForm>
      <ActiveFilters items={active} clear={clearAll} />
      {/* Another exam: what her fee / bond cap (or a term filter) hides is said up front, with the way back. */}
      {capNote}

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
          historyMore={
            <>
              {`Closing = the highest ${E.rankName} allotted in that round on a seat of that category; here `}{seats} seats, the ones you can take. {latestText(latest)} is {latest.round === "R1" ? "that round alone" : "the deepest of those rounds"}. Labels
              count every round of {PAST_YEARS[0]} and {PAST_YEARS[1]}{(!f.prov || latest.round !== "R1") && `, and ${latestText(latest, !f.prov)}`}; Rounds by year shows every round of every year (R2 and R3 included), older years
              too, which the labels do not count; its bracketed numbers are allotments made that round in every category, not the seat matrix.
            </>
          }
        />
      ) : withoutSeats > 0 ? (
        <EmptyState title="No options match" description={`${formatRank(withoutSeats)} ${withoutSeats === 1 ? "matches" : "match"} without ${roundLabel[lists[0].round]} seats.`}>
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
      ) : (
        <EmptyState
          title="No options match"
          description={iniCetIn(f.q) ? `${iniCetIn(f.q)} admits through ${iniWord(exam)}, not MCC's ${E.label} counselling, so it is not in MCC's data.` : `${f.q ? `Nothing here matches “${f.q}”. ` : ""}Clear the search, the label and the Filters sheet's page filters, or add courses, quotas or states in your profile (Edit beside your rank).${exam !== DEFAULT_EXAM && capped + r.unknownTerms > 0 ? ` ${formatRank(capped + r.unknownTerms)} are hidden by ${capWords} (above).` : ""}`}
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
          {n(r.virtualOnly.options)} more only in the {r.virtualOnly.list.year} {roundLabel[r.virtualOnly.list.round]} virtual vacancy list.{" "}
          <Link href={here({ seats: "virtual" })} className={`${smallLink} text-sky`}>Show options with virtual vacancy seats</Link>
        </p>
      )}
      {unlisted && <UnlistedSeats u={unlisted} profile href={L.to("/decide/seats", { view: "list", list: unlisted.list.key, nohist: "1" })} />}
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
