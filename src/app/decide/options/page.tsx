import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { DataSource } from "@/features/decide/components/data-source";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { HISTORY_CAPTION, PageHead, SetRankPrompt } from "@/features/decide/components/bits";
import { OptionsTable } from "@/features/decide/components/options-view";
import { reachLabel, reachOrder, type Reach } from "@/features/decide/lib/reach";
import { decideLinks } from "@/features/decide/lib/links";
import { profileFromParams, profileParamKeys, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, listOptions } from "@/features/decide/service";
import { FocusItem } from "@/features/decide/components/focus-item";

export const metadata: Metadata = { title: "Options" };
const PAGE = 50;

export default async function OptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  if (!profile) return <Container className="py-10"><PageHead title="Options" /><SetRankPrompt path="/decide/options" /></Container>;

  const reach = reachOrder.includes(params.get("reach") as Reach) ? (params.get("reach") as Reach) : undefined;
  const includeProvisional = params.get("prov") !== "0";
  const showClosed = params.get("closed") === "1";
  const search = params.get("q") ?? "";
  const limit = Math.max(PAGE, Number(params.get("limit")) || PAGE);
  const meta = await getMeta();
  const { rows, hiddenClosed } = await listOptions(profile, { search, reach: reach ? [reach] : undefined, includeProvisional, showClosed });
  const shown = rows.slice(0, limit);
  const L = decideLinks(params);
  const { rows: everything } = await listOptions(profile, { search, includeProvisional, showClosed: true });
  const counts = Object.fromEntries(reachOrder.map((r) => [r, everything.filter((x) => x.reach === r).length]));

  const link = (changes: Record<string, string | null>, hash = "") => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    return `/decide/options?${p}${hash}`;
  };
  const caption = `Options for AIR ${formatRank(profile.rank)} (${profile.category}${profile.pwd ? " PwD" : ""})`;

  return (
    <Container className="py-10">
      <PageHead title="Options">
        Every institute and course in your profile, labelled by how your rank compares with past closing ranks in the seat categories you can take.
      </PageHead>

      <div className="mt-8 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <details className="group rounded-xl border border-border bg-card lg:hidden" open={false}>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-semibold">Filter by course, quota, state, fee and bond</summary>
        <div className="border-t border-border p-4"><ProfileFilters params={params} meta={meta} profile={profile} idPrefix="m" /></div>
      </details>
      <aside aria-label="Option filters" className="hidden lg:block">
        <div className="sticky top-24 rounded-xl border border-border bg-card p-4"><ProfileFilters params={params} meta={meta} profile={profile} idPrefix="d" /></div>
      </aside>
      <div className="min-w-0">
      <Form key={params.toString()} action="/decide/options" role="search" className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
        {profileParamKeys.map((k) => params.getAll(k).map((v, i) => <input key={`${k}${i}`} type="hidden" name={k} value={v} />))}
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Search</span>
          <input name="q" defaultValue={search} placeholder="Institute, state or course" className="h-11 rounded-md border border-input bg-background px-3" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Reach</span>
          <select name="reach" defaultValue={reach ?? ""} className="h-11 rounded-md border border-input bg-background px-3">
            <option value="">All labels</option>
            {reachOrder.map((r) => <option key={r} value={r}>{reachLabel(r, 2026, [2024, 2025])}</option>)}
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="prov" value="0" defaultChecked={!includeProvisional} className="accent-sky" />
          Ignore provisional 2026 R1
        </label>
        <Button type="submit" className="h-11">Apply</Button>
      </Form>

      <nav aria-label="Filter by reach" className="mt-6 flex flex-wrap gap-2">
        <Link href={link({ reach: null })} aria-current={!reach ? "true" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${!reach ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input"}`}>
          All <span className="font-semibold">{everything.length}</span><span className="sr-only"> options</span>
        </Link>
        {reachOrder.filter((r) => counts[r] > 0).map((r) => (
          <Link key={r} href={link({ reach: r, closed: r === "closed-before" ? "1" : null })} aria-current={reach === r ? "true" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${reach === r ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input"}`}>
            {reachLabel(r, 2026, [2024, 2025])} <span className="font-semibold">{counts[r]}</span><span className="sr-only"> options</span>
          </Link>
        ))}
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          <span className="numeric text-foreground">{rows.length}</span> options{reach ? ` labelled “${reachLabel(reach, 2026, [2024, 2025])}”` : ""}.
        </p>
        {hiddenClosed > 0 && (
          <Link href={link({ closed: "1" })} className="rounded-full border border-input bg-secondary px-3 py-1.5 text-sm text-muted-foreground hover:bg-raised">
            Hiding <span className="numeric">{hiddenClosed}</span> “Closed before your rank” · Show
          </Link>
        )}
      </div>

      <div className="mt-4">
        {shown.length ? (
          <OptionsTable rows={shown} caption={caption} start={0} L={L} />
        ) : (
          <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <p className="font-medium">No options match.</p>
            <Link href={link({ q: null, reach: null, closed: "1" })} className="text-sm text-sky underline">Clear filters</Link>
          </div>
        )}
      </div>

      {rows.length > limit && (
        <div className="mt-6 text-center">
          <Button asChild variant="secondary"><Link href={link({ limit: String(limit + PAGE), focus: String(limit + 1) })} scroll={false}>Show more</Link></Button>
        </div>
      )}

      <FocusItem n={Number(params.get("focus")) || null} />
      </div>
      </div>
      <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
        <p>{HISTORY_CAPTION}</p>
        <p>Closing = highest All India Rank allotted in that round on a seat of that category. Bracketed numbers are allotments made that round, not the seat matrix.</p>
        <DataSource />
      </div>
    </Container>
  );
}

/** Course, degree, quota, state, fee and bond filters: the profile params themselves (URL overrides the saved profile). */
function ProfileFilters({ params, meta, profile, idPrefix }: { params: URLSearchParams; meta: Awaited<ReturnType<typeof getMeta>>; profile: NonNullable<ReturnType<typeof profileFromParams>>; idPrefix: string }) {
  const group = (legend: string, name: string, options: { value: string; label: string }[], selected: string[]) => (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-xs font-semibold text-muted-foreground">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex min-h-11 items-center gap-2 text-sm lg:min-h-9">
          <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} className="size-4 accent-sky" id={`${idPrefix}-${name}-${o.value}`} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
  return (
    <Form key={params.toString()} action="/decide/options" className="grid gap-5">
      {["rank", "cat", "pwd", "q", "reach", "prov", "closed"].map((k) => params.get(k) && <input key={k} type="hidden" name={k} value={params.get(k)!} />)}
      {group("Course", "sp", meta.specialties.map((s) => ({ value: s.code, label: s.name })), profile.specialties)}
      {group("Degree", "deg", meta.degrees.map((d) => ({ value: d, label: d })), profile.degrees)}
      {group("Quota", "quota", meta.quotas.map((q) => ({ value: q, label: q })), profile.quotas)}
      {group("State", "st", meta.states.map((q) => ({ value: q, label: q })), profile.states)}
      <label className="grid gap-1.5 text-sm"><span className="text-xs font-semibold text-muted-foreground">Max fee per year</span>
        <select name="fee" defaultValue={profile.maxFeeLakh ?? ""} className="h-11 rounded-md border border-input bg-card px-3"><option value="">Any</option>{[2, 5, 10, 20, 30].map((l) => <option key={l} value={l}>Up to ₹{l} L</option>)}</select>
      </label>
      <label className="grid gap-1.5 text-sm"><span className="text-xs font-semibold text-muted-foreground">Max bond</span>
        <select name="bond" defaultValue={profile.maxBondYears ?? ""} className="h-11 rounded-md border border-input bg-card px-3"><option value="">Any</option><option value="0">No bond</option>{[1, 2, 3].map((y) => <option key={y} value={y}>Up to {y} {y === 1 ? "year" : "years"}</option>)}</select>
      </label>
      <p className="text-xs text-muted-foreground">None ticked means all. These apply to this visit; Edit in the sidebar saves them.</p>
      <Button type="submit">Apply filters</Button>
    </Form>
  );
}
