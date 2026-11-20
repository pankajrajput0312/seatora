import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { SourceLabel } from "@/components/ui/source-label";
import { siteConfig } from "@/config/site";
import { roundName } from "@/features/decide/lib/round-status";
import { BranchNotes, BranchTables } from "@/features/exams/landing/branch-ranks";
import { coursePath, cutoffPath, cutoffWords } from "@/features/exams/landing/cutoff";
import { cutoffPage, cutoffRounds } from "@/features/exams/landing/data";
import { cutoffText } from "@/features/exams/landing/words";
import { breadcrumbLd, JsonLd, pageMeta } from "@/lib/seo";

// One NEET PG result round's last rank by branch, public and indexable (/neet-pg/round-2-cutoff-2026): static, re-rendered
// hourly like /neet-pg. The latest round is built with the site; an older round's page renders on its first visit.
export const revalidate = 3600;
export const generateStaticParams = async () => (await cutoffRounds()).slice(0, 1).map((r) => ({ cutoff: cutoffPath(r).split("/").pop()! }));

type Props = { params: Promise<{ cutoff: string }> };
const load = async ({ params }: Props) => cutoffPage(`/neet-pg/${(await params).cutoff}`);
const link = "underline decoration-foreground/25 underline-offset-4 hover:text-sky";
/** A branch's own page, every round (/neet-pg/cutoff/md-general-medicine), whatever the quota. */
const branchPage = (slug: string) => coursePath({ slug, degree: "", name: "" });

export async function generateMetadata(props: Props): Promise<Metadata> {
  const p = await load(props);
  return p ? pageMeta(p.d.path, cutoffWords(p.at)) : {};
}

export default async function CutoffPage(props: Props) {
  const p = await load(props);
  if (!p) notFound();
  const { d, at } = p;
  const w = cutoffWords(at);
  const t = cutoffText(p);
  const round = roundName[d.round];
  const dataset = {
    "@type": "Dataset",
    name: w.h1,
    description: t.intro.join(" "),
    url: `${siteConfig.url}${d.path}`,
    temporalCoverage: String(at.year),
    spatialCoverage: { "@type": "Country", name: "India" },
    inLanguage: "en-IN",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    isBasedOn: {
      "@type": "DigitalDocument",
      name: d.source.name,
      ...(d.source.url && { url: d.source.url }),
      publisher: { "@type": "GovernmentOrganization", name: "Medical Counselling Committee (MCC)", url: "https://mcc.nic.in/" },
    },
    variableMeasured: ["Last (closing) All India Rank by branch, quota and seat category", `${d.round === "R1" ? "Allotments" : "New allotments"} by branch`],
    keywords: [`NEET PG ${at.year} ${round} cutoff`, `NEET PG ${round} last rank`, "NEET PG closing rank", "MCC allotment result"],
  };

  return (
    <>
      <JsonLd data={{ "@graph": [breadcrumbLd([[siteConfig.name, "/"], ["NEET PG counselling", "/neet-pg"], ["NEET PG cutoff", "/neet-pg/cutoff"], [w.name, d.path]]), dataset] }} />
      <section aria-labelledby="cut-h" className="border-b border-border">
        <Container className="pt-8 pb-16 sm:pt-16 md:pb-24">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
              <li><Link href="/neet-pg" className={link}>NEET PG counselling</Link></li>
              <li aria-hidden>/</li>
              <li><Link href="/neet-pg/cutoff" className={link}>NEET PG cutoff</Link></li>
              <li aria-hidden>/</li>
              <li aria-current="page">{at.year} {round} cutoff</li>
            </ol>
          </nav>
          <h1 id="cut-h" className="glow mt-4 max-w-4xl font-pixel text-3xl leading-[1] tracking-tight sm:text-4xl md:text-5xl">{w.h1}</h1>
          {t.intro.map((x) => (
            <p key={x} className="mt-5 max-w-prose text-base leading-relaxed text-muted-foreground">{x}</p>
          ))}
          {t.note && (
            <p className="mt-5 flex max-w-prose gap-2 rounded-md bg-sun/10 px-3 py-2.5 text-sm leading-relaxed text-sun">
              <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span>
                {t.note.text}.{" "}
                <a href={t.note.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:no-underline">
                  MCC&apos;s notice<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </span>
            </p>
          )}
          <p className="mt-4">
            <SourceLabel provenance={{ sourceName: d.source.name, sourceUrl: d.source.url, sourceType: "OFFICIAL", academicYear: d.year }} />
          </p>

          <BranchTables d={d} href={branchPage} className="mt-8" />
          <BranchNotes d={d} />
        </Container>
      </section>

      <Faq items={t.faqs} title={`Questions about the ${round} cutoff.`} />

      <section aria-labelledby="rounds-h" className="border-b border-border">
        <Container className="py-16 md:py-20">
          <h2 id="rounds-h" className="text-2xl font-semibold tracking-tight md:text-3xl">Other rounds</h2>
          <p className="mt-3 text-sm">
            <Link href="/neet-pg/cutoff" className={`inline-flex min-h-11 items-center ${link}`}>NEET PG cutoff: every round and every branch</Link>
          </p>
          <ul className="mt-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {p.rounds.filter((r) => cutoffPath(r) !== d.path).map((r) => (
              <li key={cutoffPath(r)}>
                <Link href={cutoffPath(r)} className={`inline-flex min-h-11 items-center ${link}`}>{cutoffWords(r).name}{r.provisional ? " (provisional)" : ""}</Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      <Cta />
    </>
  );
}
