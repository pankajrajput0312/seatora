import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { Download, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CSV_MAX_ROWS } from "@/features/decide/api";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, HISTORY_CAPTION, PageHead } from "@/features/decide/components/bits";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { FilterForm } from "@/features/decide/components/filter-form";
import { courseName } from "@/features/decide/components/options-view";
import { MccLink } from "@/features/decide/components/pages/mcc-link";
import { PAST_ROUNDS, parseSeatsParams, seatCategories, seatSorts, seatsView, type SeatSort, type SeatsParams } from "@/features/decide/components/seats/find-seats";
import { listTitle, SeatListPicker, SeatTable, seatKindNote } from "@/features/decide/components/seats/seat-lists";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { control, EmptyState, Pager, rangeLabel, smallLink, tbl } from "@/features/decide/components/ui";
import { decideLinks, type DecideLinks } from "@/features/decide/lib/links";
import { reachWindow } from "@/features/decide/lib/reach";
import { keepProfileParams, pairChoices, profileFromParams, toURLSearchParams, type Profile } from "@/features/decide/profile";
import { allotmentTrends, getMeta, LATEST_YEAR, PAST_YEARS, YEARS } from "@/features/decide/service";
import { openQuotas, openQuotasNote, roundLabel, seatKindLabel, type SeatList } from "@/features/decide/types";

export const metadata: Metadata = { title: "Seats" };
const PAGE_SIZE = 50;
/** "clear vacancy seats", "newly added seats". */
const kindSeats = (l: SeatList) => `${seatKindLabel[l.kind].toLowerCase()}${l.kind === "new" ? "" : " seats"}`;
const sortLabels: Record<SeatSort, string> = { reach: "Reach: beyond your rank first", closing: "Deepest past closing first", seats: "Most seats first", college: "By institute", state: "By state" };

export default async function SeatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSeatsParams(params);

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Seats">
        MCC&apos;s seat lists for a round, as each PDF printed them: one list, or every list of the round side by side, with past closing ranks and
        terms per seat.{profile && " Filtered to the courses, quotas, states and seat categories in your profile."}
      </PageHead>
      <SubTabs label="Seats" current={f.tab} items={[{ key: "matrix", label: "Seat lists", href: L.to("/decide/seats", { tab: "matrix" }) }, { key: "trends", label: "Allotment trends", href: L.to("/decide/seats", { tab: "trends" }) }]} />
      {f.tab === "trends" ? <Trends profile={profile} page={f.page} L={L} /> : <SeatLists f={f} profile={profile} params={params} L={L} />}
    </AppPage>
  );
}

async function SeatLists({ f, profile, params, L }: { f: SeatsParams; profile: Profile | null; params: URLSearchParams; L: DecideLinks }) {
  const { all, meta, inst, course, list, mine, sort, r } = await seatsView(f, profile, PAGE_SIZE);
  const one = !!(inst || course || f.squota);
  if (!list || !r)
    return (
      <EmptyState icon={LayoutGrid} title="Seat lists not imported yet" description="No MCC seat list is in the data yet, so nothing is shown here. MCC publishes them on its PG counselling site.">
        <MccLink>Seat lists on the MCC site</MccLink>
      </EmptyState>
    );

  const compare = f.view === "compare";
  const noState = r.noState[list.key] ?? 0;
  const here = (changes: Record<string, string | null>) => L.with("/decide/seats", { tab: null, page: null, ...changes });
  const keep = keepProfileParams(params);
  const matching = r.seats[list.key] ?? 0;
  const title = listTitle(list);
  const round = `${list.year} ${roundLabel[list.round]}`;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input"}`;
  const caption = `${compare ? `Seats in every ${round} list side by side` : `Seats in the ${title} list`} (MCC PDF${compare ? "s" : ""}), ${sortLabels[sort].toLowerCase()}, page ${r.page}`;

  return (
    <>
      <SeatListPicker lists={all} current={list.key} href={(key) => here({ list: key })} />
      <nav aria-label="Seats view" className="flex flex-wrap gap-2">
        <Link href={here({ view: null })} aria-current={!compare ? "true" : undefined} className={chip(!compare)}>One list</Link>
        <Link href={here({ view: "compare" })} aria-current={compare ? "true" : undefined} className={chip(compare)}>Compare the {round} lists</Link>
      </nav>
      {compare ? (
        <p className="max-w-3xl text-sm text-muted-foreground">
          One row per institute, course, quota and seat category, with its seats in each {round} list.{" "}
          {r.lists.map((l) => <Fragment key={l.key}><span className="font-semibold text-foreground">{seatKindLabel[l.kind]}</span>: {seatKindNote[l.kind]}{" "}</Fragment>)}
          The lists overlap (a newly added seat is usually also a clear vacancy, and a virtual vacancy opens only if its holder moves), so the columns are never added together.
          {" "}The list picked above sets the round compared and the list that &quot;{`Most ${kindSeats(list)} first`}&quot; sorts by.
        </p>
      ) : (
        <p className="max-w-3xl text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{seatKindLabel[list.kind]}</span>: {seatKindNote[list.kind]} The three kinds of list overlap, so their seats are never added together.
        </p>
      )}

      {/* As on Options: the form and Apply stay mounted (focus stays on Apply); the fields remount to show what was applied. */}
      <FilterForm action="/decide/seats" scroll={false} role="search" aria-label="Filter seats" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        {(["rank", "cat", "pwd", "fee", "bond"] as const).map((k) => keep.get(k) && <input key={k} type="hidden" name={k} value={keep.get(k)!} />)}
        <input type="hidden" name="list" value={list.key} />
        {compare && <input type="hidden" name="view" value="compare" />}
        {f.nohist && <input type="hidden" name="nohist" value="1" />}
        {(["inst", "course", "squota"] as const).map((k) => f[k] && <input key={k} type="hidden" name={k} value={f[k]} />)}
        <Fragment key={params.toString()}>
          <label className="min-w-56 flex-1">
            <span className="sr-only">Search institute or state</span>
            <input type="search" name="q" defaultValue={f.q ?? ""} maxLength={100} placeholder="Search institute or state" className={control} />
          </label>
          {f.c.length ? (
            <FilterDropdown label="Course" name="c" options={pairChoices(meta.courses)} selected={f.c} />
          ) : (
            <>
              <FilterDropdown label="Course" name="sp" options={meta.specialties.map((s) => ({ value: s.code, label: s.name }))} selected={f.sp} />
              <FilterDropdown label="Degree" name="deg" options={meta.degrees.map((d) => ({ value: d, label: d }))} selected={f.deg} />
            </>
          )}
          <FilterDropdown
            label="Quota"
            name="quota"
            options={meta.quotas.map((q) => ({ value: q, label: openQuotas.includes(q) ? q : `${q} (restricted)` }))}
            selected={f.quota}
            none={profile ? "Open quotas" : undefined}
            noneNote={profile ? openQuotasNote : undefined}
          />
          <FilterDropdown label="State" name="st" options={meta.states.map((s) => ({ value: s, label: s }))} selected={f.st} />
          <label className="w-72 max-w-full">
            <span className="sr-only">Seat category</span>
            <select name="scat" defaultValue={f.scat ?? ""} className={control}>
              <option value="">{mine ? `Your categories: ${mine.join(", ")}` : "All seat categories"}</option>
              {mine && <option value="all">All seat categories</option>}
              {seatCategories.map((c) => <option key={c} value={c}>{c} seats</option>)}
            </select>
          </label>
          <label className="w-72 max-w-full">
            <span className="sr-only">Sort</span>
            <select name="sort" defaultValue={sort} className={control}>
              {seatSorts.filter((s) => profile || s !== "reach").map((s) => <option key={s} value={s}>{s === "seats" && compare ? `Most ${kindSeats(list)} first` : sortLabels[s]}</option>)}
            </select>
          </label>
        </Fragment>
        <Button type="submit">Apply</Button>
      </FilterForm>

      {one && (
        <p className="flex flex-wrap items-center gap-x-3 rounded-lg border border-border bg-card px-4 py-1 text-sm">
          Showing {course ? `${course.degree} ${course.name}` : "every course"}{f.squota && `, ${f.squota}`}
          {inst && <> at <Link href={L.institute(inst.slug)} className="inline-flex min-h-11 items-center font-semibold text-sky underline">{inst.name}</Link></>}
          <Link href={here({ list: list.key, inst: null, course: null, squota: null, nohist: null })} className="inline-flex min-h-11 items-center text-muted-foreground underline hover:text-foreground">Show every seat in your profile</Link>
        </p>
      )}
      {f.nohist && (
        <p className="flex flex-wrap items-center gap-x-3 rounded-lg border border-border bg-card px-4 py-1 text-sm">
          Only seats at courses and quotas with no past MCC allotments, so they are not on Options (no closing rank to compare).
          <Link href={here({ list: list.key, nohist: null })} className={`${smallLink} text-muted-foreground`}>Show every seat</Link>
        </p>
      )}
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
            {compare ? (
              <>
                <span className="numeric text-base font-semibold text-foreground">{formatRank(r.total)}</span> institute, course, quota and seat category rows match these filters,
                with{" "}
                {r.lists.map((l, i) => (
                  <Fragment key={l.key}>
                    {i > 0 && (i === r.lists.length - 1 ? " and " : ", ")}
                    <span className="numeric">{formatRank(r.seats[l.key] ?? 0)}</span> {kindSeats(l)}
                  </Fragment>
                ))}{" "}
                (never added together).
              </>
            ) : (
              <>
                <span className="numeric text-base font-semibold text-foreground">{formatRank(matching)}</span> seats in the {title} list match these filters
                {" "}(<span className="numeric">{formatRank(list.seats)}</span> in the whole list).
              </>
            )}
            {r.total > 0 && <> Rows <span className="numeric">{rangeLabel(r)}</span>.</>}
          </p>
          {r.total > CSV_MAX_ROWS ? (
            <p className="text-sm text-muted-foreground">
              <span className="numeric">{formatRank(r.total)}</span> rows are more than one CSV download holds (<span className="numeric">{formatRank(CSV_MAX_ROWS)}</span>): narrow the filters to download them.
            </p>
          ) : (
            r.total > 0 && (
              <Button asChild variant="secondary">
                <a href={L.with("/api/v1/seats/export", { tab: null, page: null })} download>
                  <Download className="size-4" aria-hidden />Download CSV<span className="sr-only"> of {compare ? `every ${round} list` : `the ${title} list`}, these filters, every row</span>
                </a>
              </Button>
            )
          )}
        </div>
        {noState > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="numeric">{formatRank(noState)}</span> more seats{compare && ` in the ${seatKindLabel[list.kind].toLowerCase()} list`} match everything but the state: their institutes have no state in Decide&apos;s data, so the
            state filter leaves them out. The state shown is the institute&apos;s, not the PDF&apos;s state column.
          </p>
        )}
        {compare ? r.lists.map((l) => <SeatSource key={l.key} list={l} L={L} />) : <SeatSource list={list} L={L} />}
      </div>

      {r.total === 0 ? (
        <EmptyState
          title="No seats match"
          description={`Nothing in ${compare ? `the ${round} lists` : "this list"} matches these filters. Pick another list, or widen the course, degree, quota, state or seat category filters.`}
          href={here({ list: list.key, inst: null, course: null, squota: null, sp: null, deg: null, c: null, quota: profile ? meta.quotas.join(",") : null, st: null, q: null, scat: "all", nohist: null, sort: null })}
          action={compare ? "Show every seat in these lists" : "Show every seat in this list"}
        />
      ) : (
        <>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Closing ranks are MCC&apos;s, on the row&apos;s own quota and seat category: the deepest of {PAST_ROUNDS.map((p) => `${p.year} ${roundLabel[p.round]}`).join(", ")}
            {" "}in the row, every round behind &quot;Every round&quot;.
            {profile && (
              <> Reach is Options&apos; label on that one seat category, counting {reachWindow(LATEST_YEAR, PAST_YEARS)} (every round). Options labels an option on all your seat categories together, and notes when a list&apos;s seats there are all on a seat category with another label: the label these rows show.</>
            )}{" "}
            {HISTORY_CAPTION}
          </p>
          <SeatTable rows={r.rows} lists={r.lists} current={list.key} sort={sort} ranked={!!profile} L={L} caption={caption} />
          <DataSource used={[...PAST_YEARS.map((year) => ({ year })), { year: LATEST_YEAR, round: "R1" }]} terms={r.rows.flatMap((x) => [x.terms.fee?.source, x.terms.stipend?.source, x.terms.bond?.source, x.terms.penalty?.source])} />
        </>
      )}
      <Pager page={r.page} pageSize={r.pageSize} total={r.total} href={(n) => L.page("/decide/seats", n)} focusId="results" label="Seats" />
    </>
  );
}

/** Allotments made per year (not seats), for the courses in her profile. */
async function Trends({ profile, page, L }: { profile: Profile | null; page: number; L: DecideLinks }) {
  const mine = profile && (profile.pairs?.length || profile.specialties.length || profile.degrees.length) ? profile : null;
  const [meta, res] = await Promise.all([getMeta(), allotmentTrends({ profile: mine }, { page, pageSize: PAGE_SIZE })]);
  const label = (y: number) => meta.years.find((x) => x.year === y)?.label ?? String(y);
  const [y0, y1] = PAST_YEARS;
  const max = Math.max(1, ...res.rows.flatMap((r) => YEARS.map((y) => r.byYear[y] ?? 0)));
  return (
    <>
      <p className="max-w-3xl text-muted-foreground">Allotments made per year (all rounds, all seat categories) for {mine ? "the courses in your profile" : "every course"}. This is not the number of seats: in R2 and later only new or upgraded allotments count.</p>
      <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
        <span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> options (institute, course and quota)
      </p>
      {res.total === 0 ? (
        <EmptyState title="No allotments for these courses." href={L.to("/decide/seats", { tab: "trends" })} action="Show trends" />
      ) : (
        <div role="region" aria-label="Allotments made by year" tabIndex={0} className={tbl.wrap}>
          <table className={tbl.table}>
            <caption className="sr-only">Allotments made by year per institute, course and quota, page {res.page}</caption>
            <thead>
              <tr className={tbl.headRow}>
                <th scope="col" className={tbl.th}>Institute, course and quota</th>
                {YEARS.map((y) => <th key={y} scope="col" className={`${tbl.th} text-right`}>{label(y)}</th>)}
                <th scope="col" className={`${tbl.th} text-right`}>{y1} vs {y0}</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r) => {
                const change = r.byYear[y1] != null && r.byYear[y0] != null ? r.byYear[y1]! - r.byYear[y0]! : null;
                return (
                  <tr key={r.id} className={tbl.row}>
                    <th scope="row" className={`${tbl.td} min-w-56 text-left font-normal`}>
                      <Link href={L.institute(r.college.slug)} className="inline-flex min-h-6 items-center font-medium hover:text-sky hover:underline">{r.college.name}</Link>
                      <Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className="flex min-h-6 w-fit items-center text-xs text-muted-foreground hover:text-sky hover:underline">{courseName(r)}, {r.quota}</Link>
                    </th>
                    {YEARS.map((y) => (
                      <td key={y} className={tbl.num}>
                        <span className="flex items-center justify-end gap-2">
                          {r.byYear[y] != null && <span className="block h-2 rounded-r-[4px] bg-mark" style={{ width: `${(r.byYear[y]! / max) * 64}px` }} aria-hidden />}
                          {r.byYear[y] != null ? formatRank(r.byYear[y]) : <Dash />}
                        </span>
                      </td>
                    ))}
                    <td className={tbl.num}>{change == null ? <Dash /> : change > 0 ? `+${formatRank(change)}` : formatRank(change)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page("/decide/seats", n)} focusId="results" label="Allotment trends" />
      <DataSource used={YEARS.map((year) => ({ year }))} />
    </>
  );
}
