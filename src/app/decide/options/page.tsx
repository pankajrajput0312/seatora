import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead, Provisional, SetRankPrompt } from "@/features/decide/components/bits";
import { CsvLink } from "@/features/decide/components/csv-link";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { termDocs } from "@/features/decide/components/fees";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { FilterForm } from "@/features/decide/components/filter-form";
import { InfoTip } from "@/features/decide/components/info-tip";
import { OptionsResults } from "@/features/decide/components/option-actions";
import { ViewField } from "@/features/decide/components/view-toggle";
import { listRow } from "@/features/decide/components/options-view";
import { fmtDay, seatKindNote, UnlistedSeats } from "@/features/decide/components/seats/seat-lists";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { ActiveFilters, control, EmptyState, MoreFilters, smallLink } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { roundName } from "@/features/decide/lib/round-status";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { eligibleCategories, reachLabel, reachOrder, reachWindow, resultsSpan } from "@/features/decide/lib/reach";
import { readTermFilters, termChips, termMoreOpen, termValueLabel } from "@/features/decide/lib/term-filters";
import { keepProfileParams, pairChoices, profileFromParams, profileToParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, LATEST_YEAR, listOptions, optionsView, PAST_YEARS, unlistedSeats } from "@/features/decide/service";
import { openQuotas, openQuotasNote, optionsViews, roundLabel, seatKindLabel, seatKinds, type SeatKind } from "@/features/decide/types";

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
  page: pageValue.default(1),
});

export default async function OptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  if (!profile) return <AppPage><PageHead title="Options" /><SetRankPrompt path="/decide/options" /></AppPage>;

  const f = parseSearchParams(filtersSchema, params);
  // Term filters (college type, fee, stipend, bond, leaving): an absent maxfee / bondyrs is her profile's cap.
  const { params: tp, filters: terms } = readTermFilters(params, profile);
  const hasSeats = f.seats === "1" ? "clear" : f.seats === "all" ? false : f.seats;
  const filters = { search: f.q, reach: f.reach ? [f.reach] : undefined, includeProvisional: !f.prov, showClosed: f.closed ? f.closed === "1" : undefined, hasSeats, view: f.view, terms };
  const [meta, r] = await Promise.all([getMeta(), listOptions(profile, filters, { page: f.page, pageSize: PAGE_SIZE })]);
  const lists = r.seatLists;
  const roundView = r.view === "round";
  // The round view lists the seats with no past allotment as rows; the other view names them and links Seats.
  const unlisted = roundView ? null : await unlistedSeats(profile, r.seats === "virtual" || r.seats === "new" ? r.seats : "clear");
  const L = decideLinks(params);
  const here = (changes: Record<string, string | null>) => L.with("/decide/options", { page: null, ...changes });
  // The All chip counts what it lists: closed-before options only while they are shown.
  const all = reachOrder.reduce((s, x) => s + r.counts[x], 0) - (r.showClosed ? 0 : r.counts["closed-before"]);
  const counted = reachWindow(LATEST_YEAR, PAST_YEARS, !f.prov);
  const round = lists[0] && `${lists[0].year} ${roundLabel[lists[0].round]}`;
  const roundWords = lists[0] && roundName[lists[0].round];
  // Switching views drops the filters whose default differs by view (seats, closed), so each view opens as itself, and
  // the "new" label, which only the round view has.
  const other = roundView ? "all" : "round";
  const otherView = here({ view: optionsView(undefined, lists, meta.sources) === other ? null : other, seats: null, closed: null, ...(f.reach === "new" ? { reach: null } : {}) });
  const sum = r.summary;
  const seats = eligibleCategories(profile.category, profile.pwd).join(" or ");
  // The latest year's R1 is the only round that can be provisional (MCC's provisional result); the toggle exists only then.
  const latestProvisional = !!meta.sources.find((s) => s.year === LATEST_YEAR && s.round === "R1")?.provisional;
  const keep = keepProfileParams(params);
  // Same profile and filters for /api/v1/options, where "Show more" reads the next pages (and the CSV).
  const api = profileToParams(profile);
  for (const [k, v] of [["q", f.q], ["reach", f.reach], ["prov", f.prov], ["view", r.view], ["showClosed", r.showClosed ? "1" : "0"], ["hasSeats", r.seats ?? "all"]] as const) if (v) api.set(k, v);
  for (const [k, v] of Object.entries(tp)) if (v != null) api.set(k, Array.isArray(v) ? v.join(",") : String(v));
  const caption = `Options for AIR ${formatRank(profile.rank)} (${profile.category}${profile.pwd ? " PwD" : ""}), closing ranks on ${seats} seats${lists.length ? `; ${round} seats per list (${lists.map((l) => l.kind).join(", ")}), never added` : ""}`;
  // Chips for what narrows this list beyond her courses: each removes one filter, Clear all removes them all.
  const seatsWords = (s: SeatKind | "any") => (s === "any" ? `Has seats in a ${round} list` : `Has ${round} ${seatKindLabel[s].toLowerCase()}${s === "new" ? "" : " seats"}`);
  const closedDefault = roundView ? "1" : "0";
  const termKeys = ["ctype", "maxfee", "minstip", "bondyrs", "maxbond", "maxleave", "nd"] as const;
  const active = [
    f.q && { label: `Search: “${f.q}”`, href: here({ q: null }) },
    f.reach && { label: reachLabel(f.reach, LATEST_YEAR, PAST_YEARS, !f.prov), href: here({ reach: null, closed: null }) },
    f.seats && lists.length > 0 && (r.seats ?? null) !== (roundView ? "any" : null) && { label: r.seats ? seatsWords(r.seats) : `With or without ${round} seats`, href: here({ seats: null }) },
    f.closed && f.closed !== closedDefault && !f.reach && { label: f.closed === "1" ? "Closed before your rank: shown" : "Closed before your rank: hidden", href: here({ closed: null }) },
    f.prov && { label: `Without ${LATEST_YEAR} R1 (provisional)`, href: here({ prov: null }) },
    profile.quotas.length > 0 && { label: `Quota: ${profile.quotas.length > 2 ? `${profile.quotas.length} selected` : profile.quotas.join(", ")}`, href: here({ quota: null }) },
    profile.states.length > 0 && { label: `State: ${profile.states.length > 2 ? `${profile.states.length} selected` : profile.states.join(", ")}`, href: here({ st: null }) },
    // Her profile's caps, while the page's own fee / bond filter does not replace them.
    profile.maxFeeLakh != null && tp.maxfee == null && { label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, href: here({ fee: null }) },
    profile.maxBondYears != null && tp.bondyrs == null && { label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, href: here({ bond: null }) },
    ...termChips(tp).map((c) => ({ label: c.label, href: here({ [c.key]: null }) })),
  ].filter((x) => !!x);
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
  const moreOpen = termMoreOpen(tp) || !!f.seats || !!f.prov;

  return (
    <AppPage className="grid grid-cols-1 gap-4">
      <PageHead
        title="Options"
        about={
          <>
            Every institute and course in your profile{roundView && r.seats ? ` with ${round} seats` : ""}, labelled by how your rank compares with the closing ranks of {counted} on {seats} seats,
            the seat categories you can take{profile.quotas.length ? "" : `, in the quotas open to everyone (${openQuotas.join(", ")})`}. Within 10%: in a past round the closing rank was at
            least 90% of yours (AIR <span className="numeric">{formatRank(Math.ceil(profile.rank * 0.9))}</span> or later) but before your rank.
            {roundView && <> New: no past allotment = MCC allotted nobody to that course and quota there in any result Seatora has ({resultsSpan(meta.years)}), in any round or seat category, so there is no closing rank to compare.</>}
          </>
        }
      >
        Labelled by your rank against past closing ranks.
      </PageHead>

      {sum && (
        <section aria-label={`${round} seats in your courses`} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <p className="inline-flex flex-wrap items-center gap-x-1">
            <span>{n(sum.options)} with {round} seats:</span>
            <span>{n(sum.clear)} clear,</span>
            <span>{n(sum.virtualOnly)} virtual only{sum.newOnly > 0 && <>, {n(sum.newOnly)} only newly added</>},</span>
            {sum.fresh > 0 ? <Link href={here({ reach: "new", seats: null, q: null })} aria-label={`${formatRank(sum.fresh)} new: no past allotment`} className="text-sky underline">{n(sum.fresh)} new<span className="sr-only">: no past allotment</span></Link> : <span>none new</span>}
            <InfoTip label={`${round} seats`}>
              {formatRank(sum.options)} {sum.options === 1 ? "option has" : "options have"} {roundWords} seats in your courses: {formatRank(sum.clear)} in the clear vacancy list,{" "}
              {formatRank(sum.virtualOnly)} virtual only (seats there fall vacant only if their holder upgrades or leaves){sum.newOnly > 0 && `, ${formatRank(sum.newOnly)} only newly added`};{" "}
              {formatRank(sum.withNew)} with newly added seats; {sum.fresh > 0 ? `${formatRank(sum.fresh)} new: no past allotment` : "none new (every one has a past allotment)"}. {listsTip}{" "}
              Sorted by label (reached, then within 10%, then new and no allotment in your categories, closed before your rank last), then {round} clear vacancy seats, then the deepest{" "}
              {PAST_YEARS[1]} closing.
            </InfoTip>
          </p>
          <p className="flex flex-wrap gap-x-4">
            {r.seats ? (
              <Link href={here({ seats: "all" })} className={`${smallLink} text-sky`}>Also without {roundLabel[lists[0].round]} seats</Link>
            ) : (
              <Link href={here({ seats: null })} className={`${smallLink} text-sky`}>Only with {roundLabel[lists[0].round]} seats</Link>
            )}
            <Link href={otherView} className={`${smallLink} text-sky`}>Every option with past allotments (closed hidden)</Link>
          </p>
        </section>
      )}
      {!roundView && lists.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1 text-sm">
          <Link href={otherView} className={`${smallLink} text-sky`}>Show the {round} view</Link>
          <InfoTip label={`the ${round} view`}>
            Every option with {roundWords} seats in your courses, new ones included, closed ones shown, most clear vacancy seats first within a label. {listsTip}
          </InfoTip>
        </p>
      )}

      {/* The profile filters are URL params, so this visit can differ from the saved profile. The form, Apply and the "Show all filters" box stay mounted (focus stays on Apply, her tick survives); only the fields remount to show what was applied. On phones the box folds the less-used fields (.more-filter), as on every filter bar. */}
      <FilterForm
        action="/decide/options"
        scroll={false}
        role="search"
        aria-label="Filter options"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3"
      >
        {(["rank", "cat", "pwd", "fee", "bond"] as const).map((k) => keep.get(k) && <input key={k} type="hidden" name={k} value={keep.get(k)!} />)}
        {f.reach && <input type="hidden" name="reach" value={f.reach} />}
        {f.closed && <input type="hidden" name="closed" value={f.closed} />}
        {f.view && <input type="hidden" name="view" value={f.view} />}
        <ViewField />
        <Fragment key={params.toString()}>
          <label className="min-w-56 flex-1">
            <span className="sr-only">Search institute, state or course</span>
            <input type="search" name="q" defaultValue={f.q ?? ""} maxLength={100} placeholder="Search" className={control} />
          </label>
          {/* Exact courses in her profile (pairs) replace course x degree, so they get one exact-course filter. */}
          {profile.pairs?.length ? (
            <FilterDropdown label="Course" name="c" options={pairChoices(meta.courses)} selected={profile.pairs} />
          ) : (
            <>
              <FilterDropdown label="Course" name="sp" options={meta.specialties.map((s) => ({ value: s.code, label: s.name }))} selected={profile.specialties} />
              <FilterDropdown label="Degree" name="deg" options={meta.degrees.map((d) => ({ value: d, label: d }))} selected={profile.degrees} />
            </>
          )}
          <FilterDropdown label="Quota" name="quota" options={meta.quotas.map((q) => ({ value: q, label: q }))} selected={profile.quotas} none="Open quotas" noneNote={openQuotasNote} />
          <FilterDropdown label="State" name="st" options={meta.states.map((s) => ({ value: s, label: s }))} selected={profile.states} />
          <TermFilterControls f={tp} caps={profile} />
          {lists.length > 0 && (
            <label className="more-filter w-64 max-w-full">
              <span className="sr-only">Seats in the {round} seat lists</span>
              <select name="seats" defaultValue={r.seats ?? "all"} className={control}>
                <option value="all">With or without {round} seats</option>
                <option value="any">{seatsWords("any")}</option>
                {lists.map((l) => <option key={l.kind} value={l.kind}>{seatsWords(l.kind)}</option>)}
              </select>
            </label>
          )}
          {latestProvisional && (
            <label className="more-filter inline-flex min-h-11 items-center gap-2 px-1 text-sm">
              <input type="checkbox" name="prov" value="0" defaultChecked={!!f.prov} className="size-5 accent-sky" />
              Leave out {LATEST_YEAR} R1 (provisional) from the labels
            </label>
          )}
        </Fragment>
        {/* Remounts only when a folded filter is newly set or cleared (e.g. "Include them"), so it opens to show it; otherwise her tick survives. */}
        <MoreFilters key={`more-${moreOpen}`} open={moreOpen} />
        <Button type="submit">Apply</Button>
      </FilterForm>
      <ActiveFilters
        items={active}
        clear={here({ q: null, reach: null, seats: null, closed: null, prov: null, quota: null, st: null, fee: null, bond: null, ...Object.fromEntries(termKeys.map((k) => [k, null])) })}
      />

      <nav aria-label="Filter by reach" className="flex flex-wrap gap-2">
        <Link href={here({ reach: null })} aria-current={!f.reach ? "true" : undefined} className={chip(!f.reach)}>
          All <span className="numeric font-semibold">{formatRank(all)}</span><span className="sr-only"> options</span>
        </Link>
        {reachOrder.filter((x) => r.counts[x] > 0).map((x) => (
          <Link key={x} href={here({ reach: x, closed: x === "closed-before" ? "1" : null })} aria-current={f.reach === x ? "true" : undefined} className={chip(f.reach === x)}>
            {reachLabel(x, LATEST_YEAR, PAST_YEARS, !f.prov)} <span className="numeric font-semibold">{formatRank(r.counts[x])}</span><span className="sr-only"> options</span>
            {x === "reached-latest" && <Provisional when={latestProvisional && !f.prov} />}
          </Link>
        ))}
      </nav>
      {(r.hiddenClosed > 0 || (r.showClosed && !f.reach && r.counts["closed-before"] > 0)) && (
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
          <span className="mr-1">{r.hiddenClosed > 0 ? <>{n(r.hiddenClosed)} closed before your rank hidden.</> : "Closed ones shown."}</span>
          {/* One link in both states, so React keeps the element and focus stays on it after the toggle. */}
          <Link href={here({ closed: r.hiddenClosed > 0 ? "1" : "0" })} className={`${smallLink} text-sky`}>{r.hiddenClosed > 0 ? "Show them" : "Hide them"}</Link>
          <InfoTip label="closed before your rank">
            Options whose closing rank came before yours in every round of {counted}
            {r.hiddenProvisional > 0 && ` (${formatRank(r.hiddenProvisional)} of the hidden ones only in the provisional ${LATEST_YEAR} R1)`}.
          </InfoTip>
        </p>
      )}

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
      {r.unknownTerms > 0 && (
        <p className="text-sm text-muted-foreground">
          {n(r.unknownTerms)} more left out: a filtered fee, stipend, bond or leaving figure is not declared.{" "}
          <Link href={here({ nd: "keep" })} className={`${smallLink} text-sky`}>Include them</Link>
        </p>
      )}
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
          tools={<CsvLink href={`/api/v1/options/export?${api}`} what={`these ${formatRank(r.total)} options`} total={r.total} />}
          latestYear={LATEST_YEAR}
          pastYears={PAST_YEARS}
          includeLatest={!f.prov}
          seatLists={lists}
          historyMore={
            <>
              Closing = the highest All India Rank allotted in that round on a seat of that category; here {seats} seats, the ones you can take. {LATEST_YEAR} R1 is that round alone. Labels
              count every round of {PAST_YEARS[0]} and {PAST_YEARS[1]}{!f.prov && `, and ${LATEST_YEAR} R1`}; Rounds by year shows every round of every year (R2 and R3 included), older years
              too, which the labels do not count; its bracketed numbers are allotments made that round in every category, not the seat matrix.
            </>
          }
        />
      ) : (
        <EmptyState
          title="No options match"
          description="Clear the search and page filters, or widen your courses, quotas or states above."
          href={here({ q: null, reach: null, closed: "1", seats: roundView ? "all" : null, ...Object.fromEntries(termKeys.map((k) => [k, null])) })}
          action="Clear search and page filters"
        />
      )}

      <div className="grid gap-1 text-xs text-muted-foreground">
        <DataSource terms={termDocs(r.rows.map((x) => x.fees))} />
        {lists.map((l) => <SeatSource key={l.key} list={l} L={L} />)}
      </div>
    </AppPage>
  );
}
