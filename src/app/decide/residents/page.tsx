import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatRank } from "@/features/cutoffs/lib/format";
import { toolbarRow } from "@/features/decide/components/csv-link";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { hospitalInfo } from "@/features/decide/components/institute/institute-data";
import { SourceRefs } from "@/features/decide/components/page-sources";
import { residentDocs, residentsFilters, ResidentsAbout, ResidentsCards, ResidentsTable, type ResidentTypes } from "@/features/decide/components/residents-results";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { ActiveFilters, control, EmptyState, Field, FilterBar, Pager, Select } from "@/features/decide/components/ui";
import { ViewPanes, ViewToggle } from "@/features/decide/components/view-toggle";
import { decideLinks } from "@/features/decide/lib/links";
import { specialtyName } from "@/features/decide/lib/specialty-search";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import type { ResidentsQuery } from "@/features/decide/residents-search";
import { canSeeResidents } from "@/features/decide/server/residents";
import { listResidentsAll, RESIDENTS_MAX_PAGE, residentColleges, residentQuota, residentYears, ResidentsDenied } from "@/features/decide/server/residents-all";
import { chosenView } from "@/features/decide/server/view";
import { getDecideData, getMeta } from "@/features/decide/service";
import { hideResidentAction } from "../institutes/[slug]/actions";
import { findResidentColleges } from "./actions";

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
    <PageHead title="Residents" about={about}>Who got in where, from MCC&apos;s admitted-candidates lists. Contact people respectfully; ask to be hidden and we will.</PageHead>
  );

  const denied = (why: "locked" | "rate_limited") => (
    <AppPage className="grid grid-cols-1 gap-4">
      {head()}
      {why === "locked" ? (
        <EmptyState title="Sign in to see residents" description="Names are shown only to the signed-in, invited account." href={L.to("/decide/institutes")} action="See the institutes" />
      ) : (
        <EmptyState title="Too many requests" description="Residents were opened too many times from this network or account. Try again in an hour, or tomorrow." href={L.to("/decide/institutes")} action="See the institutes" />
      )}
    </AppPage>
  );
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
  const quotas = [...new Set(meta.quotas.map(residentQuota))];
  const courseName = (slug: string) => {
    const c = meta.courses.find((x) => x.slug === slug);
    return c ? `${c.degree} ${c.name}` : slug;
  };
  const collegeName = (slug: string) => pickedColleges.find((c) => c.slug === slug)?.name ?? slug;
  const typedCourses = !allCourses && params.has("course") ? query.course ?? [] : [];
  const listed = (what: string, names: string[]) => (names.length > 2 ? `${what}: ${names.length} selected` : names.join(", "));
  const chips = [
    query.q && { label: `Search: “${query.q}”`, href: here({ q: null }) },
    picked.length > 0 && { label: listed("Colleges", picked.map(collegeName)), href: here({ college: null }) },
    query.cq && { label: `College: “${query.cq}”`, href: here({ cq: null }) },
    // Her courses are the default: a chip for them too, "All courses" lifts it.
    allCourses ? { label: "All courses", href: here({ course: null }) } : typedCourses.length ? { label: listed("Courses", typedCourses.map(courseName)), href: here({ course: null }) } : yours && { label: `Your courses (${yours.length})`, href: here({ course: "all" }) },
    query.state && { label: query.state, href: here({ state: null }) },
    query.year && { label: String(query.year), href: here({ year: null }) },
    query.quota && { label: residentQuota(query.quota), href: here({ rq: null }) },
    query.sort !== "year" && { label: `Sorted by ${sorts.find((s) => s.value === query.sort)!.label.toLowerCase()}`, href: here({ sort: null }) },
  ].filter((x) => !!x);
  const clear = L.to("/decide/residents", { course: "all" });
  const courseChoices = [
    ...(yours ? [{ value: "all", label: "All courses" }] : []),
    ...meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${specialtyName(c.name)}` })),
  ];
  return (
    <AppPage className="grid grid-cols-1 gap-4">
      {head(<ResidentsAbout />)}

      {/* Filters, the count and the results tools on one row (globals.css .filter-row); chips and notes under it. */}
      <div className="filter-row">
      <FilterBar
        action="/decide/residents"
        params={params}
        cols="md:grid-cols-3"
        active={chips.length}
        clear={clear}
        search={
          <label className="min-w-0 flex-1 basis-32 md:min-w-56">
            <span className="sr-only">Name or college</span>
            <input type="search" name="q" defaultValue={query.q} maxLength={60} placeholder="Search a name or college" className={control} />
          </label>
        }
      >
        <FilterDropdown label="College (hospital)" name="college" find={findResidentColleges} findName="cq" options={pickedColleges.map((c) => ({ value: c.slug, label: c.state ? `${c.name}, ${c.state}` : c.name }))} selected={picked} none="All colleges" noneNote="None ticked means every college. Type 2 or more letters of a name to find one; tick one or more." />
        <FilterDropdown label="Course (branch)" name="course" search options={courseChoices} selected={allCourses ? ["all"] : typedCourses} none={yours ? `Your courses (${yours.length})` : "All courses"} noneNote={yours ? "None ticked means your courses. Tick All courses for every one." : "None ticked means every course."} />
        <Field label="State"><Select name="state" value={query.state} all="All states" options={meta.states.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="Year"><Select name="year" value={query.year ? String(query.year) : undefined} all="All years" options={years.map((y) => ({ value: String(y), label: String(y) }))} /></Field>
        <Field label="Quota"><Select name="rq" value={query.quota && residentQuota(query.quota)} all="All quotas" options={quotas.map((q) => ({ value: q, label: q }))} /></Field>
        <Field label="Sort by"><Select name="sort" value={query.sort} options={sorts} /></Field>
      </FilterBar>
      <ActiveFilters items={chips} clear={clear} />

      <div className={toolbarRow}>
        <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
          <span className="numeric font-semibold text-foreground">{formatRank(total)}</span> residents
        </p>
        {total > 0 && <ViewToggle page="residents" view={view} />}
      </div>
      </div>

      {total === 0 ? (
        <EmptyState title="No residents match these filters" description="MCC's admitted-candidates lists have no such names, or they were hidden." href={clear} action="Clear filters" />
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
      <SourceRefs docs={residentDocs(rows, res.sources)} />
    </AppPage>
  );
}
