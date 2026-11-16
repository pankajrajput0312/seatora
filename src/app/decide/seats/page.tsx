import type { Metadata } from "next";
import { ColourLegend } from "@/features/decide/components/colour-legend";
import Link from "next/link";
import { Fragment } from "react";
import { LayoutGrid } from "lucide-react";
import { AppPage } from "@/features/decide/components/app-page";
import { CsvLink } from "@/features/decide/components/csv-link";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, HistoryNote, PageHead } from "@/features/decide/components/bits";
import { termDocs } from "@/features/decide/components/fees";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { AboutData, FilterForm, FiltersPanel, ToolbarCount, ToolbarSearch } from "@/features/decide/components/filter-form";
import { InfoTip } from "@/features/decide/components/info-tip";
import { courseName } from "@/features/decide/components/options-view";
import { MccLink } from "@/features/decide/components/pages/mcc-link";
import { parseSeatsParams, seatCategories, seatSorts, seatsView, type SeatLine, type SeatSort, type SeatsParams } from "@/features/decide/components/seats/find-seats";
import { SeatCards } from "@/features/decide/components/seats/seat-cards";
import { listTitle, SeatListPicker, SeatTable, seatKindNote } from "@/features/decide/components/seats/seat-lists";
import { SeatMatrix, SeatMatrixDisplay, type ClosingYear, type MatrixRow, type SeatGroup } from "@/features/decide/components/seats/seat-matrix";
import { ViewField, ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { chosenView } from "@/features/decide/server/view";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { ActiveFilters, control, EmptyState, Field, Pager, rangeLabel, smallLink, tbl, toolbar } from "@/features/decide/components/ui";
import { decideLinks, type DecideLinks } from "@/features/decide/lib/links";
import { reachWindow } from "@/features/decide/lib/reach";
import { termChips, termValueLabel } from "@/features/decide/lib/term-filters";
import { keepProfileParams, pairChoices, profileFromParams, toURLSearchParams, type Profile } from "@/features/decide/profile";
import { allotmentTrends, getMeta, LATEST_YEAR, PAST_YEARS, YEARS } from "@/features/decide/service";
import { fmtDay, listDay } from "@/features/decide/lib/format";
import { openQuotas, openQuotasNote, quotaScopeNote, roundLabel, rounds, seatKindLabel, seatKinds, type SeatList } from "@/features/decide/types";

export const metadata: Metadata = { title: "Seats" };
const PAGE_SIZE = 50;
/** Seat rows render twice (cards and table, one shown) and the matrix's carry every round of every year, so they page by 25. */
const SEATS_PAGE_SIZE = 25;
/** "clear vacancy seats", "newly added seats". */
const kindSeats = (l: SeatList) => `${seatKindLabel[l.kind].toLowerCase()}${l.kind === "new" ? "" : " seats"}`;
const sortLabels: Record<SeatSort, string> = {
  reach: "Reach: beyond your rank first", closing: "Deepest past closing first", seats: "Most seats first", college: "By institute", state: "By state", fee: "Lowest fee first", bond: "Shortest bond first",
};
/** The matrix count line: "1,234 clear seats", "567 virtual", "89 newly added" (a round's two newly added PDFs: each dated, as the picker does). */
const kindCount = (l: SeatList, n: number, round: SeatList[]) => {
  const day = round.some((x) => x !== l && x.kind === l.kind) ? listDay(l) : undefined;
  return `${formatRank(n)} ${{ clear: "clear seats", virtual: "virtual", new: "newly added" }[l.kind]}${day ? ` (${fmtDay(day)} PDF)` : ""}`;
};
/** A matrix row without what the matrix never reads: the published terms alone are about half of a row's bytes. */
const notInMatrix = ["terms", "rounds", "list", "seats", "cs"];
/** The term filter params (lib/term-filters.ts), cleared together by "Clear all" and the empty state. */
const noTerms = { ctype: null, maxfee: null, minstip: null, bondyrs: null, maxbond: null, maxleave: null, nd: null };
const matrixRow = (r: SeatLine) => Object.fromEntries(Object.entries(r).filter(([k]) => !notInMatrix.includes(k))) as MatrixRow;
/** Seat columns of the matrix: one group per round of `lists` (seatLists order, newest first). */
const seatGroups = (lists: SeatList[]): SeatGroup[] =>
  [...new Set(lists.map((l) => `${l.year}-${l.round}`))].map((g) => {
    const ls = lists.filter((l) => `${l.year}-${l.round}` === g);
    // ponytail: a round with two clear (or virtual) PDFs shows the newest; none has so far (only newly added lists come in twos).
    return { key: `seats-${g}`, label: `${ls[0].year} ${roundLabel[ls[0].round]}`, clear: ls.find((l) => l.kind === "clear") ?? null, virtual: ls.find((l) => l.kind === "virtual") ?? null, added: ls.filter((l) => l.kind === "new") };
  });

export default async function SeatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSeatsParams(params);

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead
        title="Seats"
        about={<>MCC&apos;s seat lists for a round, as each PDF printed them: the seat matrix (every list of the round with every closing rank, fee and bond per row), one list, or the round&apos;s lists side by side.{profile && " Filtered to the courses, quotas, states, seat categories and fee and bond caps in your profile."}</>}
      />
      <SubTabs label="Seats" current={f.tab} items={[{ key: "matrix", label: "Seat lists", href: L.to("/decide/seats", { tab: "matrix" }) }, { key: "trends", label: "Allotment trends", href: L.to("/decide/seats", { tab: "trends" }) }]} />
      {f.tab === "trends" ? <Trends profile={profile} page={f.page} L={L} /> : <SeatLists f={f} profile={profile} params={params} L={L} />}
    </AppPage>
  );
}

async function SeatLists({ f, profile, params, L }: { f: SeatsParams; profile: Profile | null; params: URLSearchParams; L: DecideLinks }) {
  const [{ all, meta, inst, course, list, mine, sort, r }, view] = await Promise.all([seatsView(f, profile, SEATS_PAGE_SIZE), chosenView(params, "seats")]);
  const one = !!(inst || course || f.squota);
  if (!list || !r)
    return (
      <EmptyState icon={LayoutGrid} title="Seat lists not imported yet" description="No MCC seat list is in the data yet, so nothing is shown here. MCC publishes them on its PG counselling site.">
        <MccLink>Seat lists on the MCC site</MccLink>
      </EmptyState>
    );

  const compare = f.view === "compare";
  const matrix = f.view === "matrix";
  const several = f.view !== "list";
  const allRounds = matrix && !!f.rounds;
  /** The picked list's round: the lists the count line, `has` and the seats sort are about. */
  const roundLists = r.lists.filter((l) => l.year === list.year && l.round === list.round);
  const noState = r.noState[list.key] ?? 0;
  const here = (changes: Record<string, string | null>) => L.with("/decide/seats", { tab: null, page: null, ...changes });
  const keep = keepProfileParams(params);
  const matching = r.seats[list.key] ?? 0;
  const title = listTitle(list);
  const round = `${list.year} ${roundLabel[list.round]}`;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input"}`;
  const caption = matrix
    ? `Seat matrix, ${round}${allRounds ? " and every other round" : ""}: seats per list, terms${profile ? ", your chances" : ""} and closing ranks by year and round, ${sortLabels[sort].toLowerCase()}, page ${r.page}`
    : `${compare ? `Seats in every ${round} list side by side` : `Seats in the ${title} list`} (MCC PDF${compare ? "s" : ""}), ${sortLabels[sort].toLowerCase()}, page ${r.page}`;
  const years: ClosingYear[] = meta.years.map((y, i) => ({ year: y.year, rounds: i === 0 ? y.rounds : [...rounds] }));
  // Chips for what narrows the rows beyond the courses (the Course pill shows those); inst / course / nohist have their own lines below.
  const hasWords = { clear: "Has clear vacancy", virtual: "Has virtual vacancy", new: "Has newly added" } as const;
  const active = [
    f.q && { label: `Search: “${f.q}”`, param: "q", href: here({ q: null }) },
    // One chip per quota, state and list: the × takes that one out.
    ...f.quota.map((q) => ({ label: q, param: "quota", href: L.without("/decide/seats", "quota", q) })),
    ...f.st.map((s) => ({ label: s, param: "st", href: L.without("/decide/seats", "st", s) })),
    ...(matrix ? f.has : []).map((k) => ({ label: `${round}: ${hasWords[k].toLowerCase()}`, param: "has", href: L.without("/decide/seats", "has", k) })),
    f.scat && { label: f.scat === "all" ? "All seat categories" : `${f.scat} seats`, param: "scat", href: here({ scat: null }) },
    // Her profile's caps apply here as on Options (find-seats.ts seatsView); "any" lifts one on this page.
    profile?.maxFeeLakh != null && f.maxfee == null && { label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, param: "maxfee", href: here({ maxfee: "any" }) },
    profile?.maxBondYears != null && f.bondyrs == null && { label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, param: "bondyrs", href: here({ bondyrs: "any" }) },
    ...termChips(f).map((c) => ({ label: c.label, param: c.key, href: c.value ? L.without("/decide/seats", c.key, c.value) : here({ [c.key]: null }) })),
  ].filter((x) => !!x);
  const clearAll = here({ list: list.key, q: null, quota: null, st: null, has: null, scat: null, ...noTerms });
  const strong = (t: string) => <span className="font-semibold">{t}</span>;
  const about = matrix ? (
    <>
      One row per institute, course, quota and seat category {allRounds ? "with seats in any MCC seat list in the data, or allotted in any MCC result" : `with seats in the ${round} lists`}: its {strong("clear")} and{" "}
      {strong("virtual")} vacancy seats per round, a {strong("+N new")} badge when the newly added list prints seats for it (most are also in the clear vacancy list, so they are
      not extra seats), the course&apos;s fee, stipend, bond and leaving penalty{profile && ", your chances on that seat category"} and its closing rank in every round, with the
      allotments MCC made there in brackets. The lists overlap, so their seats are never added together. The list picked above sets the round and the list &quot;Most seats
      first&quot; sorts by. Select a row, or its Details button, for every number and its source.
    </>
  ) : compare ? (
    <>
      One row per institute, course, quota and seat category, with its seats in each {round} list.{" "}
      {r.lists.map((l) => <Fragment key={l.key}>{strong(seatKindLabel[l.kind])}: {seatKindNote[l.kind]}{" "}</Fragment>)}
      The lists overlap (a newly added seat is usually also a clear vacancy, and a virtual vacancy opens only if its holder moves), so the columns are never added together.
      {" "}The list picked above sets the round compared and the list that &quot;{`Most ${kindSeats(list)} first`}&quot; sorts by.
    </>
  ) : (
    <>{strong(seatKindLabel[list.kind])}: {seatKindNote[list.kind]} The three kinds of list overlap, so their seats are never added together.</>
  );
  const closingNote = matrix ? (
    <>
      Closing ranks are MCC&apos;s, on the row&apos;s own quota and seat category, as rank (allotments made in that round, not seats); &quot;—&quot; means no allotment there in that
      round, or no MCC result for it in the data.
      {profile && <> Your chances is Options&apos; label on that one seat category, counting {reachWindow(LATEST_YEAR, PAST_YEARS)} (every round); &quot;New&quot; when MCC never allotted the course and quota; no label on a row whose PDF prints no quota.</>}
      {" "}A card&apos;s deepest closing is the deepest of every round of {reachWindow(LATEST_YEAR, PAST_YEARS)}, Stray included, with its year and round (as Options and Compare).
    </>
  ) : (
    <>
      Closing ranks are MCC&apos;s, on the row&apos;s own quota and seat category: the deepest of every round of {reachWindow(LATEST_YEAR, PAST_YEARS)}, Stray included, in the row,
      every round behind &quot;Every round&quot;.
      {profile && (
        <> Reach is Options&apos; label on that one seat category, counting {reachWindow(LATEST_YEAR, PAST_YEARS)} (every round). Options labels an option on all your seat categories together, and notes when a list&apos;s seats there are all on a seat category with another label: the label these rows show.</>
      )}
    </>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* A list's chip filters to it: one list's seats (One list, Compare), or in the matrix the rows with seats in it. */}
      <SeatListPicker lists={all} current={list.key} href={(key) => here({ list: key, has: matrix ? all.find((l) => l.key === key)?.kind ?? null : null })} />
      <div className="chip-row flex flex-wrap items-center gap-2">
        <nav aria-label="Seats view" className="flex flex-wrap gap-2">
          <Link href={here({ view: null })} aria-current={matrix ? "true" : undefined} className={chip(matrix)}>Seat matrix</Link>
          <Link href={here({ view: "list", rounds: null, has: null })} aria-current={f.view === "list" ? "true" : undefined} className={chip(f.view === "list")}>One list</Link>
          <Link href={here({ view: "compare", rounds: null, has: null })} aria-current={compare ? "true" : undefined} className={chip(compare)}>Compare the {round} lists</Link>
        </nav>
        {matrix && (
          <nav aria-label="Seat matrix rounds" className="flex flex-wrap gap-2 sm:border-l sm:border-border sm:pl-2">
            <Link href={here({ rounds: null })} aria-current={!allRounds ? "true" : undefined} className={chip(!allRounds)}>This round only</Link>
            <Link href={here({ rounds: "all" })} aria-current={allRounds ? "true" : undefined} className={chip(allRounds)}>All rounds</Link>
          </nav>
        )}
        <InfoTip label={matrix ? "the seat matrix" : compare ? `the ${round} lists side by side` : `the ${title} list`}>{about}</InfoTip>
      </div>
      </div>

      {/* As on Options: the toolbar (pinned on phones) has the search box, Filters (the rest, in a sheet) and the count;
          the form, its buttons and the sheet stay mounted, the fields remount to show what was applied. */}
      <FilterForm action="/decide/seats" role="search" aria-label="Filter seats" className={toolbar}>
        {(["rank", "cat", "pwd", "fee", "bond"] as const).map((k) => keep.get(k) && <input key={k} type="hidden" name={k} value={keep.get(k)!} />)}
        <input type="hidden" name="list" value={list.key} />
        {!matrix && <input type="hidden" name="view" value={f.view} />}
        {allRounds && <input type="hidden" name="rounds" value="all" />}
        {f.nohist && <input type="hidden" name="nohist" value="1" />}
        <ViewField />
        {(["inst", "course", "squota"] as const).map((k) => f[k] && <input key={k} type="hidden" name={k} value={f[k]} />)}
        <ToolbarSearch>
          <Fragment key={params.toString()}>
            <label className="min-w-0">
              <span className="sr-only">Search institute or state</span>
              <input type="search" name="q" defaultValue={f.q ?? ""} maxLength={100} placeholder="Institute or state" className={control} />
            </label>
          </Fragment>
        </ToolbarSearch>
        <FiltersPanel count={active.length} clear={clearAll} total={r.total} saveDefaults={!!profile}>
        <Fragment key={params.toString()}>
          {f.c.length ? (
            <FilterDropdown label="Course" name="c" options={pairChoices(meta.courses)} selected={f.c} />
          ) : (
            <>
              <FilterDropdown label="Course" name="sp" search options={meta.specialties.map((s) => ({ value: s.code, label: s.name }))} selected={f.sp} />
              <FilterDropdown label="Degree" name="deg" options={meta.degrees.map((d) => ({ value: d, label: d }))} selected={f.deg} />
            </>
          )}
          <FilterDropdown
            label="Quota"
            name="quota"
            options={meta.quotas.map((q) => ({ value: q, label: openQuotas.includes(q) ? q : `${q} (restricted)` }))}
            selected={f.quota}
            none={profile ? "Open quotas" : undefined}
            info={profile ? openQuotasNote : undefined}
          />
          <FilterDropdown label="State" name="st" options={meta.states.map((s) => ({ value: s, label: s }))} selected={f.st} none="All states" info={quotaScopeNote} />
          {matrix && (
            <FilterDropdown
              label={`Seats in ${round}`}
              name="has"
              options={seatKinds.filter((k) => roundLists.some((l) => l.kind === k)).map((k) => ({ value: k, label: hasWords[k] }))}
              selected={f.has}
              none="Any"
              info={`Ticked: rows with seats in any ticked ${round} list.`}
            />
          )}
          <TermFilterControls f={f} caps={profile} />
          <Field label="Seat category">
            <select name="scat" defaultValue={f.scat ?? ""} className={control}>
              <option value="">{mine ? `Yours: ${mine.join(", ")}` : "All seat categories"}</option>
              {mine && <option value="all">All seat categories</option>}
              {seatCategories.map((c) => <option key={c} value={c}>{c} seats</option>)}
            </select>
          </Field>
          <Field label="Sort">
            <select name="sort" defaultValue={sort} className={control}>
              {seatSorts.filter((s) => profile || s !== "reach").map((s) => <option key={s} value={s}>{s === "seats" && several ? `Most ${kindSeats(list)} first` : s === "reach" && matrix ? "Your chances: beyond your rank first" : sortLabels[s]}</option>)}
            </select>
          </Field>
        </Fragment>
        </FiltersPanel>
        <ToolbarCount total={r.total} noun="rows" />
      </FilterForm>
      <ActiveFilters items={active} clear={clearAll} />

      {one && (
        <p className="flex flex-wrap items-center gap-x-3 rounded-lg border border-border bg-card px-4 py-1 text-sm">
          {course ? `${course.degree} ${course.name}` : "Every course"}{f.squota && `, ${f.squota}`}
          {inst && <> at <Link href={L.institute(inst.slug)} className="inline-flex min-h-11 items-center font-semibold text-sky underline">{inst.name}</Link></>}
          <Link href={here({ list: list.key, inst: null, course: null, squota: null, nohist: null })} className="inline-flex min-h-11 items-center text-muted-foreground underline hover:text-foreground">Show every seat in your profile</Link>
        </p>
      )}
      {f.nohist && (
        <p className="flex flex-wrap items-center gap-x-1 rounded-lg border border-border bg-card px-4 py-1 text-sm">
          Only seats with no past MCC allotments
          <InfoTip label="seats with no past allotments">Seats at courses and quotas with no past MCC allotments, so they are not on Options (no closing rank to compare).</InfoTip>
          <Link href={here({ list: list.key, nohist: null })} className={`${smallLink} ml-2 text-muted-foreground`}>Show every seat</Link>
        </p>
      )}
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2 md:gap-x-4">
        <AboutData className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
            {matrix ? (
              <>
                <span className="numeric text-base font-semibold text-foreground">{formatRank(r.total)}</span> rows in {round}{allRounds && " and every other round"}
                {roundLists.map((l) => <Fragment key={l.key}> · <span className="numeric">{kindCount(l, r.seats[l.key] ?? 0, roundLists)}</span></Fragment>)}
              </>
            ) : compare ? (
              <>
                <span className="numeric text-base font-semibold text-foreground">{formatRank(r.total)}</span> rows
                {r.lists.map((l) => <Fragment key={l.key}> · <span className="numeric">{formatRank(r.seats[l.key] ?? 0)}</span> {kindSeats(l)}</Fragment>)}
              </>
            ) : (
              <>
                <span className="numeric text-base font-semibold text-foreground">{formatRank(matching)}</span> seats of <span className="numeric">{formatRank(list.seats)}</span> in the {title} list
              </>
            )}
            {r.total > 0 && <> · rows <span className="numeric">{rangeLabel(r)}</span></>}
           <ColourLegend className="ml-1 align-middle" /></p>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SeatSource lists={several ? roundLists : [list]} L={L} />
            {r.total > 0 && <HistoryNote more={closingNote} />}
          </span>
        </AboutData>
        {r.total > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle page="seats" view={view} />
            <CsvLink href={L.with("/api/v1/seats/export", { tab: null, page: null })} what={`${matrix ? "the seat matrix" : compare ? `every ${round} list` : `the ${title} list`}, these filters, every row`} total={r.total} />
            {matrix && view === "table" && <SeatMatrixDisplay groups={seatGroups(r.lists)} ranked={!!profile} years={years} />}
          </div>
        )}
        </div>
        {r.unknownTerms > 0 && f.nd !== "keep" && (
          <p className="text-sm text-muted-foreground">
            <span className="numeric">{formatRank(r.unknownTerms)}</span> more rows have no published figure for that filter.{" "}
            <Link href={here({ nd: "keep" })} className={`${smallLink} text-sky`}>Include them</Link>
          </p>
        )}
        {noState > 0 && (
          <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            <span><span className="numeric">{formatRank(noState)}</span> more seats have no state in the data</span>
            <InfoTip label="seats with no state">
              They match everything but the state{several && ` (in the ${seatKindLabel[list.kind].toLowerCase()} list)`}: their institutes have no state in Decide&apos;s data, so the state filter leaves them out. The state shown is the institute&apos;s, not the PDF&apos;s state column.
            </InfoTip>
          </p>
        )}
      </div>

      {r.total === 0 ? (
        <EmptyState
          title="No seats match"
          description={`Nothing in ${several ? `the ${round} lists` : "this list"} matches these filters. Pick another list, or widen the filters.`}
          href={here({ list: list.key, inst: null, course: null, squota: null, sp: null, deg: null, c: null, quota: profile ? meta.quotas.join(",") : null, st: null, q: null, scat: "all", nohist: null, has: null, sort: null, ...noTerms, maxfee: "any", bondyrs: "any" })}
          action={several ? "Show every seat in these lists" : "Show every seat in this list"}
        />
      ) : matrix ? (
        <>
          <SeatMatrix rows={r.rows.map(matrixRow)} groups={seatGroups(r.lists)} years={years} results={meta.sources} ranked={!!profile} sort={sort} caption={caption} list={list} lists={r.lists} view={view} />
          <DataSource terms={termDocs(r.rows.map((x) => x.fees))} />
        </>
      ) : (
        <>
          <ViewPanes
            page="seats"
            view={view}
            cards={<SeatCards rows={r.rows} list={list} lists={several ? roundLists : [list]} ranked={!!profile} L={L} title={caption} />}
            table={<SeatTable rows={r.rows} lists={r.lists} current={list.key} sort={sort} ranked={!!profile} L={L} caption={caption} />}
          />
          <DataSource used={[...PAST_YEARS.map((year) => ({ year })), { year: LATEST_YEAR, round: "R1" }]} terms={termDocs(r.rows.map((x) => x.fees))} />
        </>
      )}
      <Pager page={r.page} pageSize={r.pageSize} total={r.total} href={(n) => L.page("/decide/seats", n)} focusId="results" label="Seats" />
      {allRounds && r.lists.length > roundLists.length && (
        <details className="text-xs text-muted-foreground">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky underline">Sources of the other rounds&apos; lists</summary>
          <div className="grid gap-2">{[...new Set(r.lists.filter((l) => !roundLists.includes(l)).map((l) => `${l.year} ${l.round}`))].map((g) => <p key={g}>{g}: <SeatSource lists={r.lists.filter((l) => !roundLists.includes(l) && `${l.year} ${l.round}` === g)} L={L} /></p>)}</div>
        </details>
      )}
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
  const newest = [...YEARS].sort((a, b) => b - a);
  return (
    <>
      <p id="results" tabIndex={-1} aria-live="polite" className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
        <span><span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> options: allotments made per year, not seats</span>
        <InfoTip label="allotment trends">
          Allotments made per year (all rounds, all seat categories) for {mine ? "the courses in your profile" : "every course"}, per institute, course and quota. This is not the number of seats: in R2 and later only new or upgraded allotments count.
        </InfoTip>
      </p>
      {res.total === 0 ? (
        <EmptyState title="No allotments for these courses." href={L.to("/decide/seats", { tab: "trends" })} action="Show trends" />
      ) : (
        // A phone: a card per option (stack-md, globals.css), its years two to a line, nothing sideways.
        <div role="region" aria-label="Allotments made by year" tabIndex={0} className={tbl.wrap}>
          <table className={`${tbl.table} stack-md`}>
            <caption className="sr-only">Allotments made by year per institute, course and quota, page {res.page}</caption>
            <thead>
              <tr className={tbl.headRow}>
                <th scope="col" className={tbl.th}>Institute, course and quota</th>
                {newest.map((y) => <th key={y} scope="col" className={`${tbl.th} text-right`}>{label(y)}</th>)}
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
                    {newest.map((y) => (
                      <td key={y} data-label={label(y)} className={tbl.num}>
                        <span className="flex items-center justify-end gap-2 max-md:justify-start">
                          {r.byYear[y] != null && <span className="block h-2 rounded-r-[4px] bg-mark" style={{ width: `${(r.byYear[y]! / max) * 64}px` }} aria-hidden />}
                          {r.byYear[y] != null ? formatRank(r.byYear[y]) : <Dash />}
                        </span>
                      </td>
                    ))}
                    <td data-label={`${y1} vs ${y0}`} className={tbl.num}>{change == null ? <Dash /> : change > 0 ? `+${formatRank(change)}` : formatRank(change)}</td>
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
