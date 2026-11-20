import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Cta } from "@/components/marketing/cta";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/ui/source-label";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { roundName } from "@/features/decide/lib/round-status";
import { indexWords } from "@/features/exams/landing/college-words";
import { CollegeList, Crumbs, L } from "@/features/exams/landing/college-list";
import { collegeIndex, collegePath, collegesPath, statePath, statesOf, typeKeys } from "@/features/exams/landing/colleges";
import { breadcrumbLd, JsonLd, pageMeta } from "@/lib/seo";

// Every NEET PG college, public and indexable: the most competitive on All India seats, and each state's page (the full
// lists). Static, re-rendered hourly like /neet-pg.
export const revalidate = 3600;
const TOP = 50;

export async function generateMetadata(): Promise<Metadata> {
  const d = await collegeIndex();
  const w = indexWords(d.at, d.colleges.length);
  return pageMeta(collegesPath, w, w.absolute);
}

export default async function CollegesPage() {
  const d = await collegeIndex();
  const { at } = d;
  const w = indexWords(at, d.colleges.length);
  const states = statesOf(d.colleges);
  const top = d.colleges.filter((c) => c.best?.quota === "All India").slice(0, TOP);
  const types = typeKeys.map((t) => ({ ...t, n: d.colleges.filter((c) => c.type.key === t.key).length })).filter((t) => t.n);
  const round = roundName[at.round];
  const crumbs: [string, string][] = [[siteConfig.name, "/"], ["NEET PG counselling", "/neet-pg"], ["Colleges", collegesPath]];
  const list = {
    "@type": "ItemList",
    name: `Most competitive NEET PG ${at.year} colleges on All India seats`,
    numberOfItems: top.length,
    itemListElement: top.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, url: `${siteConfig.url}${collegePath(c.slug)}` })),
  };

  return (
    <>
      <JsonLd data={{ "@graph": [breadcrumbLd(crumbs), list] }} />
      <section aria-labelledby="col-h" className="border-b border-border">
        <Container className="pt-8 pb-16 sm:pt-16 md:pb-20">
          <Crumbs items={crumbs.slice(1)} />
          <h1 id="col-h" className="glow mt-4 max-w-4xl font-pixel text-3xl leading-[1] tracking-tight sm:text-4xl md:text-5xl">{w.h1}</h1>
          <p className="mt-5 max-w-prose text-base leading-relaxed text-muted-foreground">
            {formatRank(d.colleges.length)} colleges and DNB hospitals are in MCC&apos;s NEET PG counselling data: {types.map((t) => `${formatRank(t.n)} ${t.label}`).join(", ")}. Each has a page with its last rank by course in {at.year} {round}, last year&apos;s deepest closing, seats in the newest seat lists, fee, stipend and bond, and how many residents MCC&apos;s admitted lists show.
          </p>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            MCC&apos;s All India counselling only (All India Quota, deemed and central universities, DNB seats); state quota counselling isn&apos;t covered. A college&apos;s type is inferred from its name and quota, not an official classification.
          </p>
        </Container>
      </section>

      <section aria-labelledby="states-h" className="border-b border-border">
        <Container className="py-16 md:py-20">
          <h2 id="states-h" className="text-2xl font-semibold tracking-tight md:text-3xl">Colleges by state</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {states.map((s) => (
              <li key={s.slug}>
                <Link href={statePath(s.state)} className={`inline-flex min-h-11 items-center gap-2 ${L}`}>
                  {s.state} <span className="numeric text-xs text-muted-foreground">{formatRank(s.n)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="top-h" className="border-b border-border">
        <Container className="py-16 md:py-20">
          <h2 id="top-h" className="text-2xl font-semibold tracking-tight md:text-3xl">
            The {TOP} most competitive on All India seats, {at.year} {round}
            {at.provisional && <Badge tone="warning" className="ml-3 align-middle">Provisional</Badge>}
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Each college&apos;s most competitive course: the lowest last All India Rank on Open seats of the All India Quota in {round}
            {at.round !== "R1" ? `, which counts only new allotments (Fresh Allotted and Upgraded)` : ""}. History, not a prediction. Every college is on its state&apos;s page.
          </p>
          {at.source && (
            <p className="mt-2">
              <SourceLabel provenance={{ sourceName: at.source.name, sourceUrl: at.source.url, sourceType: "OFFICIAL", academicYear: String(at.year) }} />
            </p>
          )}
          <CollegeList rows={top} place="state" caption={`The ${TOP} most competitive NEET PG colleges on All India seats, ${at.year} ${round}`} className="mt-6" />
        </Container>
      </section>
      <Cta />
    </>
  );
}
