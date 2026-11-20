import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Button } from "@/components/ui/button";
import { SourceLabel } from "@/components/ui/source-label";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { residentsData, residentsFaqs, residentsLd, residentsPath, residentsWords } from "@/features/exams/landing/residents";
import { CELLS, HospitalTable, textLink, th } from "@/features/exams/landing/residents-tables";
import { cn } from "@/lib/cn";
import { breadcrumbLd, JsonLd, pageMeta } from "@/lib/seo";

// NEET PG's residents by state and hospital, public and indexable: COUNTS ONLY (features/exams/landing/residents.ts),
// never a name. Static, re-rendered hourly like /neet-pg.
export const revalidate = 3600;
/** Hospitals in the table (most residents first); every hospital is on its state's page. */
const TOP = 100;

export async function generateMetadata(): Promise<Metadata> {
  const r = await residentsData();
  return r ? pageMeta(residentsPath(), residentsWords(r)) : {};
}

export default async function ResidentsPage() {
  const r = await residentsData();
  if (!r) notFound();
  const w = residentsWords(r);
  const path = residentsPath();

  return (
    <>
      <JsonLd data={{ "@graph": [breadcrumbLd([[siteConfig.name, "/"], ["NEET PG counselling", "/neet-pg"], ["Residents", path]]), residentsLd(r, w, path)] }} />
      <section aria-labelledby="res-h" className="border-b border-border">
        <Container className="pt-8 pb-16 sm:pt-16 md:pb-24">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
              <li><Link href="/neet-pg" className={textLink}>NEET PG counselling</Link></li>
              <li aria-hidden>/</li>
              <li aria-current="page">Residents</li>
            </ol>
          </nav>
          <h1 id="res-h" className="glow mt-4 max-w-4xl font-pixel text-3xl leading-[1] tracking-tight sm:text-4xl md:text-5xl">{w.h1}</h1>
          {w.intro.map((x) => (
            <p key={x} className="mt-5 max-w-prose text-base leading-relaxed text-muted-foreground">{x}</p>
          ))}
          <ul className="mt-4 grid gap-1.5">
            {r.lists.map((l) => (
              <li key={l.year}>
                <SourceLabel provenance={{ sourceName: l.doc ?? `MCC admitted candidates list (${l.label})`, sourceUrl: l.url, sourceType: "OFFICIAL", academicYear: String(l.year) }} />
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="mt-8 w-full sm:w-auto">
            <Link href={`/signup?${new URLSearchParams({ next: "/decide/residents" })}`}>Sign up free to see the names <ArrowRight className="size-4" /></Link>
          </Button>

          <h2 id="states-h" className="mt-16 text-2xl font-semibold tracking-tight md:text-3xl">Residents by state</h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">Each state&apos;s page lists all its hospitals, with the residents in each course.</p>
          <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
            <table className={cn("w-full text-sm", CELLS)}>
              <caption className="sr-only">NEET PG residents by state, {r.years.at(-1)} to {r.years[0]}</caption>
              <thead>
                <tr>
                  <th scope="col" className={cn(th, "text-left")}>State</th>
                  <th scope="col" className={cn(th, "text-right")}>Hospitals</th>
                  <th scope="col" className={cn(th, "text-right")}>Residents</th>
                </tr>
              </thead>
              <tbody>
                {r.states.map((s) => (
                  <tr key={s.slug} className="border-t border-border hover:bg-muted">
                    <th scope="row" className="px-3 py-2.5 text-left font-normal md:px-4">
                      <Link href={residentsPath(s.state)} className={textLink}>{s.state}</Link>
                    </th>
                    <td className="text-muted-foreground">{formatRank(s.hospitals)}</td>
                    <td className="font-medium">{formatRank(s.residents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 id="top-h" className="mt-16 text-2xl font-semibold tracking-tight md:text-3xl">Hospitals with the most residents</h2>
          <p className="mt-3 mb-6 max-w-prose text-sm leading-relaxed text-muted-foreground">
            The {Math.min(TOP, r.hospitals.length)} hospitals with the most residents, by year of admission. A hospital opens its residents&apos; names after a free sign-up.
          </p>
          <HospitalTable
            r={r}
            hospitals={r.hospitals.slice(0, TOP)}
            caption={`The ${TOP} hospitals with the most NEET PG residents, by year of admission`}
            none={`No hospital in these ${TOP} matches. Every hospital is on its state's page, above.`}
          />
        </Container>
      </section>

      <Faq items={residentsFaqs(r)} title="Questions about the residents list." />
      <Cta />
    </>
  );
}
