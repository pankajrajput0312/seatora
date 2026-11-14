import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { DemoSource, HISTORY_CAPTION, PageHead, SetRankPrompt } from "@/features/decide/components/bits";
import { OptionsTable } from "@/features/decide/components/options-view";
import { reachLabel, reachOrder, type Reach } from "@/features/decide/lib/reach";
import { profileFromParams, profileParamKeys, toURLSearchParams } from "@/features/decide/profile";
import { listOptions } from "@/features/decide/service";

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
  const { rows, hiddenClosed } = await listOptions(profile, { search, reach: reach ? [reach] : undefined, includeProvisional, showClosed });
  const shown = rows.slice(0, limit);

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

      <Form action="/decide/options" role="search" className="mt-8 grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
        {profileParamKeys.map((k) => params.get(k) && <input key={k} type="hidden" name={k} value={params.get(k)!} />)}
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
        <p className="text-xs text-muted-foreground md:col-span-4">
          Courses, degrees, quotas, max fee and bond come from your profile. <Link href={link({ editProfile: "1" })} className="text-sky underline">Change them</Link>.
        </p>
      </Form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
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
          <OptionsTable rows={shown} caption={caption} start={0} />
        ) : (
          <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <p className="font-medium">No options match.</p>
            <Link href={link({ q: null, reach: null, closed: "1" })} className="text-sm text-sky underline">Clear filters</Link>
          </div>
        )}
      </div>

      {rows.length > limit && (
        <div className="mt-6 text-center">
          <Button asChild variant="secondary"><Link href={link({ limit: String(limit + PAGE) }, `#row-${limit + 1}`)}>Show more</Link></Button>
        </div>
      )}

      <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
        <p>{HISTORY_CAPTION}</p>
        <p>Closing = highest All India Rank allotted in that round on a seat of that category. Bracketed numbers are allotments made that round, not the seat matrix.</p>
        <DemoSource />
      </div>
    </Container>
  );
}
