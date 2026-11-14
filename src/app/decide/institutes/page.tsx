import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { PageHead, ReachBadge } from "@/features/decide/components/bits";
import { control, Empty, Field, FilterBar, profileOnly, Select } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, listInstitutes, type InstituteFilters } from "@/features/decide/service";

export const metadata: Metadata = { title: "Institutes" };
const sorts = [
  { value: "name", label: "Name" },
  { value: "allotments", label: "Most allotments (2025)" },
  { value: "beds", label: "Most beds" },
  { value: "established", label: "Oldest first" },
];

export default async function InstitutesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const L = decideLinks(params);
  const meta = await getMeta();
  const f: InstituteFilters = {
    search: params.get("q") ?? undefined,
    state: params.get("state") || undefined,
    type: params.get("type") || undefined,
    course: params.get("course") || undefined,
    sort: (sorts.find((s) => s.value === params.get("sort"))?.value ?? "name") as InstituteFilters["sort"],
  };
  const rows = await listInstitutes(profile, f);

  return (
    <AppPage className="grid gap-6 py-6">
      <PageHead title="Institutes">Every institute in the data: type, beds, courses offered and how many seats were allotted in 2025. Open one for its courses, allotments, fees and bond.</PageHead>

      <FilterBar action="/decide/institutes" params={params} cols="md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <Field label="Search"><input name="q" defaultValue={f.search} placeholder="Name or state" className={control} /></Field>
        <Field label="State"><Select name="state" value={f.state} all="All states" options={meta.states.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="Type"><Select name="type" value={f.type} all="All types" options={["Government", "Deemed", "Private", "DNB hospital"].map((t) => ({ value: t, label: t }))} /></Field>
        <Field label="Offers course"><Select name="course" value={f.course} all="Any course" options={meta.courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
        <Field label="Sort by"><Select name="sort" value={f.sort} options={sorts} /></Field>
      </FilterBar>

      <p aria-live="polite" className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{rows.length}</span> institutes</p>

      {rows.length === 0 ? (
        <Empty title="No institutes match these filters." href={profileOnly("/decide/institutes", params)} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
          {rows.map((r) => (
            <li key={r.college.key}>
              <article className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 size-5 shrink-0 text-sky" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold leading-snug"><Link href={L.institute(r.college.slug)} className="hover:text-sky hover:underline">{r.college.name}</Link></h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{r.college.state ?? "—"}, {r.college.type ?? "type not listed"}</p>
                  </div>
                  {profile && r.bestReach !== "no-data" && <ReachBadge reach={r.bestReach} />}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
                  <div><dt className="text-xs text-muted-foreground">Beds</dt><dd className="text-lg font-bold">{r.college.beds != null ? formatRank(r.college.beds) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Established</dt><dd className="text-lg font-bold">{r.college.established ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Allotments 2025</dt><dd className="text-lg font-bold">{r.allotments2025 ?? "—"}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {r.courses.map((c) => (
                    <Link key={c.slug} href={L.lastRanks(c.slug, { inst: r.college.slug })} className="rounded-md border border-border px-2 py-1 text-xs hover:border-sky hover:text-sky">
                      {c.degree} {c.name}
                    </Link>
                  ))}
                </div>
                <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-sm">
                  <Link href={L.institute(r.college.slug, "courses")} className="text-sky underline">Courses</Link>
                  <Link href={L.institute(r.college.slug, "allotments")} className="text-sky underline">Allotments</Link>
                  <Link href={L.institute(r.college.slug, "fees")} className="text-sky underline">Fees & bond</Link>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
      <DataSource />
    </AppPage>
  );
}
