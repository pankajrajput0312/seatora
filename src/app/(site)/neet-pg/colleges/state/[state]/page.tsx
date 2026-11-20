import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Cta } from "@/components/marketing/cta";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/ui/source-label";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { roundName } from "@/features/decide/lib/round-status";
import { stateWords } from "@/features/exams/landing/college-words";
import { CollegeList, Crumbs, L } from "@/features/exams/landing/college-list";
import { collegeIndex, collegePath, collegesPath, stateColleges, statePath, statesOf } from "@/features/exams/landing/colleges";
import { breadcrumbLd, JsonLd, pageMeta } from "@/lib/seo";

// One state's NEET PG colleges (/neet-pg/colleges/state/maharashtra): every one, most competitive first. Static, hourly;
// every state is built with the site, a slug no state has is a 404.
export const revalidate = 3600;
export const dynamicParams = true;
export const generateStaticParams = async () => statesOf((await collegeIndex().catch(() => null))?.colleges ?? []).map((s) => ({ state: s.slug }));

type Props = { params: Promise<{ state: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await stateColleges((await params).state);
  if (!d) return {};
  const w = stateWords(d.at, d.state, d.colleges.length);
  return pageMeta(statePath(d.state), w, w.absolute);
}

export default async function StatePage({ params }: Props) {
  const d = await stateColleges((await params).state);
  if (!d) notFound();
  const { at, state } = d;
  const w = stateWords(at, state, d.colleges.length);
  const round = roundName[at.round];
  const crumbs: [string, string][] = [[siteConfig.name, "/"], ["NEET PG counselling", "/neet-pg"], ["Colleges", collegesPath], [state, statePath(state)]];
  const list = {
    "@type": "ItemList",
    name: `NEET PG colleges in ${state}`,
    numberOfItems: d.colleges.length,
    itemListElement: d.colleges.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, url: `${siteConfig.url}${collegePath(c.slug)}` })),
  };

  return (
    <>
      <JsonLd data={{ "@graph": [breadcrumbLd(crumbs), list] }} />
      <section aria-labelledby="st-h" className="border-b border-border">
        <Container className="pt-8 pb-16 sm:pt-16 md:pb-24">
          <Crumbs items={crumbs.slice(1)} />
          <h1 id="st-h" className="glow mt-4 max-w-4xl font-pixel text-3xl leading-[1] tracking-tight sm:text-4xl md:text-5xl">{w.h1}</h1>
          <p className="mt-5 max-w-prose text-base leading-relaxed text-muted-foreground">
            {formatRank(d.colleges.length)} colleges and DNB hospitals in {state} are in MCC&apos;s NEET PG counselling data, most competitive first: the lowest last rank on Open seats of any course in {at.year} {round}
            {at.round !== "R1" ? " (new allotments only)" : ""}, on All India seats, else deemed, else DNB seats. History, not a prediction.
          </p>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            MCC&apos;s All India counselling only; {state}&apos;s state quota counselling isn&apos;t covered. A college&apos;s type is inferred from its name and quota, not an official classification.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-3">
            {at.source && <SourceLabel provenance={{ sourceName: at.source.name, sourceUrl: at.source.url, sourceType: "OFFICIAL", academicYear: String(at.year) }} />}
            {at.provisional && <Badge tone="warning">Provisional</Badge>}
          </p>
          <CollegeList rows={d.colleges} place="pincode" caption={`NEET PG colleges in ${state}, ${at.year} ${round}`} className="mt-8" />
        </Container>
      </section>

      <section aria-labelledby="states-h" className="border-b border-border">
        <Container className="py-16 md:py-20">
          <h2 id="states-h" className="text-2xl font-semibold tracking-tight md:text-3xl">Other states</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {d.states.filter((s) => s.state !== state).map((s) => (
              <li key={s.slug}>
                <Link href={statePath(s.state)} className={`inline-flex min-h-11 items-center gap-2 ${L}`}>
                  {s.state} <span className="numeric text-xs text-muted-foreground">{formatRank(s.n)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      <Cta />
    </>
  );
}
