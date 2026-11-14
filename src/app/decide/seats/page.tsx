import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Fragment } from "react";
import { LayoutGrid } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Dash, PageHead } from "@/features/decide/components/bits";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { courseName } from "@/features/decide/components/options-view";
import { MccLink } from "@/features/decide/components/pages/mcc-link";
import { findSeats, seatSorts } from "@/features/decide/components/seats/find-seats";
import { listTitle, SeatListPicker, SeatListSource, SeatTable, seatKindNote } from "@/features/decide/components/seats/seat-lists";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { control, EmptyState, Pager, rangeLabel, tbl } from "@/features/decide/components/ui";
import { decideLinks, type DecideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { eligibleCategories } from "@/features/decide/lib/reach";
import { keepProfileParams, profileFromParams, toURLSearchParams, type Profile } from "@/features/decide/profile";
import { listNotices } from "@/features/decide/server/notices";
import { seatLists } from "@/features/decide/server/seats";
import { allotmentTrends, getCollege, getMeta, PAST_YEARS, YEARS } from "@/features/decide/service";
import { baseCategories, seatKindLabel, type Category } from "@/features/decide/types";

export const metadata: Metadata = { title: "Seats" };
const PAGE_SIZE = 50;
const categories: Category[] = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)];
const lists = ["sp", "deg", "quota", "st"];
/**
 * Page filters. Course, degree, quota and state are her profile params (sp, deg, quota, st), as on Options, so her
 * profile applies by default; `scat` (seat category: absent = the ones she can take, "all", or one) is not a profile key.
 */
const schema = z.object({
  tab: z.enum(["matrix", "trends"]).default("matrix"),
  list: z.string().max(200).optional(),
  sp: z.array(z.string().max(100)).default([]),
  deg: z.array(z.string().max(100)).default([]),
  quota: z.array(z.string().max(100)).default([]),
  st: z.array(z.string().max(100)).default([]),
  scat: z.enum(["all", ...categories]).optional(),
  /** One option (links from Options and institute pages): institute slug, course slug, quota. They override the profile's courses, states and quotas. */
  inst: z.string().max(200).optional(),
  course: z.string().max(100).optional(),
  squota: z.string().max(100).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(seatSorts).default("college"),
  page: pageValue.default(1),
});
type Filters = z.infer<typeof schema>;

export default async function SeatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params, lists);

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Seats">
        MCC&apos;s seat lists for a round, one list at a time, as each PDF printed them. Filtered to the courses, quotas and seat categories in your profile.
      </PageHead>
      <SubTabs label="Seats" current={f.tab} items={[{ key: "matrix", label: "Seat lists", href: L.to("/decide/seats", { tab: "matrix" }) }, { key: "trends", label: "Allotment trends", href: L.to("/decide/seats", { tab: "trends" }) }]} />
      {f.tab === "trends" ? <Trends profile={profile} page={f.page} L={L} /> : <SeatLists f={f} profile={profile} params={params} L={L} />}
    </AppPage>
  );
}

async function SeatLists({ f, profile, params, L }: { f: Filters; profile: Profile | null; params: URLSearchParams; L: DecideLinks }) {
  const [all, meta, inst] = await Promise.all([seatLists(), getMeta(), f.inst ? getCollege(f.inst) : null]);
  const course = meta.courses.find((c) => c.slug === f.course);
  const one = !!(inst || course || f.squota);
  const list = all.find((l) => l.key === f.list) ?? all[0];
  if (!list)
    return (
      <EmptyState icon={LayoutGrid} title="Seat lists not imported yet" description="No MCC seat list is in the data yet, so nothing is shown here. MCC publishes them on its PG counselling site.">
        <MccLink>Seat lists on the MCC site</MccLink>
      </EmptyState>
    );

  const mine = profile ? eligibleCategories(profile.category, profile.pwd) : null;
  const cats = f.scat === "all" ? undefined : f.scat ? [f.scat] : (mine ?? undefined);
  const [r, notices] = await Promise.all([
    findSeats(
      {
        list: list.key,
        college: inst?.key,
        courses: course ? [course.slug] : undefined,
        specialties: course ? [] : f.sp,
        degrees: course ? [] : f.deg,
        quotas: f.squota ? [f.squota] : f.quota,
        states: inst ? [] : f.st,
        categories: cats,
        q: f.q?.trim() || undefined,
        sort: f.sort,
      },
      { page: f.page, pageSize: PAGE_SIZE },
    ),
    listNotices({ kind: "seat_matrix", year: list.year, round: list.round }),
  ]);
  // MCC seat notices of this round from the list's date on, other than the seat list PDFs themselves.
  const later = notices.filter((n) => n.url && !all.some((l) => l.url === n.url) && (!list.publishedAt || n.date >= list.publishedAt));
  const here = (changes: Record<string, string | null>) => L.with("/decide/seats", { tab: null, page: null, ...changes });
  const keep = keepProfileParams(params);
  const matching = r.seats[list.key] ?? 0;
  const title = listTitle(list);

  return (
    <>
      <SeatListPicker lists={all} current={list.key} href={(key) => here({ list: key })} />
      <p className="max-w-3xl text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{seatKindLabel[list.kind]}</span>: {seatKindNote[list.kind]} The three kinds of list overlap, so their seats are never added together.
      </p>

      {/* As on Options: the form and Apply stay mounted (focus stays on Apply); the fields remount to show what was applied. */}
      <Form action="/decide/seats" scroll={false} role="search" aria-label="Filter seats" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        {(["rank", "cat", "pwd", "fee", "bond"] as const).map((k) => keep.get(k) && <input key={k} type="hidden" name={k} value={keep.get(k)!} />)}
        <input type="hidden" name="list" value={list.key} />
        <Fragment key={params.toString()}>
          <label className="min-w-56 flex-1">
            <span className="sr-only">Search institute or state</span>
            <input type="search" name="q" defaultValue={f.q ?? ""} maxLength={100} placeholder="Search institute or state" className={control} />
          </label>
          <FilterDropdown label="Course" name="sp" options={meta.specialties.map((s) => ({ value: s.code, label: s.name }))} selected={f.sp} />
          <FilterDropdown label="Degree" name="deg" options={meta.degrees.map((d) => ({ value: d, label: d }))} selected={f.deg} />
          <FilterDropdown label="Quota" name="quota" options={meta.quotas.map((q) => ({ value: q, label: q }))} selected={f.quota} />
          <FilterDropdown label="State" name="st" options={meta.states.map((s) => ({ value: s, label: s }))} selected={f.st} />
          <label className="w-72 max-w-full">
            <span className="sr-only">Seat category</span>
            <select name="scat" defaultValue={f.scat ?? ""} className={control}>
              <option value="">{mine ? `Your categories: ${mine.join(", ")}` : "All seat categories"}</option>
              {mine && <option value="all">All seat categories</option>}
              {categories.map((c) => <option key={c} value={c}>{c} seats</option>)}
            </select>
          </label>
          <label className="w-44">
            <span className="sr-only">Sort</span>
            <select name="sort" defaultValue={f.sort} className={control}>
              <option value="college">Sort by institute</option>
              <option value="state">Sort by state</option>
              <option value="seats">Most seats first</option>
            </select>
          </label>
        </Fragment>
        <Button type="submit">Apply</Button>
      </Form>

      {one && (
        <p className="flex flex-wrap items-center gap-x-3 rounded-lg border border-border bg-card px-4 py-1 text-sm">
          Showing {course ? `${course.degree} ${course.name}` : "every course"}{f.squota && `, ${f.squota}`}
          {inst && <> at <Link href={L.institute(inst.slug)} className="inline-flex min-h-11 items-center font-semibold text-sky underline">{inst.name}</Link></>}
          <Link href={here({ list: list.key, inst: null, course: null, squota: null })} className="inline-flex min-h-11 items-center text-muted-foreground underline hover:text-foreground">Show every seat in your profile</Link>
        </p>
      )}
      <div className="grid gap-2">
        <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
          <span className="numeric text-base font-semibold text-foreground">{formatRank(matching)}</span> seats in the {title} list match these filters
          {" "}(<span className="numeric">{formatRank(list.seats)}</span> in the whole list).{r.total > 0 && <> Rows <span className="numeric">{rangeLabel(r)}</span>.</>}
        </p>
        <SeatListSource list={list} changes={later} noticesHref={L.to("/decide/counselling")} />
      </div>

      {r.total === 0 ? (
        <EmptyState
          title="No seats match"
          description="Nothing in this list matches these filters. Pick another list, or widen the course, degree, quota, state or seat category filters."
          href={here({ list: list.key, sp: null, deg: null, quota: null, st: null, q: null, scat: "all", sort: null })}
          action="Show every seat in this list"
        />
      ) : (
        <SeatTable rows={r.rows} L={L} caption={`Seats in the ${title} list (MCC PDF), ${f.sort === "seats" ? "most seats first" : `by ${f.sort === "state" ? "state" : "institute"}`}, page ${r.page}`} />
      )}
      <Pager page={r.page} pageSize={r.pageSize} total={r.total} href={(n) => L.page("/decide/seats", n)} focusId="results" label="Seats" />
    </>
  );
}

/** Allotments made per year (not seats), for the courses in her profile. */
async function Trends({ profile, page, L }: { profile: Profile | null; page: number; L: DecideLinks }) {
  const specialties = profile?.specialties.length ? profile.specialties : undefined;
  const [meta, res] = await Promise.all([getMeta(), allotmentTrends({ specialties }, { page, pageSize: PAGE_SIZE })]);
  const label = (y: number) => meta.years.find((x) => x.year === y)?.label ?? String(y);
  const [y0, y1] = PAST_YEARS;
  const max = Math.max(1, ...res.rows.flatMap((r) => YEARS.map((y) => r.byYear[y] ?? 0)));
  return (
    <>
      <p className="max-w-3xl text-muted-foreground">Allotments made per year (all rounds, all seat categories) for {specialties ? "the courses in your profile" : "every course"}. This is not the number of seats: in R2 and later only new or upgraded allotments count.</p>
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
