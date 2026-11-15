import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { residentsFilters, ResidentsCards, ResidentsInfo, ResidentsSources, ResidentsTable } from "@/features/decide/components/residents-results";
import { control, EmptyState, Field, FilterBar, Pager, Select, smallLink } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import type { ResidentsQuery } from "@/features/decide/residents-search";
import { canSeeResidents } from "@/features/decide/server/residents";
import { listResidentsAll, RESIDENTS_MAX_PAGE, residentQuota, residentYears, ResidentsDenied } from "@/features/decide/server/residents-all";
import { getDecideData, getMeta } from "@/features/decide/service";
import { cn } from "@/lib/cn";
import { hideResidentAction } from "../institutes/[slug]/actions";

// People's names: never indexed.
export const metadata: Metadata = { title: "Residents", robots: { index: false, follow: false } };

const sorts = [
  { value: "rank", label: "Rank" },
  { value: "name", label: "Name" },
  { value: "year", label: "Year" },
  { value: "college", label: "College" },
] satisfies { value: ResidentsQuery["sort"]; label: string }[];

export default async function ResidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const here = (changes: Record<string, string | null>) => L.with("/decide/residents", { page: null, ...changes });
  const head = <PageHead title="Residents">Who got in where: names from MCC&apos;s admitted-candidates lists, across every college, with the rank where known. For choosing a college. Contact people respectfully; ask to be hidden and we will.</PageHead>

  const denied = (why: "locked" | "rate_limited") => (
    <AppPage className="grid grid-cols-1 gap-6">
      {head}
      {why === "locked" ? (
        <EmptyState title="Sign in to see residents" description="Names are shown only to the signed-in, invited account." href={L.to("/decide/institutes")} action="See the institutes" />
      ) : (
        <EmptyState title="Too many requests" description="Residents were opened too many times from this network or account. Try again in an hour, or tomorrow." href={L.to("/decide/institutes")} action="See the institutes" />
      )}
    </AppPage>
  );
  if (!(await canSeeResidents())) return denied("locked");

  const profile = profileFromParams(params);
  const [meta, { colleges }, years] = await Promise.all([getMeta(), getDecideData(), residentYears()]);
  const { query, yours, courseValue, around } = residentsFilters(params, profile, meta.courses);
  const college = colleges.find((c) => c.slug === query.college);
  // A college outside the state picked after it: the state wins (Apply keeps the old college field).
  if (college && query.state && college.state !== query.state) query.college = undefined;
  const state = query.state ?? (query.college ? college?.state ?? undefined : undefined);
  const inState = state ? colleges.filter((c) => c.state === state).sort((a, b) => a.name.localeCompare(b.name)) : [];
  // The search checks access again and spends one read of the budget.
  const res = await listResidentsAll(query).catch((e) => {
    if (e instanceof ResidentsDenied) return e.code;
    throw e;
  });
  if (typeof res === "string") return denied(res);
  const { rows, total, withRank } = res;
  // Past the last page (a stale link, a hide) or the deepest one served: the last page there is.
  const pages = Math.min(Math.ceil(total / res.pageSize), RESIDENTS_MAX_PAGE);
  if (!rows.length && total) redirect(L.page("/decide/residents", pages));
  const asked = params.get("view");
  const view = asked === "table" || asked === "cards" ? asked : null;
  // Her default range stays a default: empty fields (it shows as their placeholders) and no `ranks=all`, so Apply keeps it.
  const rankInput = (name: "rankFrom" | "rankTo", example: string) => ({
    name,
    inputMode: "numeric" as const,
    defaultValue: around ? "" : query[name] ?? "",
    placeholder: around ? formatRank(around[name]) : example,
    className: `${control} numeric`,
  });
  const { rankFrom: from, rankTo: to } = query;
  const ranks = from != null && to != null ? `${formatRank(from)}–${formatRank(to)}` : from != null ? `from ${formatRank(from)}` : to != null ? `up to ${formatRank(to)}` : null;
  const quotas = [...new Set(meta.quotas.map(residentQuota))];
  // No `view`: the table from md up, cards on phones, so each width gets its own nav saying which one is shown.
  const viewNav = (shown: "table" | "cards", className?: string) => (
    <nav aria-label="Show residents as" className={cn("flex", className)}>
      {(["table", "cards"] as const).map((v) => (
        <Link
          key={v}
          href={here({ view: v, page: params.get("page") })}
          scroll={false}
          aria-current={shown === v ? "true" : undefined}
          className={cn("inline-flex min-h-11 items-center border-b-2 px-3 text-sm", shown === v ? "border-foreground font-semibold" : "border-transparent text-muted-foreground")}
        >
          {v === "table" ? "Table" : "Cards"}
        </Link>
      ))}
    </nav>
  );

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      {head}

      <FilterBar action="/decide/residents" params={params} cols="grid-cols-2 md:grid-cols-4 xl:grid-cols-6" more={!!(query.college || query.year || query.quota || query.hasRank || query.sort !== "rank")}>
        {/* Apply states the rank range (both fields empty then means all ranks), except from her default, which it keeps. */}
        {!around && <input type="hidden" name="ranks" value="all" />}
        {view && <input type="hidden" name="view" value={view} />}
        <Field label="Name" className="col-span-2"><input type="search" name="q" defaultValue={query.q} maxLength={60} placeholder="Part of a name" className={control} /></Field>
        <Field label="Course" className="col-span-2">
          <Select
            name="course"
            value={courseValue}
            options={[
              ...(yours ? [{ value: "", label: `Your courses (${yours.length})` }, { value: "all", label: "All courses" }] : [{ value: "", label: "All courses" }]),
              ...meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` })),
            ]}
          />
        </Field>
        <Field label="State"><Select name="state" value={query.state} all="All states" options={meta.states.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="College" className="more-filter">
          {inState.length ? (
            <Select name="college" value={query.college} all="All colleges" options={inState.map((c) => ({ value: c.slug, label: c.name }))} />
          ) : (
            <select disabled className={control}><option>Pick a state first</option></select>
          )}
        </Field>
        <Field label="Rank from"><input {...rankInput("rankFrom", "e.g. 30,000")} /></Field>
        <Field label="Rank to"><input {...rankInput("rankTo", "e.g. 50,000")} /></Field>
        <Field label="Year" className="more-filter"><Select name="year" value={query.year ? String(query.year) : undefined} all="All years" options={years.map((y) => ({ value: String(y), label: String(y) }))} /></Field>
        <Field label="Quota" className="more-filter"><Select name="rq" value={query.quota && residentQuota(query.quota)} all="All quotas" options={quotas.map((q) => ({ value: q, label: q }))} /></Field>
        <Field label="Sort by" className="more-filter"><Select name="sort" value={query.sort} options={sorts} /></Field>
        <label className="more-filter flex min-h-11 items-center gap-2 text-sm md:self-end">
          <input type="checkbox" name="hasRank" value="1" defaultChecked={query.hasRank} className="size-5 accent-sky" />
          Only with a known rank
        </label>
      </FilterBar>

      {(ranks || college) && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          {college && query.college && (
            <span>At <Link href={L.to(`/decide/institutes/${college.slug}`, { tab: "residents" })} className={cn(smallLink, "font-semibold text-sky")}>{college.name}</Link></span>
          )}
          {ranks && <span>Ranks <span className="numeric font-semibold text-foreground">{ranks}</span>{around && ", around your rank (±20%)"}</span>}
          {ranks && <Link href={here({ rankFrom: null, rankTo: null, ranks: "all" })} scroll={false} className={cn(smallLink, "text-sky")}>All ranks</Link>}
        </p>
      )}

      <div className="relative flex flex-wrap items-center justify-between gap-x-3">
        <div className="flex items-center gap-1">
          <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
            <span className="numeric font-semibold text-foreground">{formatRank(total)}</span> residents · rank known for <span className="numeric font-semibold text-foreground">{formatRank(withRank)}</span>
          </p>
          <ResidentsInfo rows={rows} />
        </div>
        {total > 0 && (view ? viewNav(view) : <>{viewNav("table", "max-md:hidden")}{viewNav("cards", "md:hidden")}</>)}
      </div>

      {total === 0 ? (
        <EmptyState
          title="No residents match these filters"
          description={ranks ? "A rank range leaves out everyone without a known rank: try All ranks." : "MCC's admitted-candidates lists have no such names, or they were hidden."}
          href={ranks ? here({ rankFrom: null, rankTo: null, ranks: "all" }) : L.to("/decide/residents", { course: "all", ranks: "all" })}
          action={ranks ? "All ranks" : "Clear filters"}
        />
      ) : (
        <>
          {/* No `view`: the table from md up, cards on phones (both in the HTML, one shown). */}
          {view !== "cards" && (
            <ResidentsTable rows={rows} L={L} hide={hideResidentAction} caption={`Residents, page ${res.page}, sorted by ${query.sort === "rank" ? "rank, unknown last" : sorts.find((s) => s.value === query.sort)!.label.toLowerCase()}`} className={view ? undefined : "hidden md:block"} />
          )}
          {view !== "table" && <ResidentsCards rows={rows} L={L} hide={hideResidentAction} className={view ? undefined : "md:hidden"} />}
        </>
      )}
      <Pager page={res.page} pageSize={res.pageSize} total={Math.min(total, pages * res.pageSize)} href={(n) => L.page("/decide/residents", n)} focusId="results" label="Residents" />
      {total > pages * res.pageSize && (
        <p className="-mt-3 text-center text-sm text-muted-foreground">
          Only the first <span className="numeric">{formatRank(pages * res.pageSize)}</span> ({pages} pages) are shown: narrow the filters (name, course, state, year or rank) to see the others.
        </p>
      )}
      <ResidentsSources rows={rows} sources={res.sources} />
    </AppPage>
  );
}
