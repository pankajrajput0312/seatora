// An exam's landing page (/neet-pg, /neet-ss, /neet-mds, /ini-cet): what its counselling is, what Seatora holds for it
// and a few real figures from its data, each with its document. Server components only (no client JS of its own):
// another exam's words and data reach staff's pages only (./gate.ts).
import "server-only";
import Link from "next/link";
import { Info } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Cta } from "@/components/marketing/cta";
import { RankForm } from "@/components/marketing/rank-check";
import { accessFaq, Faq } from "@/components/marketing/faq";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceLabel } from "@/components/ui/source-label";
import { formatRank } from "@/features/cutoffs/lib/format";
import { fmtDay } from "@/features/decide/lib/format";
import { decideLinks } from "@/features/decide/lib/links";
import { alertOf, badgeOf, fmtIST, fmtNote, roundName, stepName } from "@/features/decide/lib/round-status";
import { kindName, type Round } from "@/features/decide/types";
import { crossover } from "../crossover";
import { authorityOf, DEFAULT_EXAM, sessionExams, type ExamKey } from "../keys";
import { landingData, type LandingData } from "./data";
import { landingGate } from "./gate";
import { commonFaqs, landingWords } from "./words";

const n = formatRank;
const link = "inline-flex min-h-11 items-center text-sm text-sky underline underline-offset-4 hover:no-underline";
/** Decide for a visitor: sign-up first when signed out (/signup sends a signed-in member straight on to `next`). */
const signupFirst = (next: string) => `/signup?${new URLSearchParams({ next })}`;

type Ladder = NonNullable<LandingData["closing"]>;
type Step = NonNullable<LandingData["status"]>["steps"][number];

/**
 * A round's steps with their badges; one "Every step" line when they all have the same one, and one "Result" line when
 * the provisional and final results do (MCC held both with one notice: "Result, On hold", not two rows of it).
 */
const collapse = (steps: Step[]) => {
  const xs = steps.map((s) => ({ name: stepName[s.step], b: badgeOf(s), result: s.step.endsWith("_result") }));
  if (xs.length > 1 && xs.every((x) => x.b.text === xs[0].b.text)) return [{ name: "Every step", b: xs[0].b }];
  const results = xs.filter((x) => x.result);
  return results.length > 1 && results.every((x) => x.b.text === results[0].b.text) ? [...xs.filter((x) => !x.result), { name: "Result", b: results[0].b }] : xs;
};

/** One seat's closing rank in each round, as bars on one scale (0 to its deepest), every value labelled; a real table. */
export function Rounds({ c, caption }: { c: Ladder; caption: string }) {
  const max = Math.max(...c.rounds.map((r) => r.closing));
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr><th scope="col">Round</th><th scope="col">Closing rank</th></tr>
      </thead>
      <tbody>
        {c.rounds.map((r) => (
          <tr key={r.round}>
            <th scope="row" className="w-0 py-1 pr-4 text-left align-middle font-normal whitespace-nowrap text-muted-foreground">
              {r.source?.url ? (
                <a href={r.source.url} target="_blank" rel="noopener noreferrer" title={r.source.name} className="inline-flex min-h-9 items-center underline decoration-foreground/25 underline-offset-4 hover:text-sky">
                  {r.name}<span className="sr-only"> result PDF (opens in a new tab)</span>
                </a>
              ) : r.name}
            </th>
            <td className="py-1 align-middle">
              <div className="flex items-center gap-3">
                <div aria-hidden className="h-2.5 flex-1">
                  <div className="h-full rounded-r-[4px] bg-foreground/70" style={{ width: `${Math.max(2, (r.closing / max) * 100)}%` }} />
                </div>
                <span className="numeric w-20 shrink-0 text-right text-base font-medium">{n(r.closing)}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One figure from the data: what it is, the figure, its documents, and where Decide shows the rest. */
export function Note({ title, children, sources, href, action }: { title: string; children: React.ReactNode; sources: { name: string; url: string | null; year: string }[]; href: string; action: string }) {
  return (
    <article className="flex flex-col border-t border-border pt-5">
      <h3 className="text-lg font-medium leading-snug">{title}</h3>
      <div className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
      <ul className="mt-4 grid gap-1.5">
        {sources.map((s) => (
          <li key={s.name}><SourceLabel provenance={{ sourceName: s.name, sourceUrl: s.url, sourceType: "OFFICIAL", academicYear: s.year }} /></li>
        ))}
      </ul>
      <Link href={href} className={`${link} mt-2 self-start`}>{action}</Link>
    </article>
  );
}

/** What a landing page's pieces share: the counselling body, Decide's links, and sign-up first for a visitor. */
function linksOf(d: LandingData) {
  const who = authorityOf(d.exam);
  const L = decideLinks(d.exam === DEFAULT_EXAM ? "" : `exam=${d.exam}`);
  // A staff-only exam's page is read by signed-in staff only: straight into Decide.
  const viaSignup = d.E.public ? signupFirst : (href: string) => href;
  const lastRanks = (c: Ladder) => viaSignup(L.lastRanks(c.courseSlug, { inst: c.college.slug, quota: c.rawQuota, category: "Open" }));
  return { who, L, viaSignup, lastRanks };
}

export async function ExamLanding({ exam }: { exam: ExamKey }) {
  await landingGate(exam);
  const d = await landingData(exam);
  const w = landingWords[exam];
  const { E, counts: k } = d;
  const { who, L, viaSignup, lastRanks } = linksOf(d);
  const body = who === "AIIMS" ? "AIIMS New Delhi" : "MCC";
  const step = (r: Round) => E.roundWords?.[r] ?? roundName[r];
  const faqs = [...commonFaqs(d), ...w.faqs(d), accessFaq];
  const held = d.status && alertOf(d.status.steps);
  const heldStep = held && d.status!.steps.find((s) => s.url === held.url);

  return (
    <>
      <section aria-labelledby="hero-h" className="border-b border-border">
        <Container className="grid gap-10 pt-8 pb-14 sm:pt-16 md:pb-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
          <div>
            <p className="text-sm text-muted-foreground">{E.label} counselling by {body}</p>
            <h1 id="hero-h" className="glow mt-4 font-pixel text-4xl leading-[0.95] tracking-tight sm:text-5xl md:text-6xl">{w.headline}</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{w.scope}</p>
            {w.notCovered && (
              <p className="mt-4 flex max-w-xl gap-2 rounded-md bg-sun/10 px-3 py-2.5 text-sm leading-relaxed text-sun">
                <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {w.notCovered}
              </p>
            )}
            {/* NEET PG: where her rank got in last year, no sign-up (/neet-pg/rank); another exam's staff go to Options. */}
            {exam === DEFAULT_EXAM ? (
              <RankForm className="mt-6 max-w-xl sm:mt-8" />
            ) : (
              <div className="mt-6 flex flex-wrap gap-3 sm:mt-8">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href={viaSignup(L.options())}>See options for your rank</Link>
                </Button>
              </div>
            )}
          </div>

          {d.closing && (
            <figure className="rounded-xl border border-border bg-card p-5 md:p-7">
              <figcaption>
                <p className="text-sm text-muted-foreground">Closing rank by round, {d.closing.year}</p>
                <p className="mt-2 text-lg font-medium leading-snug">{d.closing.course}</p>
                <p className="text-sm text-muted-foreground">{d.closing.college.name}, {d.closing.quota}, Open seats</p>
              </figcaption>
              <div className="mt-5">
                <Rounds c={d.closing} caption={`Closing rank by round: ${d.closing.course}, ${d.closing.college.name}, ${d.closing.year}`} />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                The last rank that got this seat in each round. Each round links to its {who} result PDF. This was the most-allotted {E.label} seat in the {d.closing.quota} quota that {sessionExams.includes(exam) ? "session" : "year"}.
              </p>
              <Link href={lastRanks(d.closing)} className={link}>Open in Last ranks</Link>
            </figure>
          )}
        </Container>
      </section>

      <Inside d={d} title={`What's inside for ${E.label}`} />

      <section aria-labelledby="how-h" className="border-b border-border">
        <Container className="py-16 md:py-24">
          <h2 id="how-h" className="text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-12">
            {[
              { title: "Set your rank", body: w.enter },
              { title: "See your options", body: `Every seat with its closing rank in each round, its fee, stipend and bond, and how many seats the newest list has. Each is marked reached, within 10% or closed before your rank, from past rounds.` },
              { title: "Build your Choice list", body: `Put the seats in the order you'll fill them in ${who}'s choice filling, with the reasons beside each.` },
            ].map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_1fr] border-t border-border pt-5">
                <span className="numeric text-2xl font-medium text-muted-foreground" aria-hidden>{i + 1}</span>
                <div>
                  <h3 className="text-lg font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-label="Sources" className="border-b border-border">
        <Container className="grid gap-12 py-16 md:grid-cols-2 md:py-24">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Official documents only</h2>
            <ul className="numeric mt-6 divide-y divide-border border-y border-border text-sm">
              {[
                [k.resultPdfs, `${E.resultsName ?? `${who} allotment result`} PDFs, ${k.first} to ${k.last}`],
                [k.seatLists, `${who} seat lists`],
                [k.termDocs, "fee, stipend and bond documents"],
                [k.notices, `${who} counselling notices`],
              ].filter(([x]) => (x as number) > 0).map(([x, what]) => (
                <li key={what as string} className="flex items-baseline gap-4 py-3">
                  <span className="w-16 shrink-0 text-right text-base font-medium text-foreground">{n(x as number)}</span>
                  <span className="text-muted-foreground">{what}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Every figure names the document it came from, with a link. Nothing is guessed: a figure no document gives shows as &ldquo;—&rdquo;.
            </p>
            <a href={d.site.url} target="_blank" rel="noopener noreferrer" className={link}>{d.site.name}<span className="sr-only"> (opens in a new tab)</span></a>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">History, not a prediction</h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground">
              A closing rank is what happened in a past round. This year&apos;s seats, candidates and rounds can differ, so Seatora marks each seat from history and never promises one. Seatora is independent: not affiliated with {body}, NBEMS, NMC or any counselling authority.
            </p>
          </div>
        </Container>
      </section>

      <section aria-labelledby="status-h" className="border-b border-border">
        <Container className="py-16 md:py-24">
          <h2 id="status-h" className="text-2xl font-semibold tracking-tight md:text-3xl">Where {E.label} counselling stands</h2>
          {d.status ? (
            <>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
                The {d.status.year}{sessionExams.includes(exam) ? "" : " counselling"}, from {who}&apos;s notices. Seatora last checked them at{" "}
                <span className="text-foreground">{fmtIST(d.status.asOf)}</span>
                {d.latestNotice && <>; the latest is dated <span className="text-foreground">{fmtIST(d.latestNotice)}</span></>}. A step moves on only when a
                notice or a printed date says so.
              </p>
              {/* A held step in words, with the notice that holds it: its title alone ("Notice for result of Round-2") reads like the result. */}
              {held && heldStep && (
                <p className="mt-6 flex max-w-prose gap-2 rounded-md bg-sun/10 px-3 py-2.5 text-sm leading-relaxed text-sun">
                  <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span>
                    <span className="font-medium">{held.text}</span> (
                    <a href={held.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:no-underline">
                      {who} notice{heldStep.date ? ` of ${fmtIST(heldStep.date)}` : ""}<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    ){heldStep.note ? `: ${fmtNote(heldStep.note)}` : ""}.
                  </span>
                </p>
              )}
              <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
                {[...new Set(d.status.steps.map((s) => s.round))].map((r) => (
                  <div key={r} className="border-t border-border pt-4">
                    <h3 className="text-base font-medium">{step(r)}</h3>
                    <ul className="mt-2 grid gap-1.5 text-sm">
                      {/* Every step the same (all done, all upcoming): one line, so a phone reads the round at a glance. */}
                      {collapse(d.status!.steps.filter((s) => s.round === r)).map(({ name, b }) => (
                        <li key={name} className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{name}</span>
                          <Badge tone={b.tone}>{b.text}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {d.notices.length > 0 && (
                <>
                  <h3 className="mt-10 text-base font-medium">Latest notices</h3>
                  <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
                    {d.notices.map((x) => (
                      <li key={x.url} className="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
                        <span className="numeric text-muted-foreground">{fmtDay(x.date)}</span>
                        <span>
                          <a href={x.url!} target="_blank" rel="noopener noreferrer" className="underline decoration-foreground/25 underline-offset-4 hover:text-sky">{x.title}<span className="sr-only"> (opens in a new tab)</span></a>
                          {held && x.url === held.url && <Badge tone="warning" className="ml-2">{held.text}</Badge>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {/* The schedule is public on MCC's site: linked there, never behind a sign-up. */}
              <p className="mt-2 flex flex-wrap gap-x-6">
                {d.schedule && (
                  <a href={d.schedule.url!} target="_blank" rel="noopener noreferrer" className={link}>
                    {who}&apos;s schedule: {d.schedule.title} ({fmtIST(d.schedule.date)})<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
                <a href={d.site.url} target="_blank" rel="noopener noreferrer" className={link}>Every notice on {d.site.name}<span className="sr-only"> (opens in a new tab)</span></a>
              </p>
            </>
          ) : (
            <p className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground">
              Seatora doesn&apos;t follow {E.label} counselling notices yet, so it shows no round dates. {who} posts the schedule and every notice on{" "}
              <a href={d.site.url} target="_blank" rel="noopener noreferrer" className="text-sky underline underline-offset-4">{d.site.name}</a>.
            </p>
          )}
        </Container>
      </section>

      <Faq items={faqs} title={`Questions about ${E.label} counselling.`} />
      <Cta />
    </>
  );
}

/**
 * What the exam's data holds, in real figures: the counts and a few examples, each with its document. `closing`: the
 * most-allotted seat's ladder first (the home page, whose hero has no ladder; the exam page's hero has it).
 */
export function Inside({ d, title, closing = false, children }: { d: LandingData; title: string; closing?: boolean; children?: React.ReactNode }) {
  const { E, counts: k } = d;
  const { who, L, viaSignup, lastRanks } = linksOf(d);
  const years = sessionExams.includes(d.exam) ? "sessions" : "counselling years";
  return (
    <section aria-labelledby="inside-h" className="border-b border-border">
      <Container className="py-16 md:py-24">
        <h2 id="inside-h" className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
        <p className="numeric mt-5 max-w-4xl text-xl leading-snug text-foreground md:text-3xl md:leading-tight">
          {n(k.institutes)} institutes, {n(k.courses)} courses and {n(k.allotments)} allotments across {k.years} {years}, {k.first} to {k.last}, with {n(k.seatLists)} seat lists.
        </p>
        <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {closing && d.closing && (
            <Note title={`Closing rank by round, ${d.closing.year}`} sources={[]} href={lastRanks(d.closing)} action="Open in Last ranks">
              <p className="mb-3">{d.closing.course} at {d.closing.college.name}, {d.closing.quota}, Open seats: the most-allotted seat in this quota. Each round links to its result PDF.</p>
              <Rounds c={d.closing} caption={`Closing rank by round: ${d.closing.course}, ${d.closing.college.name}, ${d.closing.year}`} />
            </Note>
          )}
          {d.deemed && (
            <Note title={`${d.deemed.quota}, ${d.deemed.year}`} sources={[]} href={lastRanks(d.deemed)} action="Open in Last ranks">
              <p className="mb-3">{d.deemed.course} at {d.deemed.college.name}, Open seats: the most-allotted seat in this quota.</p>
              <Rounds c={d.deemed} caption={`Closing rank by round: ${d.deemed.course}, ${d.deemed.college.name}, ${d.deemed.quota}, ${d.deemed.year}`} />
            </Note>
          )}
          {d.groups.length > 0 && (
            <Note title={`${d.groups.length} question groups in ${E.latestYear}`} sources={d.groupSource ? [{ name: d.groupSource.name, url: d.groupSource.url, year: String(E.latestYear) }] : []} href={viaSignup(L.options())} action="Pick your group in Options">
              <p className="mb-3">Your rank is compared only with your group&apos;s seats. Courses MCC allotted under each:</p>
              <ul className="numeric grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-foreground">
                {d.groups.slice(0, 6).map((g) => (
                  <li key={g.group} className="contents"><span>{g.group}</span><span className="text-right text-muted-foreground">{g.courses}</span></li>
                ))}
              </ul>
              {d.groups.length > 6 && <p className="mt-2">and {d.groups.length - 6} more.</p>}
            </Note>
          )}
          {E.crossover && (
            <Note
              title="Also in NEET PG counselling?"
              sources={crossover.bottomLine[0].refs.flatMap(([id]) => {
                const r = [...crossover.stages.flatMap((s) => s.rules), ...crossover.over].find((x) => x.id === id);
                return r ? [{ name: `${crossover.sources[r.doc]?.title ?? r.doc}, page ${r.page}`, url: r.url, year: r.session }] : [];
              })}
              href={viaSignup(L.to("/decide/counselling", { tab: "crossover" }))}
              action="Read every rule where the two meet"
            >
              <p className="text-foreground">{crossover.bottomLine[0].text}</p>
            </Note>
          )}
          {d.fee && (
            <Note title="Fee, stipend and bond for one seat" sources={d.fee.sources} href={viaSignup(L.institute(d.fee.college.slug, "fees"))} action="See this institute's fees">
              <p className="mb-3">{d.fee.course}, {d.fee.college.name}, {d.fee.quota}.</p>
              <dl className="numeric grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {d.fee.cells.map((c) => (
                  <div key={c.label} className="contents">
                    <dt>{c.label}</dt>
                    <dd className="text-right text-foreground">{c.value}</dd>
                  </div>
                ))}
              </dl>
            </Note>
          )}
          {d.seats && (
            <Note title={`The newest seat list: ${d.seats.roundName}, ${d.seats.yearName}`} sources={[{ name: `${who} ${kindName(d.seats.kind, d.exam).toLowerCase()} list, ${d.seats.roundName}`, url: d.seats.url, year: d.seats.yearName }]} href={viaSignup(L.seats({ list: d.seats.key }))} action="Open this seat list">
              <p>
                <span className="numeric text-2xl font-medium text-foreground">{n(d.seats.seats)}</span> seats in {who}&apos;s {kindName(d.seats.kind, d.exam).toLowerCase()} list
                {d.seats.apart ? <>, {n(d.seats.apart)} of them {E.apartQuotas?.name ?? "notified apart"}</> : null}
                {d.seats.publishedAt ? <>, published {fmtDay(d.seats.publishedAt)}</> : null}.
              </p>
            </Note>
          )}
        </div>
        {children}
      </Container>
    </section>
  );
}
