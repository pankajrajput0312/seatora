import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { hospitalInfo } from "@/features/decide/components/institute/institute-data";
import { residentsFilters, ResidentsAbout, ResidentsCards, ResidentsTable, type ResidentTypes } from "@/features/decide/components/residents-results";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { ResidentsCollegeFilter, ResidentsPicks, ResidentsSearch } from "@/features/decide/components/residents-search";
import { ActiveFilters, EmptyState, Field, FilterBar, Pager, Select, smallLink } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { decideLinks } from "@/features/decide/lib/links";
import { specialtyName } from "@/features/decide/lib/specialty-search";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import type { ResidentsQuery } from "@/features/decide/residents-search";
import { canSeeResidents } from "@/features/decide/server/residents";
import { listResidentsAll, RESIDENTS_MAX_PAGE, residentColleges, residentQuota, residentYears, ResidentsDenied } from "@/features/decide/server/residents-all";
import { chosenView } from "@/features/decide/server/view";
import { Paywall } from "@/features/plans/components/paywall";
import { currentPlan } from "@/features/plans/usage";
import { getDecideData, getMeta } from "@/features/decide/service";
import { hideResidentAction } from "../institutes/[slug]/actions";
import { iniCetIn } from "@/features/decide/lib/college-aliases";
import { countResidents, findResidentColleges, findResidentNames, listResidentColleges } from "./actions";

// People's names: never indexed.
export const metadata: Metadata = { title: "Residents", robots: { index: false, follow: false } };

const sorts = [
  { value: "year", label: "Year, newest first" },
  { value: "college", label: "College" },
  { value: "name", label: "Name" },
] satisfies { value: ResidentsQuery["sort"]; label: string }[];

export default async function ResidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const here = (changes: Record<string, string | null>) => L.with("/decide/residents", { page: null, ...changes });
  const head = (about?: React.ReactNode) => (
    <PageHead title="Residents" about={about} note={about && "From MCC's admitted lists: seats filled through MCC counselling only (state-quota seats aren't included)."}>
      Who got in where, from MCC&apos;s admitted-candidates lists. Contact people respectfully; ask to be hidden and we will.
    </PageHead>
  );

  const denied = async (why: ResidentsDenied["code"]) => {
    const me = why === "plan_limit" || why === "device_limit" ? await currentPlan() : null;
    return (
    <AppPage className="grid grid-cols-1 gap-3">
      {head()}
      {me ? (
        <Paywall feature="residents" eff={me.eff} device={why === "device_limit"} />
      ) : why === "locked" ? (
        <EmptyState title="Sign in to see residents" description="Names are shown only to the signed-in, invited account." href={L.to("/decide/institutes")} action="See the institutes" />
      ) : (
        <EmptyState title="Too many requests" description="Residents were opened too many times from this network or account. Try again in an hour, or tomorrow." href={L.to("/decide/institutes")} action="See the institutes" />
      )}
    </AppPage>
    );
  };
  if (!(await canSeeResidents())) return denied("locked");

  const profile = profileFromParams(params);
  const [meta, { colleges }, years, info, view] = await Promise.all([getMeta(), getDecideData(), residentYears(), hospitalInfo(), chosenView(params, "residents")]);
  const { query, yours, allCourses } = residentsFilters(params, profile, meta.courses);
  const picked = query.college ?? [];
  const pickedColleges = picked.length ? await residentColleges({ slugs: picked }) : [];
  // The search checks access again and spends one read of the budget.
  const res = await listResidentsAll(query).catch((e) => {
    if (e instanceof ResidentsDenied) return e.code;
    throw e;
  });
  if (typeof res === "string") return denied(res);
  const { rows, total } = res;
  // Past the last page (a stale link, a hide) or the deepest one served: the last page there is.
  const pages = Math.min(Math.ceil(total / res.pageSize), RESIDENTS_MAX_PAGE);
  if (!rows.length && total) redirect(L.page("/decide/residents", pages));
  const keyOf = new Map(colleges.map((c) => [c.slug, c.key]));
  const types: ResidentTypes = new Map(rows.map((r) => [r.college.slug, info.get(keyOf.get(r.college.slug) ?? "")?.type ?? null]));
  const courseName = (slug: string) => {
    const c = meta.courses.find((x) => x.slug === slug);
    return c ? `${c.degree} ${c.name}` : slug;
  };
  const collegeName = (slug: string) => pickedColleges.find((c) => c.slug === slug)?.name ?? slug;
  // Her courses ticked one by one are still "Your courses" (the sheet ticks them when the filter defaults to them).
  const mine = yours?.map((c) => c.slug) ?? [];
  const sameAsYours = !!yours && mine.length === (query.course ?? []).length && mine.every((c) => query.course?.includes(c));
  const typedCourses = !allCourses && params.has("course") && !sameAsYours ? query.course ?? [] : [];
  const R = "/decide/residents";
  // One chip per value (college, name, course, state, year): the × takes that one out.
  const chips = [
    query.q && { label: `Search: “${query.q}”`, param: "q", href: here({ q: null }) },
    ...picked.map((c) => ({ label: collegeName(c), href: L.without(R, "college", c) })),
    ...(query.name ?? []).map((n) => ({ label: n, href: L.without(R, "name", n) })),
    query.cq && { label: `College: “${query.cq}”`, href: here({ cq: null }) },
    // Her courses are the default: a chip for them too, "All courses" lifts it.
    ...(allCourses ? [{ label: "All courses", param: "course", href: here({ course: null }) }] : typedCourses.length ? typedCourses.map((c) => ({ label: courseName(c), param: "course", href: L.without(R, "course", c) })) : yours ? [{ label: `Your courses (${yours.length})`, param: "course", href: here({ course: "all" }) }] : []),
    ...(query.state ?? []).map((s) => ({ label: s, param: "state", href: L.without(R, "state", s) })),
    ...(query.year ?? []).map((y) => ({ label: String(y), param: "year", href: L.without(R, "year", String(y)) })),
    query.quota && { label: residentQuota(query.quota), href: here({ rq: null }) },
    query.sort !== "year" && { label: `Sorted by ${sorts.find((s) => s.value === query.sort)!.label.toLowerCase()}`, param: "sort", href: here({ sort: null }) },
  ].filter((x) => !!x);
  const clear = L.to("/decide/residents", { course: "all" });
  const collegeOpts = pickedColleges.map((c) => ({ value: c.slug, label: c.state ? `${c.name}, ${c.state}` : c.name }));
  // Why nothing matched: a search found nothing (never "hidden": that is rare), or the filters together leave none.
  const ini = query.q ? iniCetIn(query.q) : null;
  const inCourses = query.course?.length ? (typedCourses.length ? " in the ticked courses" : " in your courses") : "";
  const emptyWhy = ini
    ? `${ini} admits through INI-CET, not MCC's NEET PG counselling, so it is in none of MCC's admitted lists.`
    : query.q
      ? `No name or hospital matches “${query.q}”${inCourses}. Search finds one name or hospital (its name, city or short name, like KEM); for several hospitals use Filters → College.`
      : `MCC's admitted lists have no names for these filters${inCourses}.`;
  // A name taken off: by email when the site has a contact address (as the page's (i) says), else the request form.
  const removal = siteConfig.contactEmail
    ? `mailto:${siteConfig.contactEmail}?${new URLSearchParams({ subject: "Residents: request removal", body: "Please hide this name from Seatora's Residents.\n\nName:\nCollege:\nCourse and year:\n" }).toString().replace(/\+/g, "%20")}`
    : L.to("/decide/requests");
  const courseChoices = [
    ...(yours ? [{ value: "all", label: "All courses" }] : []),
    ...meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${specialtyName(c.name)}` })),
  ];
  return (
    <AppPage className="grid grid-cols-1 gap-3">
      {head(<ResidentsAbout />)}

      {/* Filters, the count and the results tools on one row (globals.css .filter-row); chips and notes under it. */}
      <div className="filter-row">
      <ResidentsPicks key={picked.join("\n")} colleges={collegeOpts} listColleges={listResidentColleges}>
      <FilterBar
        action="/decide/residents"
        params={params}
        active={chips.length}
        clear={clear}
        total={total}
        noun="residents"
        recount={countResidents}
        search={<ResidentsSearch q={query.q} colleges={collegeOpts} names={query.name ?? []} findColleges={findResidentColleges} findNames={findResidentNames} />}
      >
        <ResidentsCollegeFilter />
        <FilterDropdown label="Course" name="course" search options={courseChoices} selected={allCourses ? ["all"] : typedCourses.length ? typedCourses : mine} none={yours ? `Your courses (${yours.length})` : "All courses"} info={yours ? "Your profile's courses are ticked. None ticked also means your courses; tick All courses for every one." : undefined} />
        <FilterDropdown label="State" name="state" search options={meta.states.map((s) => ({ value: s, label: s }))} selected={query.state ?? []} none="All states" />
        <FilterDropdown label="Year" name="year" options={years.map((y) => ({ value: String(y), label: String(y) }))} selected={(query.year ?? []).map(String)} none="All years" />
        <Field label="Sort by"><Select name="sort" value={query.sort} options={sorts} /></Field>
      </FilterBar>
      </ResidentsPicks>
      <ActiveFilters items={chips} clear={clear} />

      <div className={toolbarRow}>
        {/* Phones: the toolbar says the count; this line is for md up (and the focus after a page or a removed chip). */}
        <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground max-md:sr-only">
          <span className="numeric font-semibold text-foreground">{formatRank(total)}</span> residents
        </p>
        {total > 0 && <ViewToggle page="residents" view={view} />}
      </div>
      </div>

      {total === 0 ? (
        <EmptyState title="No residents match these filters" description={emptyWhy} href={clear} action="Clear filters" />
      ) : (
        <ViewPanes
          page="residents"
          view={view}
          cards={<ResidentsCards rows={rows} L={L} hide={hideResidentAction} types={types} />}
          table={<ResidentsTable rows={rows} L={L} hide={hideResidentAction} types={types} caption={`Residents, page ${res.page}, sorted by ${sorts.find((s) => s.value === query.sort)!.label.toLowerCase()}`} />}
        />
      )}
      <Pager page={res.page} pageSize={res.pageSize} total={Math.min(total, pages * res.pageSize)} href={(n) => L.page("/decide/residents", n)} focusId="results" label="Residents" />
      {total > pages * res.pageSize && (
        <p className="-mt-3 text-center text-sm text-muted-foreground">
          Only the first <span className="numeric">{formatRank(pages * res.pageSize)}</span> ({pages} pages) are shown: narrow the filters (name, college, course, state or year) to see the others.
        </p>
      )}
      <footer className="flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground">
        <span>From MCC&apos;s official admitted lists{years.length > 0 && <>, <span className="numeric">{years.length > 1 ? `${years.at(-1)}–${years[0]}` : years[0]}</span></>}: seats filled through MCC counselling only. Year: the year of admission.</span>
        <a href={removal} className={`${smallLink} text-sky`}>Request removal</a>
      </footer>
    </AppPage>
  );
}
