import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { formatRank } from "@/features/cutoffs/lib/format";
import { HISTORY_CAPTION, PageHead, ReachBadge, SetRankPrompt } from "@/features/decide/components/bits";
import { ChoiceSummary } from "@/features/decide/components/choice-summary";
import { reachOrder } from "@/features/decide/lib/reach";
import { profileFromParams, profileToParams, toURLSearchParams } from "@/features/decide/profile";
import { getNotices, reachCounts } from "@/features/decide/service";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = profileFromParams(toURLSearchParams(await searchParams));
  if (!profile) return <Container className="py-10"><PageHead title="Decide" /><SetRankPrompt path="/decide" /></Container>;

  const [counts, notices] = await Promise.all([reachCounts(profile), getNotices()]);
  const open = notices.find((n) => n.kind === "schedule" && /open now/i.test(n.title));
  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ ...Object.fromEntries(profileToParams(profile)), ...extra })}`;

  return (
    <Container className="grid gap-8 py-10">
      <PageHead title="Decide">
        AIR <span className="numeric text-foreground">{formatRank(profile.rank)}</span> · {profile.category}{profile.pwd ? " PwD" : ""}. Your options, choice list and the counselling round, in one place.
      </PageHead>

      {open && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-sky/30 bg-sky/10 p-4 text-sm">
          <span className="rounded-sm bg-sky/20 px-2 py-0.5 text-xs font-medium text-sky">Open now</span>
          {open.title.replace(/\s*\(open now\)/i, "")} · {open.authority}.
          <a href={open.url} target="_blank" rel="noopener noreferrer" className="text-sky underline">Official schedule (opens MCC site)</a>
        </p>
      )}

      <section aria-labelledby="reach-h" className="rounded-xl border border-border bg-card p-6">
        <h2 id="reach-h" className="text-lg font-medium">Your options by past closing ranks</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reachOrder.map((r) => (
            <li key={r}>
              <Link href={`/decide/options${qs({ reach: r, closed: "1" })}`} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted">
                <ReachBadge reach={r} />
                <span className="numeric font-pixel text-2xl">{counts[r]}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">{HISTORY_CAPTION}</p>
      </section>

      <ChoiceSummary choicesHref={`/decide/choices${qs({})}`} />
    </Container>
  );
}
