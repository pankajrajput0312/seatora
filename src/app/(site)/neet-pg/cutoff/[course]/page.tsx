import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/ui/source-label";
import { siteConfig } from "@/config/site";
import { roundName } from "@/features/decide/lib/round-status";
import { BranchNotes, BranchTables } from "@/features/exams/landing/branch-ranks";
import { branchFaqs, branchWords } from "@/features/exams/landing/college-words";
import { Crumbs, L } from "@/features/exams/landing/college-list";
import { branchPage, branchPath, collegePath, collegesPath } from "@/features/exams/landing/colleges";
import { cutoffPath } from "@/features/exams/landing/cutoff";
import { breadcrumbLd, JsonLd, pageMeta } from "@/lib/seo";

// One NEET PG branch, college by college (/neet-pg/cutoff/md-anaesthesiology): the latest round's last rank at each
// college per quota and seat category, with last year's deepest. Static, re-rendered hourly; every branch is built with
// the site (a course with no allotment in the round or last year is a 404). The hub, /neet-pg/cutoff, is its own page.
export const revalidate = 3600;
export const dynamicParams = true;
// Rendered on first visit, then cached for the hour (revalidate): pre-rendering these at build ran the build out of DB
// connections (20 Nov 2026). ponytail: prebuild a few again if first-visit latency matters.
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ course: string }> };
const load = async ({ params }: Props) => branchPage((await params).course);

export async function generateMetadata(props: Props): Promise<Metadata> {
  const p = await load(props);
  if (!p) return {};
  const w = branchWords(p);
  return pageMeta(branchPath(p.course.slug), w, w.absolute);
}

export default async function BranchPage(props: Props) {
  const p = await load(props);
  if (!p) notFound();
  const { at, d, course } = p;
  const w = branchWords(p);
  const round = roundName[at.round];
  const path = branchPath(course.slug);
  const crumbs: [string, string][] = [[siteConfig.name, "/"], ["NEET PG counselling", "/neet-pg"], ["Cutoff", "/neet-pg/cutoff"], [course.label, path]];
  const docs = [at.source, ...at.prevSources].filter((s) => !!s);
  const dataset = {
    "@type": "Dataset",
    name: w.h1,
    description: `The last (closing) All India Rank of ${course.label} at each college in MCC's ${at.provisional ? "provisional " : ""}NEET PG ${at.year} ${round} result, per quota and seat category, with each college's deepest Open closing of ${at.prevYear}.`,
    url: `${siteConfig.url}${path}`,
    temporalCoverage: `${at.prevYear}/${at.year}`,
    spatialCoverage: { "@type": "Country", name: "India" },
    inLanguage: "en-IN",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    isBasedOn: docs.map((s) => ({ "@type": "DigitalDocument", name: s.name, ...(s.url && { url: s.url }), publisher: { "@type": "GovernmentOrganization", name: "Medical Counselling Committee (MCC)", url: "https://mcc.nic.in/" } })),
    variableMeasured: ["Last (closing) All India Rank by college, quota and seat category", `${round} allotments by college and quota`],
    keywords: [`NEET PG ${at.year} ${course.label} cutoff`, `${course.label} closing rank`, `${course.label} college-wise cutoff`],
  };

  return (
    <>
      <JsonLd data={{ "@graph": [breadcrumbLd(crumbs), dataset] }} />
      <section aria-labelledby="b-h" className="border-b border-border">
        <Container className="pt-8 pb-16 sm:pt-16 md:pb-24">
          <Crumbs items={crumbs.slice(1)} />
          <h1 id="b-h" className="glow mt-4 max-w-4xl font-pixel text-3xl leading-[1] tracking-tight sm:text-4xl md:text-5xl">{w.h1}</h1>
          <p className="mt-5 max-w-prose text-base leading-relaxed text-muted-foreground">
            The highest All India Rank given a seat of {course.label} at each college in MCC&apos;s {at.provisional ? "provisional " : ""}{round} result, per quota and seat category
            {at.round !== "R1" ? `. ${round} counts only new allotments (Fresh Allotted and Upgraded): a college with none shows —` : ""}. Beside it, the college&apos;s deepest Open closing of {at.prevYear} (any round). History, not a prediction.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-3">
            {at.provisional && <Badge tone="warning">Provisional</Badge>}
            <span className="text-sm text-muted-foreground">MCC&apos;s All India counselling only; state quota isn&apos;t covered.</span>
          </p>
          <ul className="mt-2 grid gap-1">
            {docs.map((s) => (
              <li key={s.key}><SourceLabel provenance={{ sourceName: s.name, sourceUrl: s.url, sourceType: "OFFICIAL", academicYear: String(s.year) }} /></li>
            ))}
          </ul>

          <BranchTables d={d} href={(slug) => collegePath(slug)} noun={{ one: "college", many: "colleges", eg: "Delhi", sub: "State" }} cols={{ prev: `${at.prevYear} deepest, Open` }} className="mt-8" />
          <BranchNotes d={d} />
          <p className="mt-6 text-sm">
            <Link href={p.gated} className="inline-flex min-h-11 items-center gap-1.5 text-sky underline underline-offset-4 hover:no-underline">
              Every round and year of {course.label}, and where your rank stands: sign up free <ArrowRight className="size-4" aria-hidden />
            </Link>
          </p>
        </Container>
      </section>

      <Faq items={branchFaqs(p)} title={`Questions about the ${course.label} cutoff.`} />

      <section aria-labelledby="links-h" className="border-b border-border">
        <Container className="py-16 md:py-20">
          <h2 id="links-h" className="text-2xl font-semibold tracking-tight md:text-3xl">More NEET PG {at.year}</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <li><Link href={cutoffPath(at)} className={`inline-flex min-h-11 items-center ${L}`}>NEET PG {at.year} {round} cutoff by branch</Link></li>
            <li><Link href="/neet-pg/cutoff" className={`inline-flex min-h-11 items-center ${L}`}>NEET PG cutoff: every branch</Link></li>
            <li><Link href={collegesPath} className={`inline-flex min-h-11 items-center ${L}`}>NEET PG colleges by state</Link></li>
            <li><Link href="/neet-pg/college-predictor" className={`inline-flex min-h-11 items-center ${L}`}>NEET PG college predictor</Link></li>
          </ul>
        </Container>
      </section>
      <Cta />
    </>
  );
}
