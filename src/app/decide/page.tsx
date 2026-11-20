import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { Button } from "@/components/ui/button";
import { HistoryNote, Provisional } from "@/features/decide/components/bits";
import { ChartCard, LabelBars, RankStrip, RoundTrend } from "@/features/decide/components/charts";
import { ChoicesStat, GroupPrompt, SetupCard, TopChoices } from "@/features/decide/components/dashboard-parts";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { InfoTip } from "@/features/decide/components/info-tip";
import { HeldStrip, RoundStatusBanner } from "@/features/decide/components/round-status";
import { ResidentsPromo, ToolGroups } from "@/features/decide/components/home-hub";
import { EmptyState, smallLink, StatStrip } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { fmtIST, nextChoiceFilling, nextDate, nextFilling, roundName, stepName, stepsNow } from "@/features/decide/lib/round-status";
import { StillCanDo } from "@/features/decide/components/still-can-do";
import { roundStatus } from "@/features/decide/server/notices";
import { readTermFilters, termValueLabel } from "@/features/decide/lib/term-filters";
import { eligibleCategories, latestText, reachLabel, reachOrder, reachWindow, STRAY_NOT_COUNTED } from "@/features/decide/lib/reach";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { dashboard, getMeta, listOptions, optionsPicture, type StripPoint } from "@/features/decide/service";
import { YourPicture } from "@/features/decide/components/your-picture";
import { HeldSeat } from "@/features/decide/components/held-seat";
import { WhatChanged } from "@/features/decide/components/what-changed";
import { YourResult } from "@/features/decide/components/your-result";
import { rankResult } from "@/features/decide/server/your-result";
import { RankByBranch } from "@/features/decide/components/rank-by-branch";
import { kindName, roundShort } from "@/features/decide/types";
import { QuotaName, RoundShort } from "@/features/decide/components/round-name";
import { activeExam, examInfo } from "@/features/exams/active";
import { authorityOf, DEFAULT_EXAM, exams, headYearIn, latestOf, perGroup, yearName } from "@/features/exams/registry";

export const metadata: Metadata = { title: "Home" };

/** A summary closing with the option it comes from: a closing is never shown without its seat category. */
function At({ p }: { p: StripPoint | null }) {
  if (!p) return <>{formatRank(null)}</>;
  return (
    <>
      {formatRank(p.closing)}
      <span className="block text-xs text-muted-foreground">{p.category}, <RoundShort round={p.round} />, <QuotaName quota={p.quota} /></span>
    </>
  );
}

/** INI-CET: the guide to where its counselling and NEET PG's meet (Counselling, "NEET PG too?"). */
const CrossoverLink = ({ L }: { L: ReturnType<typeof decideLinks> }) => (
  <p className="text-sm">
    <Link href={L.to("/decide/counselling", { tab: "crossover" })} className={`${smallLink} text-sky`}>Also in NEET PG counselling? What MCC&apos;s and AIIMS&apos;s rules say where the two meet</Link>
  </p>
);

/** The page's h1: the sidebar already says where she is, so it is for screen readers (and focus) only. */
const title = <h1 id="main-h1" tabIndex={-1} className="sr-only">Home</h1>;

/**
 * No rank yet: the three-step setup, today's MCC step, last rank by branch, Residents and the tools. With a rank: the
 * latest round's result for it (one card, the round's news folded in; What changed in its place before such a result),
 * her seat, Your picture, the next step, her rank by branch, Residents, the tools, today's MCC step, then her options as
 * Options opens them (service.ts optionsView: the round view while a round's seat lists are out and its result isn't,
 * else every option with past allotments), so every number here is the count of the Options page its link opens.
 * History charts follow.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const exam = await activeExam();
  // NEET SS: no label without her question group (a rank is within one group).
  const noGroup = !!profile && perGroup(exam) && !profile.quotas.length;
  if (!profile || noGroup)
    return (
      <AppPage className="grid grid-cols-1 gap-4">
        {title}
        <HeldStrip />
        {/* Residents first (owner, 20 Nov 2026: "on top keep this"). */}
        <ResidentsPromo L={decideLinks(params)} />
        {noGroup ? <GroupPrompt /> : <SetupCard />}
        <RoundStatusBanner params={params} />
        {exams[exam].crossover && <CrossoverLink L={decideLinks(params)} />}
        <RankByBranch profile={null} exam={exam} L={decideLinks(params)} />
        <ToolGroups L={decideLinks(params)} E={await examInfo(exam)} />
      </AppPage>
    );

  // pageSize 1: only the counts and the round summary are used, not the rows.
  const { latestYear: LATEST_YEAR, pastYears: PAST_YEARS } = exams[exam];
  // Her caps as Options reads them (an absent maxfee / bondyrs is hers; nd=keep keeps the ones not published).
  const { params: tp, filters: terms } = readTermFilters(params, profile);
  // The charts count what the numbers count: the same term filters (her caps, or the page's).
  const [d, meta, r, rs, pic, E, res] = await Promise.all([dashboard(profile, exam, terms), getMeta(exam), listOptions(profile, { terms }, { page: 1, pageSize: 1 }, exam), roundStatus(LATEST_YEAR, exam), optionsPicture(profile, { terms }, exam), examInfo(exam), rankResult(profile, exam)]);
  const L = decideLinks(params);
  const list = r.view === "round" ? r.seatLists[0] : undefined;
  const roundWords = list && roundName[list.round];
  const sum = r.summary;
  const labels = reachOrder.filter((x) => r.counts[x] > 0);
  const total = reachOrder.reduce((n, x) => n + r.counts[x], 0);
  const reached = r.counts["reached-latest"] + r.counts["reached-both"] + r.counts["reached-one"];
  const latest = latestOf(meta.sources, exam);
  // The charts' year: the latest complete one (NEET PG: its later past year, as before).
  const HEAD = headYearIn(exam, meta.sources);
  const head = yearName(exam, HEAD); // as the exam names it (INI-CET: "Jan 2026")
  const seats = eligibleCategories(profile.category, profile.pwd).join(" or ");
  const counted = reachWindow(latest, PAST_YEARS);
  const labelSources = <DataSource used={[{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR }]} />;
  // Her fee / bond caps leave out options whose figure is not declared (in words only, or missing): say so, with the way back.
  const caps = [profile.maxFeeLakh != null && termValueLabel.maxfee(profile.maxFeeLakh), profile.maxBondYears != null && termValueLabel.bondyrs(profile.maxBondYears)].flatMap((c) => (c ? [c[0].toLowerCase() + c.slice(1)] : [])).join(", ");
  const leftOut = r.unknownTerms > 0 ? ` ${caps ? `Your caps (${caps})` : "Your fee, bond or type limits"} leave out ${formatRank(r.unknownTerms)} more without a published figure.` : "";
  // The next-step card names a round only from MCC's schedule: the choice filling open now, else the next one scheduled.
  const steps = rs && stepsNow(rs, new Date());
  const filling = steps && nextFilling(steps);
  // Her choice list is named for the choice filling she fills next (MCC's schedule), as Choices names it.
  const fill = steps && nextChoiceFilling(steps);
  const fillName = fill ? `${roundName[fill.round]} · ${yearName(exam, rs.year)}` : null;
  // MCC's seat lists of the round Options lists, said as such (never "Round 2 seats in your courses").
  const by = authorityOf(exam); // MCC; INI-CET: AIIMS
  // INI-CET: one list a session, AIIMS's seat position (types.ts kindName).
  const sp = kindName("clear", exam) === "Seat position";
  const lists = list && (sp ? `${by}'s ${yearName(exam, list.year)} seat position` : `${by}'s ${roundWords} seat lists`);
  const undeclared = r.unknownTerms > 0 && <> · <Link href={L.to("/decide/options", { nd: "keep" })} className={smallLink}>+{formatRank(r.unknownTerms)} without a published figure</Link></>;
  // Another exam (most of its MCC profiles give no fee figure): what her cap hides, said as Options says it, with the
  // ways back; then the cap, not her courses, is what to change.
  const capped = "capped" in r ? (r.capped ?? 0) : 0;
  const capWords = caps && tp.maxfee == null && tp.bondyrs == null ? `your cap (${caps})` : "your fee, bond or type limits";
  // Exactly the ones the caps hide, each saying which (Options' capped view); the caps stay hers.
  const showCapped = L.with("/decide/options", { capped: "1", view: null, seats: null, closed: null, reach: null });
  const capCause = exam !== DEFAULT_EXAM && (capped > 0 || r.unknownTerms > 0);
  // While the counts above are the round's (options with seats in its lists), the charts are every option with past
  // allotments: said in view, so a median past her rank never reads against "none reached" up there.
  const chartScope = list && <span className="basis-full">All {formatRank(d.total)} options in your courses with past allotments, with seats in {lists} or not</span>;
  const capNote = capCause && (
    <p role="status" className="flex flex-wrap items-center gap-x-3 rounded-md border border-sun/40 bg-sun/10 px-3 py-2 text-sm">
      {capped > 0 && (
        <span>
          <span className="numeric font-semibold">{formatRank(capped)}</span> {capped === 1 ? "option" : "options"} in your profile hidden by {capWords}.{" "}
          <Link href={showCapped} className={`${smallLink} text-sky`}>Show them</Link>
        </span>
      )}
      {r.unknownTerms > 0 && (
        <span>
          <span className="numeric font-semibold">{formatRank(r.unknownTerms)}</span> more with no published figure for {capWords}.{" "}
          <Link href={L.with("/decide", { nd: "keep" })} className={`${smallLink} text-sky`}>Include not published</Link>
        </span>
      )}
    </p>
  );

  return (
    <AppPage className="grid grid-cols-1 gap-4">
      {title}
      <HeldStrip />
      {/* Residents first (owner, 20 Nov 2026: "on top keep this"). */}
      <ResidentsPromo L={L} />
      {/* What the latest round's result (R2 on) lists for her rank, with what else is new since her last visit; before
          such a result, What changed (never on a first visit). Then the seat she holds and what she risks by upgrading
          from it ("Already hold a seat?" is a link in the result card). */}
      {res ? <YourResult res={res} exam={exam} L={L} round={list && sum ? { list, sum } : null} askHeld={!profile.held} /> : <WhatChanged exam={exam} round={list && sum ? { list, sum } : null} />}
      {(!res || profile.held) && <HeldSeat profile={profile} exam={exam} L={L} where="home" />}
      {reached > 0 && <YourPicture pic={pic} profile={profile} E={E} latest={latest} L={L} scope={list ? ` with seats in ${lists}` : ""} href={(x) => L.options({ reach: x, closed: x === "closed-before" || undefined })} />}
      {/* Desktop: Options is a tool there and its numbers are below, so this card is for phones (and always when nothing is left to show). */}
      <section aria-labelledby="next-step-h" className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${total ? "md:hidden" : ""}`}>
        <p className="section-label text-muted-foreground">Next recommended step</p>
        {total ? (
          <>
            <h2 id="next-step-h" className="mt-1 text-title font-semibold">Review your options</h2>
            {filling && (
              <p className="mt-1 text-body">
                <span className="font-semibold">{roundName[filling.round]} {stepName[filling.step].toLowerCase()}</span>{" "}
                {filling.now === "open"
                  ? <>open now{filling.scheduled?.to && <>, until <span className="numeric">{fmtIST(filling.scheduled.to)}</span></>}</>
                  : <>{filling.scheduled?.from ? "from" : "on"} <span className="numeric">{fmtIST(nextDate(filling)!)}</span>{filling.scheduled?.tentative && " (tentative)"}</>}
              </p>
            )}
            {/* Your picture (above) has the counts once she reached anything. */}
            {reached === 0 && <p className="mt-1 text-body text-muted-foreground">
              <span className="numeric">{formatRank(total)}</span> {total === 1 ? "option" : "options"} {list ? `with seats in ${by}'s latest seat lists, in your courses` : "in your profile"};{" "}
              none reached your rank in a past round.
            </p>}
            <span className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="lg" className="min-h-11 max-sm:w-full"><Link href={L.options()}>Open Options</Link></Button>
              <Button asChild size="lg" variant="secondary" className="min-h-11 max-sm:w-full"><Link href={L.to("/decide/choices/suggest")}>Suggest my Choice list</Link></Button>
            </span>
          </>
        ) : capCause ? (
          <>
            <h2 id="next-step-h" className="mt-1 text-title font-semibold">Your limits hide your options</h2>
            <p className="mt-1 text-body text-muted-foreground">Your courses have options, but {capWords} {capped + r.unknownTerms === 1 ? "hides it" : "hides them"}. Show them, or lift the limit in your profile.</p>
            <div className="mt-2">{capNote}</div>
            <Button asChild size="lg" className="mt-3 min-h-11 max-sm:w-full"><Link href={L.to("/decide", { editProfile: 1 })}>Edit your profile</Link></Button>
          </>
        ) : (
          <>
            <h2 id="next-step-h" className="mt-1 text-title font-semibold">Widen your profile</h2>
            <p className="mt-1 text-body text-muted-foreground">Your courses, quotas, states, fee or bond limits leave no options. Add courses or lift a limit.</p>
            <Button asChild size="lg" className="mt-3 min-h-11 max-sm:w-full"><Link href={L.to("/decide", { editProfile: 1 })}>Edit your profile</Link></Button>
          </>
        )}
      </section>
      <RankByBranch profile={profile} exam={exam} L={L} />
      <ToolGroups L={L} E={E} />
      <RoundStatusBanner params={params} />
      {exams[exam].crossover && <CrossoverLink L={decideLinks(params)} />}

      <section aria-labelledby="numbers-h" className="grid gap-2">
        <div className="flex items-center gap-1">
          <h2 id="numbers-h" className="text-h2 font-bold">{list ? `Your courses in ${lists}` : "Your options"}</h2>
          <InfoTip label={list ? `your courses in ${lists}` : "your options"}>
            {list
              ? `Options with seats in ${sp ? lists : `${by}'s ${yearName(exam, list.year)} ${roundWords} lists`}, in your courses, quotas and ${seats} seats, with their reach from closing ranks in ${counted}. Each number opens them on Options.`
              : `Every option in your profile with past allotments, on ${seats} seats, with their reach from closing ranks in ${counted}. Each number opens them on Options.`}
          </InfoTip>
        </div>
        {total > 0 && capNote}
        <StatStrip
          items={[
            sum && list
              ? {
                  label: `Options in ${lists}`,
                  value: formatRank(total),
                  info: sp ? `In your courses, quotas and ${seats} seats.${leftOut}` : `${formatRank(sum.clear)} in the clear vacancy list, ${formatRank(sum.virtualOnly)} virtual only${sum.newOnly > 0 ? `, ${formatRank(sum.newOnly)} only newly added` : ""}.${leftOut}`,
                  note: sp ? <><Link href={L.options()} className={smallLink}>See them on Options</Link>{undeclared}</> : <><Link href={L.options()} className={smallLink}>{formatRank(sum.clear)} clear, {formatRank(sum.virtualOnly)} virtual only</Link>{undeclared}</>,
                }
              : {
                  label: "Options in your profile",
                  value: formatRank(total),
                  info: `Every option in your profile's ${formatRank(d.summary.length)} ${d.summary.length === 1 ? "course" : "courses"} with past allotments; ${formatRank(r.counts["closed-before"])} of them closed before your rank.${leftOut}`,
                  note: <><Link href={L.options({ closed: true })} className={smallLink}>{formatRank(r.counts["closed-before"])} closed before your rank</Link>{undeclared}</>,
                },
            {
              label: "Reached your rank in a past round",
              info: `Options whose closing rank reached yours in at least one of R1 to R3 of ${counted}. Stray rounds don't count here: an option reached only there shows "${reachLabel("stray-only", latest, PAST_YEARS)}".`,
              value: formatRank(reached),
              note: (
                <span className="inline-flex flex-wrap items-center gap-x-1.5">
                  <Link href={L.options({ reach: "reached-latest" })} className={smallLink}>{formatRank(r.counts["reached-latest"])} in {latestText(latest)}</Link>
                  <Provisional when={latest.provisional} />
                </span>
              ),
            },
            {
              label: "Within 10% in a past round",
              info: `Options that closed just before your rank (within 10% of it) in a past round. ${STRAY_NOT_COUNTED}; see Last ranks for them.`,
              value: formatRank(r.counts["within-10"]),
              note: <Link href={L.options({ reach: "within-10" })} className={smallLink}>See them</Link>,
            },
          ]}
        >
          <ChoicesStat nextRound={fillName} />
        </StatStrip>
        {labelSources}
      </section>

      {reached === 0 && (
        <StillCanDo L={L} exam={exam} rank={profile.rank} list={list} fresh={sum?.fresh ?? 0} counts={r.counts} cap={capCause ? { href: showCapped, words: capWords, n: capped } : undefined} id="next-h" title={`None of these reached your rank in ${counted}: what you can still do`} />
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        {total ? (
          <ChartCard
            source={labelSources}
            title={list ? `Options in ${lists}, by reach` : "Options by reach"}
            subtitle={`${list ? `The ${formatRank(total)} options with seats in ${lists}` : "Your options"}, by closing ranks in ${counted} only; older years are not counted. Select a reach to see those options.`}
            table={
              <table className="w-full text-sm">
                <caption className="sr-only">Options by reach</caption>
                <tbody>{labels.map((x) => <tr key={x} className="border-b border-border"><th scope="row" className="py-1.5 text-left font-normal">{reachLabel(x, latest, PAST_YEARS)}</th><td className="numeric text-right">{formatRank(r.counts[x])}</td></tr>)}</tbody>
              </table>
            }
          >
            <LabelBars rows={labels.map((x) => ({ label: reachLabel(x, latest, PAST_YEARS), count: r.counts[x], href: L.options({ reach: x }), accent: x.startsWith("reached") }))} />
          </ChartCard>
        ) : (
          <EmptyState
            title={`No options${list ? ` in ${lists}` : ""} in your profile`}
            description="Your courses, quotas, states, fee or bond limits leave none. Widen them, or add courses, with Edit beside your rank."
            href={L.to("/decide", { editProfile: 1 })}
            action="Edit your profile"
          />
        )}
        <TopChoices nextRound={fillName} />
      </div>

      <ChartCard
        source={<DataSource used={[{ year: HEAD }]} />}
        className="chart-paper"
        title="Where your rank sits"
        subtitle={`Each dot is one option's deepest closing rank in ${head}, on ${seats} seats. Dots at or right of your line closed at or after your rank.${d.strip.length < d.summary.length ? ` The ${d.strip.length} courses with the most options are drawn; the table lists all ${d.summary.length}. Tick courses in your profile to choose which are drawn.` : ""} Every option, with its round and seat category, is on Options.`}
        legend={
          <>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-mark" />Closed at or after your rank in {head}</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground/60" />Closed before your rank</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-foreground" />Your rank</span>
            {chartScope}
          </>
        }
        table={
          <table className="w-full text-sm">
            <caption className="sr-only">{head} deepest closing ranks of your options, on {seats} seats, by course</caption>
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
        <RankStrip rank={profile.rank} year={HEAD} rows={d.strip.map((x) => ({ course: `${x.course.degree} ${x.course.name}`, points: x.points }))} />
        <p className="mt-2 text-xs text-muted-foreground">
          <Link href={L.options({ closed: true, all: true })} className={`${smallLink} text-sky`}>Every option on Options</Link>
        </p>
      </ChartCard>

      <ChartCard
        source={<DataSource used={[{ year: HEAD }]} />}
        title={`How closing ranks moved through ${head}`}
        legend={chartScope}
        subtitle={`Median closing rank per round across your options, on ${seats} seats, in ${head}.${d.trend.length < d.summary.length ? ` The ${d.trend.length} courses with the most options.` : ""}`}
        table={
          <table className="w-full text-sm">
            <caption className="sr-only">Median {head} closing rank by round, on {seats} seats</caption>
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-2">Course</th>{(d.trend[0]?.points.map((p) => roundShort(p.round, exam)) ?? ["R1", "R2", "R3", "Stray"]).map((x) => <th key={x} scope="col" className="text-right">{x}</th>)}</tr></thead>
            <tbody>{d.trend.map((t) => <tr key={t.course.slug} className="border-b border-border"><th scope="row" className="py-1.5 text-left font-normal">{t.course.degree} {t.course.name}</th>{t.points.map((p) => <td key={p.round} className="numeric text-right">{formatRank(p.median)}</td>)}</tr>)}</tbody>
          </table>
        }
      >
        {/* Cards at least 284px wide: the 260-unit chart plus its padding, so its 12-unit labels draw at 12px or more. */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17.75rem),1fr))] gap-3">
          {d.trend.map((t) => <RoundTrend key={t.course.slug} title={`${t.course.degree} ${t.course.name}`} href={L.lastRanks(t.course.slug)} rank={profile.rank} points={t.points} year={HEAD} />)}
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
