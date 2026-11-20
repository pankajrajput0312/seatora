import Link from "next/link";
import { Info } from "lucide-react";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";
import { fmtDay } from "@/features/decide/lib/format";
import { alertOf, badgeOf, fillWindow, fmtIST, fmtNote, joiningOf, nextChoiceFilling, roundName, stepName, type StepNow } from "@/features/decide/lib/round-status";
import { rounds } from "@/features/decide/types";
import { crossover } from "@/features/exams/crossover";
import { DEFAULT_EXAM, exams } from "@/features/exams/registry";
import { cutoffPath } from "@/features/exams/landing/cutoff";
import { cutoffRounds } from "@/features/exams/landing/data";
import { HubHead, HubSection, Lead, hubCrumbs, hubLink } from "@/features/exams/landing/hub-bits";
import { counselling } from "@/features/exams/landing/hubs";
import { JsonLd, pageMeta, pageWords } from "@/lib/seo";

// NEET PG counselling 2026: where each round stands (MCC's notices, the round steps Decide reads), the latest notices
// and how MCC's rounds work, each rule from MCC's 2026 Information Bulletin with its page. Static, re-rendered hourly.
export const revalidate = 3600;
const PATH = "/neet-pg/counselling-2026";
const YEAR = 2026;
export const metadata = pageMeta(PATH, pageWords[PATH]);

/**
 * MCC's own rules (./crossover.ts holds them with their quotes, document and page): how its rounds, upgrades and
 * deposits work, in the order a candidate meets them. Only MCC's NEET PG documents: never AIIMS's.
 */
const HOW = [
  "mcc_round_rules_apply",
  "mcc_r1_free_exit",
  "mcc_deposit_amounts",
  "mcc_deposit_forfeit_r2_onwards",
  "mcc_r2_upgrade_loses_r1",
  "mcc_resign_r1_r2_only",
  "mcc_r3_upgrade_no_claim",
  "mcc_r3_no_resign",
  "mcc_stray_must_join",
  "mcc_refund_after_all_rounds",
  "mcc_college_terms_not_mcc",
  "mcc_state_rules_are_states",
];
const ruleById = new Map([...crossover.stages.flatMap((s) => s.rules), ...crossover.over].map((r) => [r.id, r]));
const how = HOW.flatMap((id) => {
  const r = ruleById.get(id);
  return r ? [{ id, text: crossover.words(r.rule), url: r.url, page: r.page, doc: crossover.sources[r.doc]?.title ?? r.doc }] : [];
});
const rule = (id: string) => how.find((r) => r.id === id);
const cite = (r: { page: number }) => `MCC's 2026 Information Bulletin, page ${r.page}`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** A step's dates: the notice's date once done (a choice filling: its window), else the schedule's, or why there are none. */
const when = (s: StepNow) =>
  s.clock === "moved" ? "New date not announced" : s.scheduled && (s.now !== "done" || s.step === "choice_filling") ? fillWindow(s) : s.date ? fmtIST(s.date) : "—";

export default async function Counselling2026() {
  const [{ status, notices }, results] = await Promise.all([counselling(YEAR), cutoffRounds()]);
  const steps = status?.steps ?? [];
  const site = exams[DEFAULT_EXAM].site ?? { url: "https://mcc.nic.in/", name: "MCC's website" };
  const h1 = `NEET PG Counselling ${YEAR}: Rounds, Dates and Results`;
  const held = alertOf(steps);
  const byRound = rounds.flatMap((r) => {
    const xs = steps.filter((s) => s.round === r);
    // The round's words once: its result notes (the final result's carries the provisional one's and the schedule's).
    const note = xs.filter((s) => s.step.endsWith("_result") && s.note).sort((a, b) => b.note!.length - a.note!.length)[0]?.note;
    return xs.length ? [{ round: r, steps: xs, note: note ? cap(fmtNote(note)) : null }] : [];
  });
  const yearResults = results.filter((r) => r.year === YEAR);

  // The FAQ's facts, each from the steps (MCC's notices) or a rule with its page.
  const lastResult = [...steps].reverse().find((s) => s.step.endsWith("_result") && s.now === "done");
  const next = nextChoiceFilling(steps);
  const joining = next && joiningOf(steps.filter((s) => s.round === next.round));
  const deposit = rule("mcc_deposit_amounts");
  const upgrade = rule("mcc_r2_upgrade_loses_r1");
  const faqs = [
    ...(lastResult
      ? [{
          q: `Is the NEET PG ${YEAR} ${roundName[lastResult.round]} result out?`,
          a: `MCC published the ${stepName[lastResult.step].toLowerCase()} of ${roundName[lastResult.round]} on ${fmtIST(lastResult.date ?? "", true)}${lastResult.step === "provisional_result" ? "; the final result comes next, and the provisional one can change" : ""}. Its last rank by branch is on Seatora's ${roundName[lastResult.round]} cutoff page.`,
        }]
      : []),
    ...(next
      ? [{
          q: `When is NEET PG ${YEAR} ${roundName[next.round]} counselling?`,
          a: `${roundName[next.round]} choice filling: ${fillWindow(next)}${joining ? `; last date of joining ${joining.by}${joining.tentative ? " (tentative)" : ""}` : ""}, per MCC's notices as Seatora last read them${status ? ` (${fmtIST(status.asOf)})` : ""}. Dates can move: MCC posts every notice on mcc.nic.in.`,
        }]
      : []),
    ...(deposit ? [{ q: "How much is the MCC security deposit for NEET PG?", a: `${deposit.text} (${cite(deposit)}.)` }] : []),
    ...(upgrade ? [{ q: "What happens to my Round 1 seat if I upgrade in Round 2?", a: `${upgrade.text} (${cite(upgrade)}.)` }] : []),
    { q: "Does Seatora cover state quota counselling?", a: "No. Seatora covers MCC's All India counselling: the All India Quota, deemed and central universities, and DNB seats. Each state runs its own quota counselling, with its own dates." },
  ];

  return (
    <>
      <JsonLd
        data={{
          "@graph": [
            hubCrumbs([`Counselling ${YEAR}`, PATH]),
            {
              "@type": "WebPage",
              name: h1,
              url: `${siteConfig.url}${PATH}`,
              description: pageWords[PATH].description,
              inLanguage: "en-IN",
              isPartOf: { "@id": `${siteConfig.url}/#website` },
              ...(status && { dateModified: status.asOf }),
              about: { "@type": "Thing", name: `NEET PG ${YEAR} counselling by the Medical Counselling Committee (MCC)` },
            },
          ],
        }}
      />
      <HubHead trail={[[`Counselling ${YEAR}`, PATH]]} h1={h1}>
        <Lead>
          MCC (the Medical Counselling Committee) runs NEET PG counselling for the All India Quota seats of government colleges, deemed and central
          universities and DNB hospitals, in Round 1, Round 2, Round 3 and a stray vacancy round. Where {YEAR} stands, from MCC&apos;s notices
          {status && <> as Seatora last read them at <span className="text-foreground">{fmtIST(status.asOf)}</span></>}.
        </Lead>
        <p className="mt-4 flex max-w-prose gap-2 rounded-md bg-sun/10 px-3 py-2.5 text-sm leading-relaxed text-sun">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          State quota counselling isn&apos;t covered: each state runs its own, with its own dates.
        </p>
      </HubHead>

      <HubSection id="schedule-h" title={`NEET PG counselling ${YEAR} schedule`} intro="Each step moves on only when an MCC notice or a date printed in MCC's schedule says so. Tentative dates can move.">
        {held && (
          <p className="mt-6 flex max-w-prose gap-2 rounded-md bg-sun/10 px-3 py-2.5 text-sm leading-relaxed text-sun">
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <a href={held.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:no-underline">{held.text}<span className="sr-only"> (MCC notice, opens in a new tab)</span></a>
          </p>
        )}
        {byRound.length ? (
          <div className="mt-8 grid gap-x-8 gap-y-10 md:grid-cols-2">
            {byRound.map((r) => (
              <div key={r.round} className="border-t border-border pt-4">
                <h3 className="text-lg font-medium">{roundName[r.round]}</h3>
                <table className="mt-2 w-full text-sm">
                  <caption className="sr-only">{`NEET PG ${YEAR} ${roundName[r.round]}: steps, status and dates`}</caption>
                  <tbody>
                    {r.steps.map((s) => (
                      <tr key={s.step} className="border-b border-border/60 last:border-0">
                        <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">
                          {s.url ? (
                            <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.title ?? undefined} className={hubLink}>
                              {stepName[s.step]}<span className="sr-only"> (MCC notice, opens in a new tab)</span>
                            </a>
                          ) : stepName[s.step]}
                        </th>
                        <td className="numeric py-2 pr-3 text-right">{when(s)}</td>
                        <td className="w-0 py-2 text-right whitespace-nowrap"><Badge tone={badgeOf(s).tone}>{badgeOf(s).text}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.note && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{r.note}.</p>}
                {yearResults.some((x) => x.round === r.round) && (
                  <Link href={cutoffPath({ year: YEAR, round: r.round })} className={`mt-1 inline-flex min-h-11 items-center text-sm ${hubLink}`}>
                    {roundName[r.round]} cutoff by branch
                  </Link>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 max-w-prose text-base text-muted-foreground">No MCC schedule for {YEAR} is in Seatora&apos;s data yet.</p>
        )}
      </HubSection>

      {notices.length > 0 && (
        <HubSection id="notices-h" title={`Latest MCC notices, ${YEAR}`}>
          <ul className="mt-6 divide-y divide-border border-y border-border text-sm">
            {notices.slice(0, 10).map((x) => (
              <li key={x.url} className="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
                <span className="numeric text-muted-foreground">{fmtDay(x.date)}</span>
                <a href={x.url!} target="_blank" rel="noopener noreferrer" className={hubLink}>{x.title}<span className="sr-only"> (opens in a new tab)</span></a>
              </li>
            ))}
          </ul>
          <a href={site.url} target="_blank" rel="noopener noreferrer" className={`mt-2 inline-flex min-h-11 items-center text-sm ${hubLink}`}>
            Every notice on {site.name}<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </HubSection>
      )}

      {how.length > 0 && (
        <HubSection id="how-h" title="How MCC counselling works" intro="MCC's own rules for NEET PG 2026, in plain words, each with the page of MCC's Information Bulletin it is from. Your college's bond and leaving penalty are its own, on top of these.">
          <ol className="mt-8 grid max-w-3xl gap-4 text-sm leading-relaxed">
            {how.map((r) => (
              <li key={r.id} className="border-t border-border pt-4">
                <p className="text-foreground">{r.text}</p>
                <a href={r.url} target="_blank" rel="noopener noreferrer" title={r.doc} className={`mt-1 inline-flex min-h-9 items-center text-xs text-muted-foreground ${hubLink}`}>
                  {cite(r)}<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-8 flex flex-wrap gap-x-6 text-sm">
            <Link href="/neet-pg/cutoff" className={`inline-flex min-h-11 items-center ${hubLink}`}>NEET PG cutoff, every round</Link>
            <Link href="/neet-pg/college-predictor" className={`inline-flex min-h-11 items-center ${hubLink}`}>Where your rank got in</Link>
            <Link href="/neet-pg/stipend-bond" className={`inline-flex min-h-11 items-center ${hubLink}`}>Stipend and bond by college</Link>
            <Link href={`/signup?${new URLSearchParams({ next: "/decide/options" })}`} className={`inline-flex min-h-11 items-center ${hubLink}`}>Your options in the planner</Link>
          </p>
        </HubSection>
      )}

      <Faq items={faqs} title={`Questions about NEET PG counselling ${YEAR}.`} />
      <Cta />
    </>
  );
}
