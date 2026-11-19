import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { z } from "zod";
import { formatINR, formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { HistoryNote, PageHead, SetRankPrompt } from "@/features/decide/components/bits";
import { GroupPrompt } from "@/features/decide/components/dashboard-parts";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { termDocs } from "@/features/decide/components/fees";
import { FilterForm, FiltersPanel } from "@/features/decide/components/filter-form";
import { toChoiceItem } from "@/features/decide/components/options-view";
import { SourceRef } from "@/features/decide/components/page-sources";
import { SuggestList, type SuggestItem } from "@/features/decide/components/suggest-list";
import { TermFilterControls } from "@/features/decide/components/term-filter-controls";
import { ActiveFilters, EmptyState, smallLink, toolbar } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { parseSearchParams } from "@/features/decide/lib/params";
import { pastOf, reachWindow, STRAY_NOT_COUNTED } from "@/features/decide/lib/reach";
import { BUCKET_RULES, bucketName, buckets, type LeftOut } from "@/features/decide/lib/suggest";
import { readTermFilters, termChips, termValueLabel } from "@/features/decide/lib/term-filters";
import { keepProfileParams, pairChoices, profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, nearestCourses, suggestOptions } from "@/features/decide/service";
import { activeExam, examInfo } from "@/features/exams/active";
import { authorityOf, exams, perGroup } from "@/features/exams/registry";

export const metadata: Metadata = { title: "Suggest my list" };

const TITLE = "Suggest my list";
/** `govt=1`: government colleges first within each bucket. The term filters (college type, fee, bond…): lib/term-filters.ts. */
const filtersSchema = z.object({ govt: z.literal("1").optional() });
const th = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

/**
 * Suggest my list (Choices' own page; Options and Home link it): her options in one suggested order with each one's
 * reason (lib/suggest.ts suggestList), her caps applied and what they left out counted, and Add / Copy actions that
 * write to her list only when she clicks (SuggestList). History only: the reach labels Options shows, nothing new.
 */
export default async function SuggestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  if (!profile) return <AppPage><PageHead title={TITLE} /><SetRankPrompt path="/decide/choices/suggest" /></AppPage>;
  const exam = await activeExam();
  // NEET SS: a rank is within one question group, so nothing is suggested until she picks hers.
  if (perGroup(exam) && !profile.quotas.length) return <AppPage><PageHead title={TITLE} /><GroupPrompt /></AppPage>;
  const E = await examInfo(exam);
  const f = parseSearchParams(filtersSchema, params);
  // Her caps as Options reads them (an absent maxfee / bondyrs is hers), and the page's own (college type…).
  const { params: tp, filters: terms } = readTermFilters(params, profile);
  const [meta, s] = await Promise.all([getMeta(exam), suggestOptions(profile, { terms, govtFirst: !!f.govt }, exam)]);
  const L = decideLinks(params);
  const here = (changes: Record<string, string | null>) => L.with("/decide/choices/suggest", changes);
  const by = authorityOf(exam);
  const { latest } = s;
  const PAST = pastOf(latest);
  const counted = reachWindow(latest, PAST);
  const rank = `${E.rankWord} ${formatRank(profile.rank)}`;

  // Her order's groups by name ("Radio-Diagnosis = General Medicine"), as prefRank numbers them.
  const pairNames = new Map(pairChoices(meta.courses).map((x) => [x.value, x.label]));
  const unitName = (u: string) => (u.includes("~") ? (pairNames.get(u) ?? u.replace("~", " ")) : (meta.specialties.find((x) => x.code === u)?.name ?? u));
  const order = profile.order?.map((g) => g.map(unitName).join(" = "));
  const groups = order?.map((g, i) => `${th(i + 1)} preference: ${g}`) ?? null;

  // Her preferences with nothing suggested (closed before her rank, or her caps): said, so the list never just starts at a later one.
  const bare = order?.flatMap((g, i) => (s.items.some((x) => x.pref === i) ? [] : [`${th(i + 1)} (${g})`])) ?? [];
  // Nothing at all: the courses nearest hers that reached her rank, each a suggestion of its own (`c`: that course alone).
  const nearest = s.items.length ? [] : await nearestCourses(profile, { terms }, exam);
  const items: SuggestItem[] = s.items.map((x) => ({ item: toChoiceItem(x.row, latest), bucket: x.bucket, reason: x.reason, pref: x.pref, ...(x.unsure && { unsure: true }) }));
  const n = (x: number) => <span className="numeric font-semibold">{formatRank(x)}</span>;
  // INI-CET: AIIMS's Round 1 rules (its counselling_forfeit items, ProgrammeTerms.roundRules, each with its document),
  // said once here and in a few words under each Safe seat, so she never lists a Round 1 seat she wouldn't join.
  // ponytail: the Round 1 items are picked by their words ("1st round"); a structured round field if the bundle gets one.
  const safeRow = s.items.find((x) => x.bucket === "safe")?.row;
  const rules = (safeRow?.fees.roundRules ?? []).filter((p) => /1st[- ]round/i.test(p.text));
  const ruleFee = rules.find((p) => p.inr != null)?.inr;
  const noRefusal = rules.some((p) => /refuse/i.test(p.text));
  const safeNote = rules.length
    ? `${by}'s rule${ruleFee != null && noRefusal ? "s" : ""}: ${[noRefusal && "a Round 1 seat can't be refused", ruleFee != null && `not joining a Round 1 seat costs ${formatINR(ruleFee)}`].filter(Boolean).join("; ") || "see Round 1 rules above"}. List it only if you would join it.`
    : undefined;

  // What was left out and why, each with the way to see or change it.
  const caps = [profile.maxFeeLakh != null && tp.maxfee == null && termValueLabel.maxfee(profile.maxFeeLakh), profile.maxBondYears != null && tp.bondyrs == null && termValueLabel.bondyrs(profile.maxBondYears)].filter(Boolean).join(", ");
  const lift = here({ fee: null, bond: null, maxfee: "any", bondyrs: "any", ctype: null, minstip: null, maxbond: null, maxleave: null });
  const leftWords: Record<LeftOut, [string, string?, string?]> = {
    closed: [`closed before your rank in every round of ${counted}`, L.options({ reach: "closed-before", closed: true }), "See them"],
    noData: ["no allotment in your seat categories"],
    far: ["never allotted before, with similar seats closing more than 10% before your rank (or none to compare)", L.options({ reach: "new" }), "See them"],
    otherGroup: ["another question group's"],
    type: ["not the college type you picked", lift, "Show them"],
    fee: [`over your fee cap${caps ? ` (${caps})` : ""}`, lift, "Show them"],
    terms: ["outside your bond, stipend or penalty limits", lift, "Show them"],
    unknown: ["with no published figure for your caps", here({ nd: "keep" }), "Include them"],
  };
  const left = (Object.entries(s.left) as [LeftOut, number][]).filter(([, v]) => v > 0);
  const counts = buckets.map((b) => [b, s.items.filter((x) => x.bucket === b).length] as const);

  // The sheet: college type and caps (as Options'), and government first.
  const keep = keepProfileParams(params);
  const chips = [
    f.govt && { label: "Government first", param: "govt", href: here({ govt: null }) },
    profile.maxFeeLakh != null && tp.maxfee == null && { label: `Your cap: ${termValueLabel.maxfee(profile.maxFeeLakh)}`, param: "maxfee", href: here({ fee: null }) },
    profile.maxBondYears != null && tp.bondyrs == null && { label: `Your cap: ${termValueLabel.bondyrs(profile.maxBondYears)}`, param: "bondyrs", href: here({ bond: null }) },
    ...termChips(tp).map((c) => ({ label: c.label, param: c.key, href: c.value ? L.without("/decide/choices/suggest", c.key, c.value) : here({ [c.key]: null }) })),
  ].filter((x) => !!x);
  const clearAll = here({ govt: null, fee: null, bond: null, ctype: null, maxfee: null, minstip: null, bondyrs: null, maxbond: null, maxleave: null, nd: null });

  return (
    <AppPage className="grid grid-cols-1 gap-3">
      <PageHead
        title={TITLE}
        about={
          <>
            Your options in one order, from the labels Options gives them ({counted}; {STRAY_NOT_COUNTED.charAt(0).toLowerCase() + STRAY_NOT_COUNTED.slice(1)}) and nothing else: no new reading of the data, no chance.{" "}
            {buckets.map((b) => <Fragment key={b}><b>{bucketName[b]}</b>: {BUCKET_RULES[b]}. </Fragment>)}
            The order: your course order first (Edit, Your order: equal courses share a place), then within each course Dream, Target, Safe, because {by} goes down your list and a seat higher in it is tried first, so a Dream above a Safe seat costs nothing;
            then{f.govt ? " government colleges first, then" : ""} the seats whose capped figures are published, then the most sought seat first (the lowest Round 1 closing in its newest year with one, as a later round can close far deeper; else the closing its reason gives), a never-allotted seat after the ones with closings of their own.
            Left out: closed before your rank, no allotment in your seat categories, never allotted with nothing similar near your rank, and what your caps leave out (each counted).{exam === "neet-ss" ? " Your question group's seats only." : ""}
          </>
        }
      />
      <p role="note" className="rounded-md border border-sky/40 bg-sky/10 px-3 py-2 text-sm font-semibold">Suggested from past closing ranks — not a prediction. Edit freely.</p>

      <section aria-label="What the list is built from" className="grid gap-1 text-sm">
        <p>
          {rank}{E.categories.length > 1 ? `, ${profile.category}${profile.pwd ? " PwD" : ""}` : ""}.{" "}
          {order?.length ? <>Your order: <span className="font-semibold">{order.join(" › ")}</span>.</> : <>No course order set: your courses count as equal.</>}{" "}
          <Link href={L.to("/decide/choices/suggest", { editProfile: 1 })} className={`${smallLink} text-sky`}>{order?.length ? "Change your order" : "Set your order"}</Link>
        </p>
        {/* The term filters, as on Options (her caps are their default), and government first. */}
        <FilterForm action="/decide/choices/suggest" role="search" aria-label="Limits for the suggested list" className={toolbar}>
          {[...keep].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <FiltersPanel count={chips.length} clear={clearAll}>
            <TermFilterControls f={tp} caps={profile} fees={E.has.fees} />
            <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border text-sm">
              <input type="checkbox" name="govt" value="1" defaultChecked={!!f.govt} className="size-5 accent-sky" />
              Government colleges first, within Dream, Target and Safe
            </label>
          </FiltersPanel>
        </FilterForm>
        <ActiveFilters items={chips} clear={clearAll} />
      </section>

      {items.length ? (
        <>
          <div>
            <p className="text-sm">
              {n(items.length)} suggested: {counts.map(([b, c], i) => <Fragment key={b}>{i > 0 && ", "}{n(c)} {bucketName[b]}</Fragment>)}.
            </p>
            {left.length > 0 && (
              <details className="text-sm">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted-foreground">Left out: {formatRank(left.reduce((a, [, v]) => a + v, 0))} options, and why</summary>
                <ul className="grid list-disc gap-1 pb-2 pl-5">
                  {left.map(([k, v]) => {
                    const [words, href, act] = leftWords[k];
                    return <li key={k}>{n(v)} {words}{href && <>. <Link href={href} className={`${smallLink} text-sky`}>{act}</Link></>}</li>;
                  })}
                </ul>
              </details>
            )}
          </div>
          {rules.length > 0 && safeRow && (
            <p className="rounded-md border border-sun/40 bg-sun/10 px-3 py-2 text-sm">
              {by}&apos;s Round 1 rules, beside every Safe seat below:{" "}
              {rules.map((p, i) => {
                const src = safeRow.fees.sources.find((x) => x.n === p.src);
                return <Fragment key={i}>{i > 0 && " · "}{p.text}{src && <SourceRef doc={{ name: src.label, url: src.url, type: src.type }} />}</Fragment>;
              })}
            </p>
          )}
          {bare.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing to suggest in your {bare.join(" or ")} preference at {rank}{caps ? " within your caps" : ""}: none reached your rank or came close (see Left out).
            </p>
          )}
          <h2 className="sr-only">The suggested list</h2>
          <SuggestList items={items} groups={groups} safeNote={safeNote} />
        </>
      ) : (
        <EmptyState
          title="Nothing to suggest"
          description={`None of your options reached ${rank}, closed within 10% of it, or is a never-allotted seat with similar seats near it${left.length ? ` (left out: ${left.map(([k, v]) => `${formatRank(v)} ${leftWords[k][0]}`).join("; ")})` : ""}. Widen your courses, quotas, states or caps.`}
        >
          <div className="grid justify-items-center gap-2">
            {nearest.length > 0 && (
              <p className="max-w-xl text-sm">
                Courses nearest yours that reached {rank}:{" "}
                {nearest.map((x, i) => (
                  <Fragment key={x.key}>
                    {i > 0 && ", "}
                    <Link href={here({ c: x.key })} className={`${smallLink} text-sky`}>Suggest from {pairNames.get(x.key) ?? x.key.replace("~", " ")}</Link> (<span className="numeric">{formatRank(x.reached)}</span> {x.reached === 1 ? "option" : "options"})
                  </Fragment>
                ))}
              </p>
            )}
            <span className="flex flex-wrap justify-center gap-x-6">
              <Link href={L.options()} className="inline-flex min-h-11 items-center text-sm text-sky underline">What you can still do, on Options</Link>
              <Link href={L.to("/decide/choices/suggest", { editProfile: 1 })} className="inline-flex min-h-11 items-center text-sm text-sky underline">Edit your profile</Link>
            </span>
          </div>
        </EmptyState>
      )}

      <div className="grid gap-2 text-xs text-muted-foreground">
        <HistoryNote />
        <DataSource used={[{ year: PAST[0] }, { year: PAST[1] }, { year: exams[exam].latestYear }]} terms={termDocs(s.items.map((x) => x.row.fees))} />
        <SeatSource lists={s.seatLists} L={L} />
      </div>
    </AppPage>
  );
}
