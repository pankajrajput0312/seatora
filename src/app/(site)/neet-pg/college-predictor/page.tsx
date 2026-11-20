import Link from "next/link";
import { Cta } from "@/components/marketing/cta";
import { accessFaq, Faq } from "@/components/marketing/faq";
import { RankForm, RankRows } from "@/components/marketing/rank-check";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/ui/source-label";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { roundName } from "@/features/decide/lib/round-status";
import { DEFAULT_EXAM, exams } from "@/features/exams/registry";
import { cutoffPath } from "@/features/exams/landing/cutoff";
import { HubHead, HubSection, Lead, hubCrumbs, hubLink } from "@/features/exams/landing/hub-bits";
import { rankBands } from "@/features/exams/landing/hubs";
import { JsonLd, pageMeta, pageWords } from "@/lib/seo";

// The college predictor: the public rank check's form (its answer is /neet-pg/rank, last year's Rounds 1 to 3) with
// what a few ranks got in the latest round, from MCC's result. Static, re-rendered hourly; no prediction anywhere.
export const revalidate = 3600;
const PATH = "/neet-pg/college-predictor";
export const metadata = pageMeta(PATH, pageWords[PATH]);
const n = formatRank;
const BANDS = [10_000, 25_000, 50_000, 100_000];

export default async function CollegePredictor() {
  const b = await rankBands(BANDS);
  // The rank check's year: NEET PG's last complete counselling (registry pastYears), Rounds 1 to 3.
  const lastYear = exams[DEFAULT_EXAM].pastYears[1];
  const round = `${b.year} ${roundName[b.round]}`;
  const h1 = `NEET PG College Predictor ${b.year} (from Past Closing Ranks)`;
  const description = pageWords[PATH].description;

  const faqs = [
    {
      q: "Is this NEET PG college predictor a prediction?",
      a: `No. It shows where ranks like yours were allotted in MCC's past rounds: history, not a prediction. This year's seats, candidates and rounds can differ, so no one can promise a seat honestly.`,
    },
    {
      q: "Which year's closing ranks does it use?",
      a: `The form reads MCC's ${lastYear} Rounds 1 to 3, the last complete counselling. The examples on this page are from ${round}${b.provisional ? " (provisional)" : ""}, MCC's latest result.`,
    },
    {
      q: `What did AIR ${n(BANDS[1])} get in ${round}?`,
      a: `${n(b.bands[1].n)} options anyone can take (All India, deemed and DNB) had an Open last rank at or after AIR ${n(BANDS[1])}${b.bands[1].rows[0] ? `, the tightest ${b.bands[1].rows[0].course} at ${b.bands[1].rows[0].college.name} (${n(b.bands[1].rows[0].closing)})` : ""}.`,
    },
    { q: "Does it include state quota seats?", a: "No. Only MCC's All India counselling: the All India Quota, deemed and central universities, and DNB seats. State quota counselling isn't covered." },
    { q: "Does it count my category?", a: "Yes. Pick your category and it reads the seats a candidate of that category can be allotted (Open seats included). Restricted quotas (NRI, Armed Forces, minority, a university's own) and stray rounds are in the planner." },
    accessFaq(),
  ];

  return (
    <>
      <JsonLd
        data={{
          "@graph": [
            hubCrumbs(["College predictor", PATH]),
            {
              "@type": "WebApplication",
              name: "Seatora NEET PG college predictor",
              url: `${siteConfig.url}${PATH}`,
              description,
              applicationCategory: "EducationalApplication",
              operatingSystem: "Web",
              inLanguage: "en-IN",
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
              publisher: { "@id": `${siteConfig.url}/#organization` },
            },
          ],
        }}
      />
      <HubHead trail={[["College predictor", PATH]]} h1={h1}>
        <Lead>
          Enter your All India Rank and category: Seatora shows the MCC seats that ranks like yours were allotted in MCC&apos;s {lastYear} Rounds 1 to 3, the
          most sought ones first, each with its result PDF. History-based, not a prediction.
        </Lead>
        <div className="mt-8 max-w-2xl rounded-xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-base font-medium">Where did your rank get in?</h2>
          <RankForm className="mt-4" />
        </div>
      </HubHead>

      <HubSection id="how-h" title="How it works, honestly">
        <ul className="mt-6 grid max-w-prose gap-3 text-sm leading-relaxed text-muted-foreground">
          <li>It reads MCC&apos;s allotment result PDFs: every seat anyone can take (All India Quota, deemed and DNB), round by round, on the seats your category can be allotted.</li>
          <li>&ldquo;Got in&rdquo; means a seat&apos;s last rank in a round was at or after yours: someone with your rank or a later one was allotted it then. Stray rounds don&apos;t count.</li>
          <li>It is not a prediction and gives no chance or percentage: this year&apos;s seats, candidates and rounds can differ.</li>
          <li>State quota counselling isn&apos;t covered.</li>
        </ul>
      </HubSection>

      <HubSection
        id="bands-h"
        title={`What these ranks got in ${round}`}
        intro={`Open seats, any quota anyone can take. For each rank, how many options had a last rank at or after it in ${round}, and the three tightest at different institutes.`}
      >
        <p className="mt-3 flex flex-wrap items-center gap-2">
          {b.provisional && <Badge tone="warning">Provisional</Badge>}
          {b.source && <SourceLabel provenance={{ sourceName: b.source.name, sourceUrl: b.source.url, sourceType: "OFFICIAL", academicYear: String(b.year) }} />}
        </p>
        <div className="mt-8 grid gap-x-12 gap-y-10 md:grid-cols-2">
          {b.bands.map((r) => (
            <article key={r.rank}>
              <h3 className="numeric text-lg font-medium">AIR {n(r.rank)}, Open</h3>
              <p className="mt-1 mb-3 text-sm text-muted-foreground">
                {n(r.n)} {r.n === 1 ? "option" : "options"} closed at or after it.
              </p>
              {r.rows.length > 0 && <RankRows r={r} />}
            </article>
          ))}
        </div>
        <p className="mt-8 flex flex-wrap gap-x-6 text-sm">
          <Link href={cutoffPath(b)} className={`inline-flex min-h-11 items-center ${hubLink}`}>{round} cutoff by branch</Link>
          <Link href="/neet-pg/cutoff" className={`inline-flex min-h-11 items-center ${hubLink}`}>NEET PG cutoff, every round</Link>
          <Link href="/neet-pg/stipend-bond" className={`inline-flex min-h-11 items-center ${hubLink}`}>Stipend and bond by college</Link>
        </p>
      </HubSection>

      <Faq items={faqs} title="Questions about the college predictor." />
      <Cta />
    </>
  );
}
