import type { Metadata } from "next";
import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { HISTORY_CAPTION, PageHead, Provisional, SetRankPrompt } from "@/features/decide/components/bits";
import { ChartCard, LabelBars, RankStrip, RoundTrend } from "@/features/decide/components/charts";
import { ChoicesStat, TopChoices } from "@/features/decide/components/dashboard-parts";
import { DataSource } from "@/features/decide/components/data-source";
import { MCC_PG } from "@/features/decide/components/pages/mcc-link";
import { RoundStatusBanner } from "@/features/decide/components/round-status";
import { smallLink, StatStrip } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { eligibleCategories, reachLabel, reachOrder, reachWindow } from "@/features/decide/lib/reach";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { dashboard, getMeta, getNotices, LATEST_YEAR, PAST_YEARS, type StripPoint } from "@/features/decide/service";
import { roundLabel } from "@/features/decide/types";

export const metadata: Metadata = { title: "Overview" };
const label = (r: (typeof reachOrder)[number]) => reachLabel(r, LATEST_YEAR, PAST_YEARS);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** A summary closing with the option it comes from: a closing is never shown without its seat category. */
function At({ p }: { p: StripPoint | null }) {
  if (!p) return <>{formatRank(null)}</>;
  return (
    <>
      {formatRank(p.closing)}
      <span className="block text-xs text-muted-foreground">{p.category}, {roundLabel[p.round]}, {p.quota}</span>
    </>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  if (!profile) return <AppPage><PageHead title="Overview" /><SetRankPrompt path="/decide" /></AppPage>;

  const [d, notices, meta] = await Promise.all([dashboard(profile), getNotices(), getMeta()]);
  const L = decideLinks(params);
  const schedule = notices.filter((n) => n.kind === "schedule").sort((a, b) => a.date.localeCompare(b.date));
  // Round status only from a real MCC announcement; none loaded → nothing shown.
  const open = notices.find((n) => n.kind === "announcement" && n.status === "open");
  const reached = d.counts["reached-latest"] + d.counts["reached-both"] + d.counts["reached-one"];
  const latestR1 = meta.sources.find((s) => s.year === LATEST_YEAR && s.round === "R1");
  const seats = eligibleCategories(profile.category, profile.pwd).join(" or ");

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageHead title="Overview" />
          <p className="mt-1 text-muted-foreground">AIR <span className="numeric">{formatRank(profile.rank)}</span>, {profile.category}{profile.pwd ? " PwD" : ""}. Closing ranks below are on {seats} seats, the seat categories you can take.</p>
        </div>
        {open && (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span className="size-2 rounded-full bg-leaf" aria-hidden />
            <strong className="font-semibold">{open.title}</strong>
            <a href={open.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>MCC notice<span className="sr-only"> (opens in a new tab)</span></a>
          </p>
        )}
      </div>
      <RoundStatusBanner params={params} />

      <section aria-label="Your options in numbers" className="grid gap-2">
        <StatStrip
          items={[
            { label: "Options in your profile", value: formatRank(d.total), note: `${formatRank(d.summary.length)} ${d.summary.length === 1 ? "course" : "courses"} (degree and specialty), ${formatRank(d.counts["closed-before"])} closed before your rank` },
            {
              label: "Reached your rank in a past round",
              value: formatRank(reached),
              note: (
                <span className="inline-flex flex-wrap items-center gap-x-1.5">
                  <Link href={L.options({ reach: "reached-latest" })} className={smallLink}>{formatRank(d.counts["reached-latest"])} of them in {LATEST_YEAR} R1</Link>
                  <Provisional when={latestR1?.provisional} />
                </span>
              ),
            },
            { label: "Within 10% in a past round", value: formatRank(d.counts["within-10"]), note: <Link href={L.options({ reach: "within-10" })} className={smallLink}>Closed just before your rank: see them</Link> },
          ]}
        >
          <ChoicesStat />
        </StatStrip>
        <DataSource used={[{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR, round: "R1" }]} />
      </section>

      <ChartCard
        source={<DataSource used={[{ year: 2025 }]} />}
        className="chart-paper"
        title="Where your rank sits"
        subtitle={`Each dot is one option's deepest closing rank in 2025, on ${seats} seats. Dots at or right of your line closed at or after your rank.${d.strip.length < d.summary.length ? ` The ${d.strip.length} courses with the most options are drawn; the table lists all ${d.summary.length}.` : ""}`}
        legend={
          <>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-mark" />Closed at or after your rank in 2025</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground/60" />Closed before your rank</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-foreground" />Your rank</span>
          </>
        }
        table={
          <table className="w-full text-sm">
            <caption className="sr-only">2025 deepest closing ranks of your options, on {seats} seats, by course</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2">Course</th>
                <th scope="col" className="text-right">Options</th>
                <th scope="col" className="text-right">At or after your rank</th>
                <th scope="col" className="text-right">Before your rank</th>
                <th scope="col" className="text-right">Deepest closing</th>
                <th scope="col" className="text-right">Median</th>
                <th scope="col" className="text-right">Shallowest</th>
              </tr>
            </thead>
            <tbody>
              {d.summary.map((s) => (
                <tr key={s.course.slug} className="border-b border-border">
                  <th scope="row" className="py-1.5 text-left font-normal">{s.course.degree} {s.course.name}</th>
                  <td className="numeric text-right">{formatRank(s.options)}</td>
                  <td className="numeric text-right">{formatRank(s.reached)}</td>
                  <td className="numeric text-right">{formatRank(s.closedBefore)}</td>
                  <td className="numeric text-right"><At p={s.deepest} /></td>
                  <td className="numeric text-right">{formatRank(s.median)}</td>
                  <td className="numeric text-right"><At p={s.shallowest} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <RankStrip rank={profile.rank} rows={d.strip.map((r) => ({ course: `${r.course.degree} ${r.course.name}`, points: r.points }))} />
        <p className="mt-2 text-xs text-muted-foreground">
          {d.strip.length < d.summary.length && "Tick courses in your profile to choose which are drawn. "}
          Every option, with its round and seat category, is on <Link href={L.options({ closed: true })} className={`${smallLink} text-sky`}>Options</Link>.
        </p>
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.4fr]">
        <ChartCard
          source={<DataSource used={[{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR, round: "R1" }]} />}
          title="Options by label"
          subtitle={`From closing ranks in ${reachWindow(LATEST_YEAR, PAST_YEARS)} only; older years are not counted. Select a label to see those options.`}
          table={
            <table className="w-full text-sm">
              <caption className="sr-only">Options by label</caption>
              <tbody>{reachOrder.map((r) => <tr key={r} className="border-b border-border"><th scope="row" className="py-1.5 text-left font-normal">{label(r)}</th><td className="numeric text-right">{formatRank(d.counts[r])}</td></tr>)}</tbody>
            </table>
          }
        >
          <LabelBars rows={reachOrder.filter((r) => r !== "no-data" || d.counts[r] > 0).map((r) => ({ label: label(r), count: d.counts[r], href: L.options({ reach: r, closed: true }), accent: r.startsWith("reached") }))} />
        </ChartCard>

        <ChartCard
          source={<DataSource used={[{ year: 2025 }]} />}
          title="How closing ranks moved through 2025"
          subtitle={`Median closing rank per round across your options, on ${seats} seats, in 2025.${d.trend.length < d.summary.length ? ` The ${d.trend.length} courses with the most options.` : ""}`}
          table={
            <table className="w-full text-sm">
              <caption className="sr-only">Median 2025 closing rank by round, on {seats} seats</caption>
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-2">Course</th>{["R1", "R2", "R3", "Stray"].map((r) => <th key={r} scope="col" className="text-right">{r}</th>)}</tr></thead>
              <tbody>{d.trend.map((t) => <tr key={t.course.slug} className="border-b border-border"><th scope="row" className="py-1.5 text-left font-normal">{t.course.degree} {t.course.name}</th>{t.points.map((p) => <td key={p.round} className="numeric text-right">{formatRank(p.median)}</td>)}</tr>)}</tbody>
            </table>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {d.trend.map((t) => <RoundTrend key={t.course.slug} title={`${t.course.degree} ${t.course.name}`} href={L.lastRanks(t.course.slug)} rank={profile.rank} points={t.points} />)}
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="timeline" className="rounded-xl border border-border bg-card p-5">
          <h2 id="timeline" className="text-base font-semibold">Counselling dates</h2>
          {schedule.length ? (
            <ol className="mt-4 grid gap-0">
              {schedule.map((n, i) => (
                <li key={n.title} className="grid grid-cols-[1.25rem_1fr] gap-3">
                  <span className="flex flex-col items-center" aria-hidden>
                    <span className="mt-1.5 size-3 rounded-full border-2 border-input bg-card" />
                    {i < schedule.length - 1 && <span className="w-px flex-1 bg-border" />}
                  </span>
                  <span className="pb-4">
                    <span className="block text-sm font-medium">{n.title}</span>
                    <span className="numeric block text-xs text-muted-foreground">{fmtDate(n.date)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Every round&apos;s dates and status, each from its MCC notice, are on <Link href={L.to("/decide/counselling")} className={`${smallLink} text-sky`}>Schedule &amp; notices</Link>. MCC may change them: check the{" "}
              <a href={MCC_PG} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>MCC PG counselling site<span className="sr-only"> (opens in a new tab)</span></a>.
            </p>
          )}
        </section>
        <TopChoices />
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground">
        <p>{HISTORY_CAPTION}</p>
        <DataSource />
      </div>
    </AppPage>
  );
}
