import Link from "next/link";
import { notFound } from "next/navigation";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { dataVersion } from "@/features/decide/server/catalog";
import { roundName } from "@/features/decide/lib/round-status";
import { DEFAULT_EXAM } from "@/features/exams/keys";
import { BranchSearch } from "@/features/exams/landing/branch-search";
import { cutoffPath, cutoffWords } from "@/features/exams/landing/cutoff";
import { cutoffRounds } from "@/features/exams/landing/data";
import { HubHead, HubSection, Lead, hubCrumbs, hubLink } from "@/features/exams/landing/hub-bits";
import { courseLastRanks } from "@/features/exams/landing/hubs";
import { JsonLd, pageMeta, pageWords } from "@/lib/seo";

// NEET PG's cutoff hub: every result round's page and every branch's, with each branch's latest Open last rank. Static,
// re-rendered hourly like the round pages.
export const revalidate = 3600;
const PATH = "/neet-pg/cutoff";
export const metadata = pageMeta(PATH, pageWords[PATH]);
const n = formatRank;
/** The branch table's rows, cells and links, styled from the table (one class list, not one per row). */
const ROWS =
  "[&_tbody_tr]:border-t [&_tbody_tr]:border-border [&_tbody_tr:hover]:bg-muted [&_tbody_th]:px-3 [&_tbody_th]:py-2.5 [&_tbody_th]:text-left [&_tbody_th]:font-normal [&_tbody_th]:break-words md:[&_tbody_th]:px-4 [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-right md:[&_td]:px-4 [&_tbody_a]:underline [&_tbody_a]:decoration-foreground/25 [&_tbody_a]:underline-offset-4 [&_tbody_a:hover]:text-sky";

export default async function CutoffHub() {
  const [rounds, courses, marker] = await Promise.all([cutoffRounds(), courseLastRanks(), dataVersion(DEFAULT_EXAM)]);
  const latest = rounds[0];
  if (!latest) notFound();
  const years = [...new Set(rounds.map((r) => r.year))];
  const h1 = `NEET PG Cutoff ${latest.year} & Previous Years: Last Rank by Round and Branch`;
  const latestPath = cutoffPath(latest);
  const latestName = `${latest.year} ${roundName[latest.round]}${latest.provisional ? " (provisional)" : ""}`;
  // The most competitive branch of the latest round on All India Open seats: the FAQ's example.
  const top = courses.filter((c) => c.last?.page === latestPath && c.last.quota === "All India").sort((a, b) => a.last!.closing - b.last!.closing)[0];
  const withRank = courses.filter((c) => c.last).length;

  const faqs = [
    {
      q: `What is the NEET PG cutoff ${latest.year}?`,
      a: `For counselling, the cutoff is MCC's closing rank: the last All India Rank given a seat of a branch in a round, per quota and seat category. MCC's latest result here is ${latestName}${top ? `; its most competitive branch on All India Open seats, ${top.course}, closed at AIR ${n(top.last!.closing)}` : ""}. NBEMS's qualifying percentile (who may join counselling) is a different cutoff, not shown here.`,
    },
    {
      q: "Where is the NEET PG previous year cutoff?",
      a: `Every MCC result round from ${years.at(-1)} to ${years[0]} has its own page above: ${n(rounds.length)} rounds, each with the last rank of every branch per quota and category. Each branch's page shows its last rank round by round.`,
    },
    { q: "Is the closing rank the same as the last rank?", a: "Yes. Both mean the highest All India Rank that got a seat in that round, on that quota and seat category. A rank at or before it got a seat in that round; history, not a promise." },
    {
      q: "Why can Round 2 close at a better rank than Round 1?",
      a: "From Round 2 on, a round's last rank counts only its new allotments (Fresh Allotted and Upgraded). Seats kept from an earlier round don't count, so a branch can close lower in Round 2 than in Round 1.",
    },
    { q: "Does this include state quota cutoffs?", a: "No. These are MCC's All India counselling results: the All India Quota, deemed and central universities, and DNB seats. State quota counselling is run by each state and isn't covered." },
  ];

  return (
    <>
      <JsonLd
        data={{
          "@graph": [
            hubCrumbs(["NEET PG cutoff", PATH]),
            {
              "@type": "CollectionPage",
              name: h1,
              url: `${siteConfig.url}${PATH}`,
              description: pageWords[PATH].description,
              inLanguage: "en-IN",
              isPartOf: { "@id": `${siteConfig.url}/#website` },
              ...(marker && { dateModified: marker }),
              mainEntity: {
                "@type": "ItemList",
                name: "NEET PG cutoff by round",
                itemListElement: rounds.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: cutoffWords(r).name, url: `${siteConfig.url}${cutoffPath(r)}` })),
              },
              hasPart: {
                "@type": "ItemList",
                name: "NEET PG cutoff by branch",
                itemListElement: courses.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: `${c.course} cutoff`, url: `${siteConfig.url}${c.path}` })),
              },
            },
          ],
        }}
      />
      <HubHead trail={[["NEET PG cutoff", PATH]]} h1={h1}>
        <Lead>
          The NEET PG cutoff for counselling is MCC&apos;s closing rank: the last All India Rank given a seat of a branch in a round, per quota and seat
          category, from MCC&apos;s allotment result PDFs. {n(rounds.length)} rounds from {years.at(-1)} to {years[0]}, {n(courses.length)} branches. History,
          not a prediction.
        </Lead>
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
          All India Quota, deemed and DNB seats only: state quota counselling isn&apos;t covered.
        </p>
        <p className="mt-6 text-base">
          Latest:{" "}
          <Link href={latestPath} className={hubLink}>{cutoffWords(latest).name}</Link>
          {latest.provisional && <Badge tone="warning" className="ml-2 align-middle">Provisional</Badge>}
        </p>
      </HubHead>

      <HubSection id="rounds-h" title="Cutoff by round">
        <div className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {years.map((y) => (
            <div key={y} className="border-t border-border pt-4">
              <h3 className="numeric text-base font-medium">{y}</h3>
              <ul className="mt-2 grid gap-1 text-sm">
                {rounds.filter((r) => r.year === y).map((r) => (
                  <li key={r.round}>
                    <Link href={cutoffPath(r)} className={`inline-flex min-h-11 items-center ${hubLink}`}>
                      {roundName[r.round]} cutoff{r.provisional ? " (provisional)" : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </HubSection>

      <HubSection
        id="branches-h"
        title="Cutoff by branch"
        intro={`Each branch's latest last rank on Open seats in a main round (Round 1 to 3; stray rounds close far later and aren't counted here): All India Quota, or the DNB quota for DNB courses. ${n(withRank)} of ${n(courses.length)} branches have one; open a branch for every round.`}
      >
        <div data-lr className="mt-6">
          <BranchSearch />
          <div data-panel="branches" className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
            <table className={`w-full text-sm ${ROWS}`}>
              <caption className="sr-only">NEET PG last rank by branch, latest main round, Open seats</caption>
              <thead>
                <tr className="font-mono text-xs uppercase tracking-widest text-muted-foreground [&_th]:px-3 [&_th]:py-3 [&_th]:font-normal md:[&_th]:px-4">
                  <th scope="col" className="text-left">Branch</th>
                  <th scope="col" className="text-right">Open last rank</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.path} data-name={c.course.toLowerCase()}>
                    <th scope="row"><Link href={c.path}>{c.course}</Link></th>
                    <td>
                      {c.last ? (
                        <>
                          <span className="numeric block text-base">{n(c.last.closing)}</span>
                          <Link href={c.last.page} className="text-xs text-muted-foreground">
                            {c.last.year} {roundName[c.last.round]}{c.last.quota === "All India" ? "" : ", DNB quota"}{c.last.provisional ? ", provisional" : ""}
                          </Link>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p data-none hidden className="border-t border-border px-4 py-6 text-sm text-muted-foreground">No branch matches.</p>
          </div>
        </div>
      </HubSection>

      <HubSection id="how-h" title="Closing rank, rounds and provisional results">
        <dl className="mt-8 grid max-w-4xl gap-x-12 gap-y-8 text-sm leading-relaxed md:grid-cols-3">
          {[
            ["Closing rank, last rank", "The same thing: the highest All India Rank MCC gave a seat of that branch in that round, quota and seat category. A rank at or before it got a seat in that round."],
            ["Rounds", "MCC allots in Round 1, Round 2 and Round 3, then a stray vacancy round. From Round 2 on, a round counts only its new allotments (Fresh Allotted and Upgraded), so it can close lower than Round 1. Stray rounds close far later."],
            ["Provisional", "MCC publishes a round's provisional result first; the final result can differ. A provisional round is marked so here, and replaced once MCC publishes the final one."],
          ].map(([t, d]) => (
            <div key={t} className="border-t border-border pt-4">
              <dt className="text-base font-medium">{t}</dt>
              <dd className="mt-2 text-muted-foreground">{d}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 flex flex-wrap gap-x-6 text-sm">
          <Link href="/neet-pg/college-predictor" className={`inline-flex min-h-11 items-center ${hubLink}`}>Where your rank got in: the college predictor</Link>
          <Link href="/neet-pg/counselling-2026" className={`inline-flex min-h-11 items-center ${hubLink}`}>NEET PG counselling 2026 dates</Link>
        </p>
      </HubSection>

      <Faq items={faqs} title="Questions about the NEET PG cutoff." />
      <Cta />
    </>
  );
}
