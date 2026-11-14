import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { HISTORY_CAPTION, PageHead, SetRankPrompt } from "@/features/decide/components/bits";
import { DataSource } from "@/features/decide/components/data-source";
import { FilterDropdown } from "@/features/decide/components/filter-dropdown";
import { FocusItem } from "@/features/decide/components/focus-item";
import { OptionsTable } from "@/features/decide/components/options-view";
import { control } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { reachLabel, reachOrder, type Reach } from "@/features/decide/lib/reach";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, listOptions } from "@/features/decide/service";

export const metadata: Metadata = { title: "Options" };
const PAGE = 50;

export default async function OptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  if (!profile) return <AppPage><PageHead title="Options" /><SetRankPrompt path="/decide/options" /></AppPage>;

  const meta = await getMeta();
  const reach = reachOrder.includes(params.get("reach") as Reach) ? (params.get("reach") as Reach) : undefined;
  const includeProvisional = params.get("prov") !== "0";
  const showClosed = params.get("closed") === "1";
  const search = params.get("q") ?? "";
  const limit = Math.max(PAGE, Number(params.get("limit")) || PAGE);
  const { rows, hiddenClosed } = await listOptions(profile, { search, reach: reach ? [reach] : undefined, includeProvisional, showClosed });
  const { rows: everything } = await listOptions(profile, { search, includeProvisional, showClosed: true });
  const counts = Object.fromEntries(reachOrder.map((r) => [r, everything.filter((x) => x.reach === r).length]));
  const shown = rows.slice(0, limit);
  const L = decideLinks(params);

  const link = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    return `/decide/options?${p}`;
  };
  const caption = `Options for AIR ${formatRank(profile.rank)} (${profile.category}${profile.pwd ? " PwD" : ""})`;
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-input"}`;

  return (
    <AppPage className="grid gap-5">
      <PageHead title="Options">
        Every institute and course in your profile, labelled by how your rank compares with past closing ranks in the seat categories you can take.
      </PageHead>

      {/* One compact filter row: the profile filters are URL params, so this visit can differ from the saved profile. */}
      <Form key={params.toString()} action="/decide/options" role="search" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        {["rank", "cat", "pwd", "reach", "closed"].map((k) => params.get(k) && <input key={k} type="hidden" name={k} value={params.get(k)!} />)}
        <label className="grid min-w-56 flex-1 gap-1 text-sm">
          <span className="sr-only">Search</span>
          <input name="q" defaultValue={search} placeholder="Search institute, state or course" className={control} />
        </label>
        <FilterDropdown label="Course" name="sp" options={meta.specialties.map((s) => ({ value: s.code, label: s.name }))} selected={profile.specialties} />
        <FilterDropdown label="Degree" name="deg" options={meta.degrees.map((d) => ({ value: d, label: d }))} selected={profile.degrees} />
        <FilterDropdown label="Quota" name="quota" options={meta.quotas.map((q) => ({ value: q, label: q }))} selected={profile.quotas} />
        <FilterDropdown label="State" name="st" options={meta.states.map((s) => ({ value: s, label: s }))} selected={profile.states} />
        <label className="grid gap-1 text-sm">
          <span className="sr-only">Max fee per year</span>
          <select name="fee" defaultValue={profile.maxFeeLakh ?? ""} className="h-11 rounded-md border border-input bg-card px-3 text-sm">
            <option value="">Any fee</option>
            {[2, 5, 10, 20, 30].map((l) => <option key={l} value={l}>Fee up to ₹{l} L</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="sr-only">Max bond</span>
          <select name="bond" defaultValue={profile.maxBondYears ?? ""} className="h-11 rounded-md border border-input bg-card px-3 text-sm">
            <option value="">Any bond</option>
            <option value="0">No bond</option>
            {[1, 2, 3].map((y) => <option key={y} value={y}>Bond up to {y} {y === 1 ? "yr" : "yrs"}</option>)}
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 px-1 text-sm">
          <input type="checkbox" name="prov" value="0" defaultChecked={!includeProvisional} className="size-4 accent-sky" />
          Ignore provisional 2026 R1
        </label>
        <Button type="submit">Apply</Button>
      </Form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by reach" className="flex flex-wrap gap-2">
          <Link href={link({ reach: null })} aria-current={!reach ? "true" : undefined} className={chip(!reach)}>
            All <span className="font-semibold">{everything.length}</span><span className="sr-only"> options</span>
          </Link>
          {reachOrder.filter((r) => counts[r] > 0).map((r) => (
            <Link key={r} href={link({ reach: r, closed: r === "closed-before" ? "1" : null })} aria-current={reach === r ? "true" : undefined} className={chip(reach === r)}>
              {reachLabel(r, 2026, [2024, 2025])} <span className="font-semibold">{counts[r]}</span><span className="sr-only"> options</span>
            </Link>
          ))}
        </nav>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{rows.length}</span> shown
          {hiddenClosed > 0 && <> · <Link href={link({ closed: "1" })} className="text-sky underline">show {hiddenClosed} closed before your rank</Link></>}
        </p>
      </div>

      {shown.length ? (
        <OptionsTable rows={shown} caption={caption} start={0} L={L} />
      ) : (
        <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="font-medium">No options match.</p>
          <Link href={link({ q: null, reach: null, closed: "1" })} className="text-sm text-sky underline">Clear search and labels</Link>
        </div>
      )}

      {rows.length > limit && (
        <div className="text-center">
          <Button asChild variant="secondary"><Link href={link({ limit: String(limit + PAGE), focus: String(limit + 1) })} scroll={false}>Show more</Link></Button>
        </div>
      )}
      <FocusItem n={Number(params.get("focus")) || null} />

      <div className="grid gap-2 text-xs text-muted-foreground">
        <p>{HISTORY_CAPTION}</p>
        <p>Closing = highest All India Rank allotted in that round on a seat of that category. Bracketed numbers are allotments made that round, all categories, not the seat matrix.</p>
        <DataSource />
      </div>
    </AppPage>
  );
}
