import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Cta } from "@/components/marketing/cta";
import { Button } from "@/components/ui/button";
import { SourceLabel } from "@/components/ui/source-label";
import { siteConfig } from "@/config/site";
import { residentsData, residentsLd, residentsPath, residentsWords } from "@/features/exams/landing/residents";
import { HospitalTable, textLink } from "@/features/exams/landing/residents-tables";
import { breadcrumbLd, JsonLd, pageMeta } from "@/lib/seo";

// One state's NEET PG residents (/neet-pg/residents/maharashtra): its hospitals with the residents in each course and
// year, COUNTS ONLY. Static, hourly; every state with residents is built with the site, any other path 404s.
export const revalidate = 3600;
export const generateStaticParams = async () => ((await residentsData())?.states ?? []).map((s) => ({ state: s.slug }));

type Props = { params: Promise<{ state: string }> };
const load = async ({ params }: Props) => {
  const [r, slug] = await Promise.all([residentsData(), params.then((p) => p.state)]);
  const state = r?.states.find((s) => s.slug === slug);
  return r && state ? { r, state } : null;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const p = await load(props);
  return p ? pageMeta(residentsPath(p.state.state), residentsWords(p.r, p.state)) : {};
}

export default async function StateResidentsPage(props: Props) {
  const p = await load(props);
  if (!p) notFound();
  const { r, state } = p;
  const w = residentsWords(r, state);
  const path = residentsPath(state.state);
  const hospitals = r.hospitals.filter((h) => h.state === state.state);

  return (
    <>
      <JsonLd data={{ "@graph": [breadcrumbLd([[siteConfig.name, "/"], ["NEET PG counselling", "/neet-pg"], ["Residents", residentsPath()], [state.state, path]]), residentsLd(r, w, path, state.state)] }} />
      <section aria-labelledby="res-h" className="border-b border-border">
        <Container className="pt-8 pb-16 sm:pt-16 md:pb-24">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
              <li><Link href="/neet-pg" className={textLink}>NEET PG counselling</Link></li>
              <li aria-hidden>/</li>
              <li><Link href={residentsPath()} className={textLink}>Residents</Link></li>
              <li aria-hidden>/</li>
              <li aria-current="page">{state.state}</li>
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
            <Link href={`/signup?${new URLSearchParams({ next: `/decide/residents?${new URLSearchParams({ course: "all", state: state.state })}` })}`}>
              Sign up free to see the names <ArrowRight className="size-4" />
            </Link>
          </Button>

          <h2 id="hosp-h" className="mt-16 mb-6 text-2xl font-semibold tracking-tight md:text-3xl">{state.state} hospitals by residents</h2>
          <HospitalTable
            r={r}
            hospitals={hospitals}
            caption={`NEET PG residents at ${state.state} hospitals, by year of admission, with each hospital's courses`}
            none={`No ${state.state} hospital matches.`}
            courses
          />

          <h2 id="states-h" className="mt-16 text-2xl font-semibold tracking-tight md:text-3xl">Other states</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {r.states.filter((s) => s.slug !== state.slug).map((s) => (
              <li key={s.slug}>
                <Link href={residentsPath(s.state)} className={`inline-flex min-h-11 items-center ${textLink}`}>{s.state} PG residents</Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      <Cta />
    </>
  );
}
