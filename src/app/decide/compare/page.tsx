import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { formatRank } from "@/features/cutoffs/lib/format";
import { gridRounds } from "@/features/decide/api";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { Dash, HistoryNote, InstName, PageHead, ReachBadge } from "@/features/decide/components/bits";
import { CompareFromDevice, RemoveFromCompare } from "@/features/decide/components/compare-controls";
import { ClosingCell, courseName, r1Of } from "@/features/decide/components/options-view";
import { Sup } from "@/features/decide/components/fees";
import { Beds } from "@/features/decide/components/pages/beds";
import { StatCellView } from "@/features/decide/components/stat-cells";
import { TypeBadge } from "@/features/decide/components/type-badge";
import { EmptyState, smallLink, tbl } from "@/features/decide/components/ui";
import { MAX_COMPARE } from "@/features/decide/lib/choices";
import { decideLinks } from "@/features/decide/lib/links";
import { parseSearchParams } from "@/features/decide/lib/params";
import { deepestOf, eligibleCategories, LATER_ROUNDS_NOTE, latestText, pastOf, seatsOfWords } from "@/features/decide/lib/reach";
import { inrFull, NOT_PUBLISHED } from "@/features/decide/lib/stat-format";
import { lowestRisk } from "@/features/decide/lib/term-filters";
import { kindName, rounds, type SeatList } from "@/features/decide/types";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { statCells, statKeys, statLabel } from "@/features/decide/lib/stat-format";
import { Paywall } from "@/features/plans/components/paywall";
import { currentPlan } from "@/features/plans/usage";
import { currentOptionIds, currentSeatLists, getMeta, getOptionsByIds, type OptionRow } from "@/features/decide/service";
import { ScrollTable } from "@/features/decide/components/scroll-table";
import { activeExam, examInfo } from "@/features/exams/active";
import { quotaIn, roundIn, type Exam } from "@/features/exams/exam";
import { authorityOf, DEFAULT_EXAM, examYears, latestOf, yearName } from "@/features/exams/registry";

export const metadata: Metadata = { title: "Compare" };

/**
 * ids: repeated or comma-joined option ids, under the college key each college has now (an old link's retired keys);
 * duplicates and unknown ids are dropped, then anything past the 4th.
 */
const paramsSchema = z.object({ ids: z.array(z.string().min(1).max(300)).default([]) });

/**
 * Closing ranks by year and round, one block a year (newest first), no scroller of its own: "2025: deepest 60,351
 * (Stray)" (the one definition, lib/reach.ts deepestOf), then each round with its seat category, wrapping in the column.
 */
function YearLines({ r, E }: { r: OptionRow; E: Exam }) {
  const years = Object.keys(r.grid).map(Number).sort((a, b) => b - a);
  if (!years.length) return <span className="text-xs text-muted-foreground">{r.reach === "new" ? "Never allotted before: no closing rank in any round." : "No closing rank on these seat categories in any round."}</span>;
  return (
    <dl className="grid gap-1.5 text-xs">
      {years.map((y) => {
        const cells = rounds.flatMap((rd) => (r.grid[y]?.[rd] ? [{ round: rd, ...r.grid[y][rd]! }] : []));
        const d = deepestOf(cells);
        return (
          <div key={y}>
            <dt className="font-semibold">
              <span className="numeric">{yearName(E.key, y)}</span>: deepest <span className="numeric">{d ? formatRank(d.closing) : "—"}</span>{d && ` (${roundIn(E, y, d.round)})`}
            </dt>
            <dd className="text-muted-foreground">
              {cells.map((c, i) => (
                <span key={c.round} className="inline-block whitespace-nowrap pr-1">
                  {roundIn(E, y, c.round)} <span className="numeric text-foreground">{formatRank(c.closing)}</span> {c.category}{i < cells.length - 1 && " ·"}
                </span>
              ))}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** "If you leave": the leaving penalty after joining, and what MCC lets the college keep if you resign or don't join from Round 2. */
function IfYouLeave({ r, leaving, shared }: { r: OptionRow; leaving: string; /** INI-CET: round rules every compared option has (said once above the table). */ shared: Set<string> }) {
  const t = r.fees;
  const own = t.roundRules?.filter((p) => !shared.has(p.text));
  return (
    <span className="grid gap-1 text-xs">
      <span><span className="text-muted-foreground">After joining:</span> <span className="font-semibold">{leaving}</span></span>
      {own ? (
        // INI-CET: AIIMS's round rules, each in its own words; the ones every option shares are above the table.
        own.length > 0 && (
          <span className="grid gap-0.5">
            <span className="text-muted-foreground">{shared.size ? "Also, here:" : `${authorityOf(t.exam)}'s round rules:`}</span>
            {own.map((p, i) => <span key={i}>{p.text}<Sup n={p.src ?? t.bond.src} sources={t.sources} /></span>)}
          </span>
        )
      ) : (
      <span>
        <span className="text-muted-foreground">Resign or don&apos;t join from Round 2:</span>{" "}
        {t.resignForfeit ? (
          <>{authorityOf(t.exam)} lets the college keep <span className="font-semibold">{inrFull(t.resignForfeit.inr)}</span><Sup n={t.resignForfeit.src} sources={t.sources} /></>
        ) : t.resignForfeitText ? (
          <>{t.resignForfeitText.text}<Sup n={t.resignForfeitText.src} sources={t.sources} /></>
        ) : (
          NOT_PUBLISHED
        )}
      </span>
      )}
    </span>
  );
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const exam = await activeExam();
  const ids = [...new Set(await currentOptionIds([...new Set(parseSearchParams(paramsSchema, params, ["ids"]).ids)].slice(0, 5 * MAX_COMPARE), exam))];
  const [known, meta, me] = await Promise.all([getOptionsByIds(ids, profile, exam), getMeta(exam), currentPlan()]);
  // The plan's cap (features/plans): Free compares fewer; past it, the paywall says so above the table.
  const cap = Math.min(MAX_COMPARE, me?.eff.limits.compare ?? MAX_COMPARE);
  const options = known.slice(0, cap);
  const L = decideLinks(params);
  const lists: SeatList[] = options.length ? await currentSeatLists(exam) : [];
  const E = await examInfo(exam);
  const round = lists[0] && `${yearName(exam, lists[0].year)} ${roundIn(E, lists[0].year, lists[0].round)}`;
  const fees = E.has.fees; // another exam may have no fee, stipend or bond data: no such rows
  // INI-CET: AIIMS's round rules every compared option has, said once above the table (each column shows only its own).
  const ruleSets = options.map((r) => new Set((r.fees.roundRules ?? []).map((p) => p.text)));
  const sharedRules = new Set(options.length > 1 && options.every((r) => r.fees.roundRules) ? [...ruleSets[0]].filter((x) => ruleSets.every((s) => s.has(x))) : []);
  const sharedParts = options[0]?.fees.roundRules?.filter((p) => sharedRules.has(p.text)) ?? [];
  const risk = fees && options.length > 1 && lowestRisk(options.map((r) => ({ name: r.college.name, t: r.fees })), authorityOf(exam) !== "MCC");
  const yearLabel = (y: number) => meta.years.find((x) => x.year === y)?.label ?? yearName(exam, y);
  const latest = latestOf(meta.sources, exam);
  const [older, last] = pastOf(latest);
  // Each option's stat cells (statKeys order), one per row.
  const terms = new Map(options.map((r) => [r.id, statCells(r.fees)]));
  const rows: { label: string; cell: (r: OptionRow) => React.ReactNode }[] = [
    { label: "Quota", cell: (r) => quotaIn(E, r.quota) },
    { label: "State", cell: (r) => r.college.state ?? <Dash /> },
    { label: "Type", cell: (r) => <TypeBadge type={r.hospital?.type} of={r.college.name} /> },
    // NEET MDS: no hospital beds (dental colleges): no row.
    ...(E.has.beds ? [{ label: "Beds (as reported)", cell: (r: OptionRow) => (r.hospital?.beds ? <Beds b={r.hospital.beds} inst={r.college.name} of={`${r.college.name}, ${courseName(r)}, ${quotaIn(E, r.quota)}`} /> : <Dash />) }] : []),
    {
      label: "Your reach",
      cell: (r) =>
        profile ? (
          <ReachBadge reach={r.reach} provisional={r.reachProvisional} latest={latest} otherGroup={r.otherGroup} from={r.reachFrom} />
        ) : (
          <Link href={L.with("/decide/compare", { editProfile: "1" })} className={`${smallLink} text-sky`}>Set your rank to see</Link>
        ),
    },
    ...(lists.length
      ? [{
          label: `Seats in ${authorityOf(exam)}'s ${round} lists`,
          // Each list on its own, never added (a seat can be in two). No intake figure: Seatora has no sanctioned-seat data.
          cell: (r: OptionRow) => (
            <span className="grid text-xs">
              {lists.map((l) => (
                <span key={l.key}><span className="text-muted-foreground">{kindName(l.kind, exam)}:</span> <span className="numeric font-semibold">{r.seatsBy?.[l.kind] != null ? formatRank(r.seatsBy[l.kind]!) : "—"}</span>
                  {/* INI-CET: hers out of the option's own ("4 in your categories of 6"; a course total "(not split by category)"). */}
                  {seatsOfWords(r, l.kind) && <span className="text-muted-foreground">{seatsOfWords(r, l.kind)}</span>}
                </span>
              ))}
            </span>
          ),
        }]
      : []),
    ...(fees
      ? [
          ...statKeys.flatMap((k, i) => [
            { label: statLabel[k], cell: (r: OptionRow) => <StatCellView c={terms.get(r.id)![i]} t={r.fees} of={`${r.college.name}, ${courseName(r)}, ${quotaIn(E, r.quota)}`} wrap /> },
            // Another exam: the whole course's fee on its own row (NEET PG: in the Fee (i), as before).
            ...(k === "fee" && exam !== DEFAULT_EXAM ? [{ label: "Fee, whole course", cell: (r: OptionRow) => (r.fees.wholeCourseFee != null ? <span className="numeric font-semibold">{inrFull(r.fees.wholeCourseFee)}</span> : <Dash />) }] : []),
          ]),
          { label: "If you leave", cell: (r: OptionRow) => <IfYouLeave r={r} leaving={terms.get(r.id)!.find((c) => c.key === "leaving")!.full} shared={sharedRules} /> },
        ]
      : []),
    { label: `${latestText(latest)} closing`, cell: (r) => <ClosingCell d={r.latest} year={latest.year} r1={r1Of(r, latest.year)} /> },
    { label: `${yearName(exam, last)} deepest closing`, cell: (r) => <ClosingCell d={r.byYear[last]} year={last} /> },
    { label: `${yearName(exam, older)} deepest closing`, cell: (r) => <ClosingCell d={r.byYear[older]} year={older} /> },
    { label: "Closing by year and round", cell: (r) => <YearLines r={r} E={E} /> },
    {
      label: "Allotments made (all rounds, all categories)",
      cell: (r) => (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
          {examYears(exam).sort((a, b) => b - a).flatMap((y) => [
            <dt key={`t${y}`} className="text-muted-foreground">{yearLabel(y)}</dt>,
            <dd key={`d${y}`} className="numeric text-right font-semibold">{r.allotmentsByYear[y] != null ? formatRank(r.allotmentsByYear[y]) : <Dash />}</dd>,
          ])}
        </dl>
      ),
    },
    {
      label: "More",
      cell: (r) =>
        r.reach !== "new" && (
          <span className="flex flex-wrap gap-x-4 text-xs">
            <Link href={L.lastRanks(r.course.slug, { inst: r.college.slug })} className={`${smallLink} text-sky`}>Last ranks</Link>
            <Link href={L.allotments({ course: r.course.slug, inst: r.college.slug })} className={`${smallLink} text-sky`}>Allotments</Link>
          </span>
        ),
    },
  ];

  return (
    <AppPage>
      <CompareFromDevice validIds={known.map((o) => o.id)} requested={ids} />
      <PageHead title="Compare" about={`Up to ${MAX_COMPARE} options side by side. Add them with the compare button on Options, your Choice list or an institute page.`} />

      {options.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="Nothing to compare yet"
          description={`Pick up to ${MAX_COMPARE} options with the compare button, then open Compare again.`}
          href={L.options()}
          action="Pick options to compare"
        />
      ) : (
        <>
        {me && known.length > cap && <Paywall feature="compare" eff={me.eff} className="mt-6" />}
        {risk && <p className="mt-3 text-sm">{risk}</p>}
        {/* INI-CET: the rules where its counselling and NEET PG's meet ("If you leave" for someone in both). */}
        {E.crossover && fees && (
          <p className="mt-2 text-sm">
            <Link href={L.to("/decide/counselling", { tab: "crossover" })} className={`${smallLink} text-sky`}>Also in NEET PG counselling? What MCC&apos;s and AIIMS&apos;s rules say if you leave a seat</Link>
          </p>
        )}
        {sharedParts.length > 0 && (
          <section aria-label={`${authorityOf(exam)}'s round rules`} className="mt-3 grid gap-1 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <p className="font-semibold">{authorityOf(exam)}&apos;s round rules, the same for {options.length === 2 ? "both" : `all ${options.length}`}:</p>
            <ul className="grid list-disc gap-1 pl-5 text-xs">
              {sharedParts.map((p, i) => <li key={i}>{p.text}<Sup n={p.src ?? options[0].fees.bond.src} sources={options[0].fees.sources} /></li>)}
            </ul>
          </section>
        )}
        {/* Phones: two options fit the width beside the labels; three or four get 10rem columns, so the next one peeks in
            at the edge (ScrollTable's edge shadow and first-time "Swipe for more" say there are more). */}
        <ScrollTable label="Comparison" className="mt-3 rounded-xl border border-border bg-card md:mt-8" scrollClassName="[scroll-padding-inline-start:11rem]">
          {/* Fixed columns, 12rem at least: four options fit beside the labels from 1280px (a wide grid scrolls in its cell). */}
          <table className={`w-full table-fixed text-sm md:min-w-[calc(11rem+var(--n)*12rem)] ${options.length > 2 ? "min-w-[calc(7rem+var(--n)*10rem)]" : ""}`} style={{ "--n": options.length } as React.CSSProperties}>
            <caption className="sr-only">Comparison of {options.length} {options.length === 1 ? "option" : "options"}</caption>
            <thead className={tbl.head}>
              <tr className="align-top">
                <td className="sticky left-0 z-10 w-28 bg-card p-3 max-md:p-2 md:w-44" />
                {options.map((r, i) => (
                  <th key={r.id} id={`col-${r.id}`} tabIndex={-1} scope="col" className="p-3 text-left font-medium max-md:p-2">
                    {/* Phones: the remove button wraps under a long name rather than squeezing it. */}
                    <div className="flex items-start justify-between gap-x-2 max-md:flex-wrap">
                      <span>
                        <Link href={L.institute(r.college.slug)} className="hover:text-sky hover:underline"><InstName name={r.college.name} state={r.college.state} /></Link>
                        {/* The quota is the first row; screen readers hear it with each cell's column name. */}
                        <span className="block text-xs font-normal text-muted-foreground">{courseName(r)}<span className="sr-only">, {quotaIn(E, r.quota)}</span></span>
                      </span>
                      <RemoveFromCompare id={r.id} label={`${r.college.name}, ${courseName(r)}, ${quotaIn(E, r.quota)}`} nextFocus={options[i + 1]?.id ?? options[i - 1]?.id ?? null} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.label} className="border-b border-border align-top last:border-0">
                  <th scope="row" className="sticky left-0 z-[1] bg-card p-3 text-left text-xs font-normal text-muted-foreground max-md:p-2">{s.label}</th>
                  {options.map((r) => <td key={r.id} className="numeric p-3 break-words max-md:p-2">{s.cell(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
        </>
      )}
      <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
        <HistoryNote
          more={
            options.length > 0 && (
              <>
                {profile
                  ? `Closing ranks are on ${eligibleCategories(profile.category, profile.pwd).join(" or ")} seats, the seat categories you can take; each says which.`
                  : "No rank set, so closing ranks are the deepest on any seat category; each says which."}{" "}
                Allotments count every category and round, not the seat matrix. {LATER_ROUNDS_NOTE}
              </>
            )
          }
        />
        <DataSource used={gridRounds(options)} />
      </div>
    </AppPage>
  );
}
