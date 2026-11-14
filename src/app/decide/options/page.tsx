import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { HISTORY_CAPTION, PageHead, Provisional, SetRankPrompt } from "@/features/decide/components/bits";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { FilterForm } from "@/features/decide/components/filter-form";
import { OptionsResults } from "@/features/decide/components/option-actions";
import { UnlistedSeats } from "@/features/decide/components/seats/seat-lists";
import { control, EmptyState, smallLink } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { eligibleCategories, reachLabel, reachOrder, reachWindow } from "@/features/decide/lib/reach";
import { BOND_YEAR_CHOICES, feeChoices, keepProfileParams, profileFromParams, profileToParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, LATEST_YEAR, listOptions, PAST_YEARS, unlistedSeats } from "@/features/decide/service";
import { openQuotas, openQuotasNote, roundLabel } from "@/features/decide/types";

export const metadata: Metadata = { title: "Options" };
const PAGE_SIZE = 25; // both the table and the phone cards are in the HTML: 25 rows keep the page light

/** Page filters (her profile filters are the profile params: sp, deg, quota, st, fee, bond). */
const filtersSchema = z.object({
  q: z.string().max(100).optional(),
  reach: z.enum(reachOrder).optional(),
  closed: z.literal("1").optional(),
  prov: z.literal("0").optional(),
  /** Only options with seats in the newest clear vacancy list (never added to the virtual vacancy list's). */
  seats: z.literal("1").optional(),
  page: pageValue.default(1),
});

export default async function OptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  if (!profile) return <AppPage><PageHead title="Options" /><SetRankPrompt path="/decide/options" /></AppPage>;

  const f = parseSearchParams(filtersSchema, params);
  const filters = { search: f.q, reach: f.reach ? [f.reach] : undefined, includeProvisional: !f.prov, showClosed: !!f.closed, hasSeats: !!f.seats };
  const [meta, r, unlisted] = await Promise.all([getMeta(), listOptions(profile, filters, { page: f.page, pageSize: PAGE_SIZE }), unlistedSeats(profile)]);
  const L = decideLinks(params);
  const here = (changes: Record<string, string | null>) => L.with("/decide/options", { page: null, ...changes });
  // The All chip counts what it lists: closed-before options only while they are shown.
  const all = reachOrder.reduce((s, x) => s + r.counts[x], 0) - (f.closed ? 0 : r.counts["closed-before"]);
  const counted = reachWindow(LATEST_YEAR, PAST_YEARS, !f.prov);
  const seatList = r.seatList;
  const seats = eligibleCategories(profile.category, profile.pwd).join(" or ");
  // The latest year's R1 is the only round that can be provisional (MCC's provisional result); the toggle exists only then.
  const latestProvisional = !!meta.sources.find((s) => s.year === LATEST_YEAR && s.round === "R1")?.provisional;
  const keep = keepProfileParams(params);
  // Same profile and filters for /api/v1/options, where "Show more" reads the next pages.
  const api = profileToParams(profile);
  for (const [k, v] of [["q", f.q], ["reach", f.reach], ["showClosed", f.closed], ["prov", f.prov], ["hasSeats", f.seats]] as const) if (v) api.set(k, v);
  const caption = `Options for AIR ${formatRank(profile.rank)} (${profile.category}${profile.pwd ? " PwD" : ""}), closing ranks on ${seats} seats`;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input"}`;

  return (
    <AppPage className="grid grid-cols-1 gap-5">
      <PageHead title="Options">
        Every institute and course in your profile, labelled by how your rank compares with the closing ranks of {counted} on {seats} seats, the seat
        categories you can take{profile.quotas.length ? "" : `, in the quotas open to everyone (${openQuotas.join(", ")})`}.
      </PageHead>

      {/* The profile filters are URL params, so this visit can differ from the saved profile. The form and Apply stay mounted (focus stays on Apply); only the fields remount to show what was applied. */}
      <FilterForm action="/decide/options" scroll={false} role="search" aria-label="Filter options" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        {(["rank", "cat", "pwd"] as const).map((k) => keep.get(k) && <input key={k} type="hidden" name={k} value={keep.get(k)!} />)}
        {f.reach && <input type="hidden" name="reach" value={f.reach} />}
        {f.closed && <input type="hidden" name="closed" value="1" />}
        <Fragment key={params.toString()}>
          <label className="min-w-56 flex-1">
            <span className="sr-only">Search institute, state or course</span>
            <input type="search" name="q" defaultValue={f.q ?? ""} maxLength={100} placeholder="Search institute, state or course" className={control} />
          </label>
          <FilterDropdown label="Course" name="sp" options={meta.specialties.map((s) => ({ value: s.code, label: s.name }))} selected={profile.specialties} />
          <FilterDropdown label="Degree" name="deg" options={meta.degrees.map((d) => ({ value: d, label: d }))} selected={profile.degrees} />
          <FilterDropdown label="Quota" name="quota" options={meta.quotas.map((q) => ({ value: q, label: q }))} selected={profile.quotas} none="Open quotas" noneNote={openQuotasNote} />
          <FilterDropdown label="State" name="st" options={meta.states.map((s) => ({ value: s, label: s }))} selected={profile.states} />
          <label className="w-44">
            <span className="sr-only">Maximum fee per year</span>
            <select name="fee" defaultValue={profile.maxFeeLakh ?? ""} className={control}>
              <option value="">Any fee</option>
              {feeChoices(profile.maxFeeLakh).map((l) => <option key={l} value={l}>Fee up to ₹{l} L</option>)}
            </select>
          </label>
          <label className="w-44">
            <span className="sr-only">Maximum service bond</span>
            <select name="bond" defaultValue={profile.maxBondYears ?? ""} className={control}>
              <option value="">Any bond</option>
              {BOND_YEAR_CHOICES.map((y) => <option key={y} value={y}>{y === 0 ? "No bond" : `Bond up to ${y} ${y === 1 ? "yr" : "yrs"}`}</option>)}
            </select>
          </label>
          {seatList && (
            <label className="inline-flex min-h-11 items-center gap-2 px-1 text-sm">
              <input type="checkbox" name="seats" value="1" defaultChecked={!!f.seats} className="size-4 accent-sky" />
              Has {roundLabel[seatList.round]} clear vacancy seats ({seatList.year})
            </label>
          )}
          {latestProvisional && (
            <label className="inline-flex min-h-11 items-center gap-2 px-1 text-sm">
              <input type="checkbox" name="prov" value="0" defaultChecked={!!f.prov} className="size-4 accent-sky" />
              Leave out {LATEST_YEAR} R1 (provisional) from the labels
            </label>
          )}
        </Fragment>
        <Button type="submit">Apply</Button>
      </FilterForm>

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
      {(r.hiddenClosed > 0 || (f.closed && !f.reach)) && (
        <p className="text-sm text-muted-foreground">
          {r.hiddenClosed > 0 ? (
            <>
              <span className="numeric">{formatRank(r.hiddenClosed)}</span> that closed before your rank in every round of {counted} are hidden
              {r.hiddenProvisional > 0 && <> (<span className="numeric">{formatRank(r.hiddenProvisional)}</span> of them only in the provisional {LATEST_YEAR} R1)</>}.{" "}
              <Link href={here({ closed: "1" })} className={`${smallLink} text-sky`}>Show them</Link>
            </>
          ) : (
            <>Options that closed before your rank are included. <Link href={here({ closed: null })} className={`${smallLink} text-sky`}>Hide them</Link></>
          )}
        </p>
      )}

      {r.virtualOnly && r.virtualOnly.options > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="numeric">{formatRank(r.virtualOnly.options)}</span> more {r.virtualOnly.options === 1 ? "option has" : "options have"} seats only in the{" "}
          {r.virtualOnly.list.year} {roundLabel[r.virtualOnly.list.round]} virtual vacancy list (seats that open if their holder upgrades or leaves), so this filter hides{" "}
          {r.virtualOnly.options === 1 ? "it" : "them"}.{" "}
          <Link href={L.seats({ list: r.virtualOnly.list.key })} className={`${smallLink} text-sky`}>See the virtual vacancy list</Link>
        </p>
      )}
      {unlisted && <UnlistedSeats u={unlisted} profile href={L.to("/decide/seats", { list: unlisted.list.key, nohist: "1" })} />}
      {/* Stays mounted across filter changes (OptionsResults remounts), so the new count is announced. */}
      <p role="status" className="sr-only">{formatRank(r.total)} {r.total === 1 ? "option matches" : "options match"}</p>

      {r.total ? (
        <OptionsResults
          key={`${api}|${r.page}`}
          initial={r.rows}
          page={r.page}
          pageSize={r.pageSize}
          total={r.total}
          query={api.toString()}
          caption={caption}
          firstPageHref={r.page > 1 ? here({}) : undefined}
          latestYear={LATEST_YEAR}
          pastYears={PAST_YEARS}
          includeLatest={!f.prov}
          seatList={seatList}
        />
      ) : (
        <EmptyState
          title="No options match"
          description="Nothing in your profile matches this search and label. Clear them, or widen the course, quota, state, fee or bond filters above."
          href={here({ q: null, reach: null, closed: "1", seats: null })}
          action="Clear search, seats and labels"
        />
      )}

      <div className="grid gap-2 text-xs text-muted-foreground">
        <p>{HISTORY_CAPTION}</p>
        <p>
          Closing = the highest All India Rank allotted in that round on a seat of that category; here {seats} seats, the ones you can take. {LATEST_YEAR} R1 is
          that round alone. Bracketed numbers are allotments made that round in every category, not the seat matrix.
        </p>
        <p>
          Labels count every round of {PAST_YEARS[0]} and {PAST_YEARS[1]}{!f.prov && `, and ${LATEST_YEAR} R1`}; older years show under Rounds by year but are not counted.
          {seatList && <> {roundLabel[seatList.round]} seats: in the {seatList.year} {roundLabel[seatList.round]} clear vacancy list, this option&apos;s quota and your seat categories ({seats}); &quot;—&quot; when the list has none. Select a number to see those seats.</>}
        </p>
        <p>
          Within 10%: in a past round the closing rank was at least 90% of yours (AIR <span className="numeric">{formatRank(Math.ceil(profile.rank * 0.9))}</span> or
          later) but before your rank. Options with no fee or bond listed stay in when you set a fee or bond limit.
        </p>
        <DataSource terms={r.rows.flatMap((x) => [x.terms.fee?.source, x.terms.bond?.source])} />
        <SeatSource list={seatList} L={L} />
      </div>
    </AppPage>
  );
}
