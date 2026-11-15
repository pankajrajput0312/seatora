import type { Metadata } from "next";
import Link from "next/link";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { HistoryNote, PageHead, Provisional, SetRankPrompt } from "@/features/decide/components/bits";
import { ChartCard, LabelBars, RankStrip, RoundTrend } from "@/features/decide/components/charts";
import { ChoicesStat, TopChoices } from "@/features/decide/components/dashboard-parts";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { InfoTip } from "@/features/decide/components/info-tip";
import { RoundStatusBanner } from "@/features/decide/components/round-status";
import { EmptyState, smallLink, StatStrip } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { roundName } from "@/features/decide/lib/round-status";
import { termValueLabel } from "@/features/decide/lib/term-filters";
import { eligibleCategories, reachLabel, reachOrder, reachWindow } from "@/features/decide/lib/reach";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { dashboard, getMeta, LATEST_YEAR, listOptions, PAST_YEARS, type StripPoint } from "@/features/decide/service";
import { roundLabel } from "@/features/decide/types";

export const metadata: Metadata = { title: "Overview" };

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

/**
 * What's open now, then her options as Options opens them (service.ts optionsView: the round view while a round's seat
 * lists are out and its result isn't, else every option with past allotments), so every number here is the count of
 * the Options page its link opens. History charts follow.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  if (!profile)
    return (
      <AppPage>
        <PageHead title="Overview" />
        <div className="mt-6"><RoundStatusBanner params={params} /></div>
        <SetRankPrompt path="/decide" />
      </AppPage>
    );

  // pageSize 1: only the counts and the round summary are used, not the rows.
  const [d, meta, r] = await Promise.all([dashboard(profile), getMeta(), listOptions(profile, {}, { page: 1, pageSize: 1 })]);
  const L = decideLinks(params);
  const list = r.view === "round" ? r.seatLists[0] : undefined;
  const roundWords = list && roundName[list.round];
  const sum = r.summary;
  const labels = reachOrder.filter((x) => r.counts[x] > 0);
  const total = reachOrder.reduce((n, x) => n + r.counts[x], 0);
  const reached = r.counts["reached-latest"] + r.counts["reached-both"] + r.counts["reached-one"];
  const latestR1 = meta.sources.find((s) => s.year === LATEST_YEAR && s.round === "R1");
  const seats = eligibleCategories(profile.category, profile.pwd).join(" or ");
  const counted = reachWindow(LATEST_YEAR, PAST_YEARS);
  const labelSources = <DataSource used={[{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR, round: "R1" }]} />;
  // Her fee / bond caps leave out options whose figure is not declared (in words only, or missing): say so, with the way back.
  const caps = [profile.maxFeeLakh != null && termValueLabel.maxfee(profile.maxFeeLakh), profile.maxBondYears != null && termValueLabel.bondyrs(profile.maxBondYears)].flatMap((c) => (c ? [c[0].toLowerCase() + c.slice(1)] : [])).join(", ");
  const leftOut = r.unknownTerms > 0 ? ` Your caps (${caps}) leave out ${formatRank(r.unknownTerms)} more whose figure is not declared (in words only, or not in Seatora's data).` : "";
  const undeclared = r.unknownTerms > 0 && <> · <Link href={L.to("/decide/options", { nd: "keep" })} className={smallLink}>+{formatRank(r.unknownTerms)} not declared</Link></>;

  return (
    <AppPage className="grid grid-cols-1 gap-3 md:gap-4">
      <PageHead title="Overview" about={`Closing ranks here are on ${seats} seats, the seat categories you can take.`} />
      <RoundStatusBanner params={params} />

      <section aria-labelledby="numbers-h" className="grid gap-2">
        <div className="flex items-center gap-1">
          <h2 id="numbers-h" className="text-lg font-semibold">{list ? `${roundWords} seats in your courses` : "Your options"}</h2>
          <InfoTip label={list ? `${roundWords} seats in your courses` : "your options"}>
            {list
              ? `Options with seats in MCC's ${list.year} ${roundWords} lists, in your courses, quotas and ${seats} seats, labelled from closing ranks in ${counted}. Each number opens them on Options.`
              : `Every option in your profile with past allotments, labelled from closing ranks in ${counted}. Each number opens them on Options.`}
          </InfoTip>
        </div>
        <StatStrip
          items={[
            sum && list
              ? {
                  label: `Options with ${roundWords} seats`,
                  value: formatRank(total),
                  info: `${formatRank(sum.clear)} in the clear vacancy list, ${formatRank(sum.virtualOnly)} virtual only${sum.newOnly > 0 ? `, ${formatRank(sum.newOnly)} only newly added` : ""}.${leftOut}`,
                  note: <><Link href={L.options()} className={smallLink}>{formatRank(sum.clear)} clear, {formatRank(sum.virtualOnly)} virtual only</Link>{undeclared}</>,
                }
              : {
                  label: "Options in your profile",
                  value: formatRank(total),
                  info: `Every option in your profile's ${formatRank(d.summary.length)} ${d.summary.length === 1 ? "course" : "courses"} with past allotments; ${formatRank(r.counts["closed-before"])} of them closed before your rank.${leftOut}`,
                  note: <><Link href={L.options({ closed: true })} className={smallLink}>{formatRank(r.counts["closed-before"])} closed before your rank</Link>{undeclared}</>,
                },
            {
              label: "Reached your rank in a past round",
              info: `Options whose closing rank reached yours in at least one of R1 to R3 of ${counted}. Stray rounds don't count here: an option reached only there is labelled "${reachLabel("stray-only", LATEST_YEAR, PAST_YEARS)}".`,
              value: formatRank(reached),
              note: (
                <span className="inline-flex flex-wrap items-center gap-x-1.5">
                  <Link href={L.options({ reach: "reached-latest" })} className={smallLink}>{formatRank(r.counts["reached-latest"])} in {LATEST_YEAR} R1</Link>
                  <Provisional when={latestR1?.provisional} />
                </span>
              ),
            },
            {
              label: "Within 10% in a past round",
              info: "Options that closed just before your rank (within 10% of it) in a past round.",
              value: formatRank(r.counts["within-10"]),
              note: <Link href={L.options({ reach: "within-10" })} className={smallLink}>See them</Link>,
            },
          ]}
        >
          <ChoicesStat />
        </StatStrip>
        {labelSources}
      </section>

      {reached === 0 && (
        <section aria-labelledby="next-h" className="rounded-xl border border-border bg-card p-4">
          <h2 id="next-h" className="text-lg font-semibold">None of these reached your rank in {counted}: what you can still do</h2>
          <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-sm">
            {list && sum && sum.fresh > 0 && (
              <li><Link href={L.options({ reach: "new" })} className={smallLink}>{formatRank(sum.fresh)} new {sum.fresh === 1 ? "option" : "options"} in the {roundWords} lists</Link> have no past allotment, so no closing rank to compare. Look at them.</li>
            )}
            {list && <li><Link href={L.to("/decide/options", { seats: "virtual" })} className={smallLink}>Virtual vacancy seats</Link>: seats held now that free up when someone upgrades this round. Fill them as choices too.</li>}
            {r.counts["stray-only"] > 0 && <li><Link href={L.options({ reach: "stray-only" })} className={smallLink}>{formatRank(r.counts["stray-only"])} reached your rank only in a stray round</Link>, after R1 to R3 had closed far earlier.</li>}
            {r.counts["within-10"] > 0 && <li><Link href={L.options({ reach: "within-10" })} className={smallLink}>{formatRank(r.counts["within-10"])} closed within 10% of your rank</Link> in a past round.</li>}
            <li><Link href={L.to("/decide", { editProfile: 1 })} className={smallLink}>Widen your courses, quotas or states</Link>: add DNB and Diploma courses of your specialties, or more specialties, and the fee or bond caps.</li>
            <li>The stray vacancy round comes after Round 3: see the <Link href={L.to("/decide/counselling")} className={smallLink}>schedule and notices</Link>.</li>
            <li><Link href={L.rankScan(profile.rank)} className={smallLink}>Rank scan</Link> shows what ranks near yours were allotted in past rounds.</li>
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        {total ? (
          <ChartCard
            source={labelSources}
            title={list ? `${roundWords} options by label` : "Options by label"}
            subtitle={`${list ? `The ${formatRank(total)} options with ${roundWords} seats` : "Your options"}, by closing ranks in ${counted} only; older years are not counted. Select a label to see those options.`}
            table={
              <table className="w-full text-sm">
                <caption className="sr-only">Options by label</caption>
                <tbody>{labels.map((x) => <tr key={x} className="border-b border-border"><th scope="row" className="py-1.5 text-left font-normal">{reachLabel(x, LATEST_YEAR, PAST_YEARS)}</th><td className="numeric text-right">{formatRank(r.counts[x])}</td></tr>)}</tbody>
              </table>
            }
          >
            <LabelBars rows={labels.map((x) => ({ label: reachLabel(x, LATEST_YEAR, PAST_YEARS), count: r.counts[x], href: L.options({ reach: x }), accent: x.startsWith("reached") }))} />
          </ChartCard>
        ) : (
          <EmptyState
            title={`No options${list ? ` with ${roundWords} seats` : ""} in your profile`}
            description="Your courses, quotas, states, fee or bond limits leave none. Widen them, or add courses, with Edit beside your rank."
            href={L.to("/decide", { editProfile: 1 })}
            action="Edit your profile"
          />
        )}
        <TopChoices />
      </div>

      <ChartCard
        source={<DataSource used={[{ year: 2025 }]} />}
        className="chart-paper"
        title="Where your rank sits"
        subtitle={`Each dot is one option's deepest closing rank in 2025, on ${seats} seats. Dots at or right of your line closed at or after your rank.${d.strip.length < d.summary.length ? ` The ${d.strip.length} courses with the most options are drawn; the table lists all ${d.summary.length}. Tick courses in your profile to choose which are drawn.` : ""} Every option, with its round and seat category, is on Options.`}
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
        <RankStrip rank={profile.rank} rows={d.strip.map((x) => ({ course: `${x.course.degree} ${x.course.name}`, points: x.points }))} />
        <p className="mt-2 text-xs text-muted-foreground">
          <Link href={L.options({ closed: true, all: true })} className={`${smallLink} text-sky`}>Every option on Options</Link>
        </p>
      </ChartCard>

      <ChartCard
        source={<DataSource used={[{ year: 2025 }]} />}
        title="How closing ranks moved through 2025"
        subtitle={`Median closing rank per round across your options, on ${seats} seats, in 2025.${d.trend.length < d.summary.length ? ` The ${d.trend.length} courses with the most options.` : ""}`}
        table={
          <table className="w-full text-sm">
            <caption className="sr-only">Median 2025 closing rank by round, on {seats} seats</caption>
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-2">Course</th>{["R1", "R2", "R3", "Stray"].map((x) => <th key={x} scope="col" className="text-right">{x}</th>)}</tr></thead>
            <tbody>{d.trend.map((t) => <tr key={t.course.slug} className="border-b border-border"><th scope="row" className="py-1.5 text-left font-normal">{t.course.degree} {t.course.name}</th>{t.points.map((p) => <td key={p.round} className="numeric text-right">{formatRank(p.median)}</td>)}</tr>)}</tbody>
          </table>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {d.trend.map((t) => <RoundTrend key={t.course.slug} title={`${t.course.degree} ${t.course.name}`} href={L.lastRanks(t.course.slug)} rank={profile.rank} points={t.points} />)}
        </div>
      </ChartCard>

      <div className="grid gap-2 text-xs text-muted-foreground">
        <HistoryNote />
        <DataSource />
        {list && <SeatSource lists={r.seatLists} L={L} />}
      </div>
    </AppPage>
  );
}
