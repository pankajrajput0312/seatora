import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Badge } from "@/components/ui/badge";
import { SourceLabel } from "@/components/ui/source-label";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { roundName } from "@/features/decide/lib/round-status";
import { BranchNotes, BranchTables, branchHref } from "@/features/exams/landing/branch-ranks";
import { collegeFaqs, collegeWords } from "@/features/exams/landing/college-words";
import { Crumbs, L } from "@/features/exams/landing/college-list";
import { branchPath, branchSlugs, collegePage, collegePath, collegesPath, movedTo, statePath } from "@/features/exams/landing/colleges";
import { cutoffPath } from "@/features/exams/landing/cutoff";
import { breadcrumbLd, JsonLd, pageMeta } from "@/lib/seo";

// One NEET PG college, public and indexable (/neet-pg/colleges/<the in-app slug>): its latest round's last ranks by
// course, last year's deepest, seats, fee, stipend and bond, and residents as counts. Static, re-rendered hourly; the
// ~300 colleges with the most allotments are built with the site, the rest render on their first visit. A slug an MCC
// import retired redirects (308) to the college's slug now.
export const revalidate = 3600;
export const dynamicParams = true;
// Rendered on first visit, then cached for the hour (revalidate): pre-rendering these at build ran the build out of DB
// connections (20 Nov 2026). ponytail: prebuild a few again if first-visit latency matters.
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ slug: string }> };
const load = async ({ params }: Props) => {
  const slug = (await params).slug;
  const p = await collegePage(slug);
  const to = p ? null : await movedTo(slug);
  if (to) permanentRedirect(to);
  return p;
};
const h2 = "text-2xl font-semibold tracking-tight md:text-3xl";

export async function generateMetadata(props: Props): Promise<Metadata> {
  const p = await load(props);
  if (!p) return {};
  const w = collegeWords(p);
  return pageMeta(collegePath(p.college.slug), w, w.absolute);
}

export default async function CollegePage(props: Props) {
  const p = await load(props);
  if (!p) notFound();
  const { college, at, d } = p;
  const w = collegeWords(p);
  const faqs = collegeFaqs(p);
  // A course's public page where it has one (an allotment in the round or last year), else its last ranks in Decide.
  const branches = new Set((await branchSlugs()).map((b) => b.slug));
  const courseHref = (slug: string, quota: string) => (branches.has(slug) ? branchPath(slug) : branchHref(slug, quota));
  const round = roundName[at.round];
  const path = collegePath(college.slug);
  const url = `${siteConfig.url}${path}`;
  const rows = d.tabs.some((t) => t.rows.length) || d.restricted.length > 0;
  const crumbs: [string, string][] = [
    [siteConfig.name, "/"],
    ["NEET PG counselling", "/neet-pg"],
    ["Colleges", collegesPath],
    ...(college.state ? [[college.state, statePath(college.state)] as [string, string]] : []),
    [p.label, path],
  ];
  // The address as MCC prints it, with the state and PIN code where it doesn't already say them.
  const place = [college.address, ...[college.state, college.pincode].filter((x) => x && !college.address?.includes(x))].filter(Boolean).join(", ");
  const docs = [at.source, ...at.prevSources].filter((s) => !!s);
  const ld = [
    breadcrumbLd(crumbs),
    {
      "@type": "CollegeOrUniversity",
      "@id": `${url}#college`,
      name: college.name,
      url,
      address: { "@type": "PostalAddress", ...(college.address && { streetAddress: college.address }), ...(college.state && { addressRegion: college.state }), ...(college.pincode && { postalCode: college.pincode }), addressCountry: "IN" },
    },
    ...(rows
      ? [{
          "@type": "Dataset",
          name: `NEET PG ${at.year} ${round} last ranks at ${college.name}`,
          description: `The last (closing) All India Rank per course, quota and seat category at ${college.name} in MCC's ${at.provisional ? "provisional " : ""}NEET PG ${at.year} ${round} result, with each course's deepest Open closing of ${at.prevYear}.`,
          url,
          temporalCoverage: `${at.prevYear}/${at.year}`,
          spatialCoverage: { "@type": "Place", name: [college.state, "India"].filter(Boolean).join(", ") },
          inLanguage: "en-IN",
          isAccessibleForFree: true,
          creator: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
          isBasedOn: docs.map((s) => ({ "@type": "DigitalDocument", name: s.name, ...(s.url && { url: s.url }), publisher: { "@type": "GovernmentOrganization", name: "Medical Counselling Committee (MCC)", url: "https://mcc.nic.in/" } })),
          variableMeasured: ["Last (closing) All India Rank by course, quota and seat category", `${round} allotments by course and quota`],
        }]
      : []),
  ];

  return (
    <>
      <JsonLd data={{ "@graph": ld }} />
      <section aria-labelledby="c-h" className="border-b border-border">
        <Container className="pt-8 pb-14 sm:pt-16 md:pb-20">
          <Crumbs items={crumbs.slice(1)} />
          <h1 id="c-h" className="glow mt-4 max-w-4xl font-pixel text-3xl leading-[1] tracking-tight sm:text-4xl md:text-5xl">{w.h1}</h1>
          <dl className="mt-6 grid max-w-3xl gap-x-8 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
            {place && (
              <>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{place} <span className="text-xs text-muted-foreground">(as MCC prints it)</span></dd>
              </>
            )}
            <dt className="text-muted-foreground">Type</dt>
            <dd>{p.type.label} <span className="text-xs text-muted-foreground">(inferred from its name and quota, not official)</span></dd>
            {p.beds && (
              <>
                <dt className="text-muted-foreground">Beds</dt>
                <dd>
                  <span className="numeric">{p.beds.text}</span> <span className="text-xs text-muted-foreground">(self-reported by the hospital{p.beds.source ? <>: <a href={p.beds.source.url} target="_blank" rel="noopener noreferrer" className={L}>{p.beds.source.name}</a></> : ""})</span>
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Courses</dt>
            <dd className="numeric">{p.courses || "—"}</dd>
            {p.mccProfileUrl && (
              <>
                <dt className="text-muted-foreground">Official</dt>
                <dd><a href={p.mccProfileUrl} target="_blank" rel="noopener noreferrer" className={L}>MCC institute profile<span className="sr-only"> (opens in a new tab)</span></a></dd>
              </>
            )}
          </dl>
        </Container>
      </section>

      <section aria-labelledby="lr-h" className="border-b border-border">
        <Container className="py-16 md:py-20">
          <h2 id="lr-h" className={h2}>
            Last rank by course, {at.year} {round}
            {at.provisional && <Badge tone="warning" className="ml-3 align-middle">Provisional</Badge>}
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            The highest All India Rank given a seat of each course here in {round}, per quota and seat category
            {at.round !== "R1" ? `; ${round} counts only new allotments (Fresh Allotted and Upgraded), so a course with none shows —` : ""}. Beside it, the course&apos;s deepest Open closing of {at.prevYear} (any round). History, not a prediction.
          </p>
          <ul className="mt-2 grid gap-1">
            {docs.map((s) => (
              <li key={s.key}><SourceLabel provenance={{ sourceName: s.name, sourceUrl: s.url, sourceType: "OFFICIAL", academicYear: String(s.year) }} /></li>
            ))}
          </ul>
          {rows ? (
            <>
              <BranchTables
                d={d}
                href={courseHref}
                noun={{ one: "course", many: "courses", eg: "radio" }}
                cols={{ prev: `${at.prevYear} deepest, Open`, ...(p.lists[0] && { seats: `${roundName[p.lists[0].round]} clear vacancy` }) }}
                className="mt-8"
              />
              <BranchNotes d={d} />
            </>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">No allotment here in {at.year} {round} or {at.prevYear} in MCC&apos;s results.</p>
          )}
          <p className="mt-6 text-sm">
            <Link href={cutoffPath(at)} className={L}>NEET PG {at.year} {round} cutoff: every branch</Link>
          </p>
        </Container>
      </section>

      {p.lists.length > 0 && (
        <section aria-labelledby="seats-h" className="border-b border-border">
          <Container className="py-16 md:py-20">
            <h2 id="seats-h" className={h2}>Seats in the newest seat lists</h2>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
              MCC&apos;s NEET PG {p.lists[0].year} {roundName[p.lists[0].round]} seat lists, as published (later MCC seat notices are not applied). The lists overlap, so they are never added together.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {p.lists.map((l) => (
                <li key={l.name} className="rounded-lg border border-border bg-card p-5">
                  <p className="text-sm text-muted-foreground">{l.name}</p>
                  <p className="numeric mt-1 text-2xl font-semibold">{formatRank(l.seats)} <span className="text-sm font-normal text-muted-foreground">seat{l.seats === 1 ? "" : "s"}</span></p>
                  <p className="mt-2"><SourceLabel provenance={{ sourceName: `MCC ${l.name.toLowerCase()}, ${roundName[l.round]}`, sourceUrl: l.url, sourceType: "OFFICIAL", academicYear: String(l.year) }} /></p>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {p.programmes.length > 0 && (
        <section aria-labelledby="fee-h" className="border-b border-border">
          <Container className="py-16 md:py-20">
            <h2 id="fee-h" className={h2}>Fee, stipend and bond</h2>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
              From MCC&apos;s institute profile and the documents it links, for the seats named. &ldquo;Not published&rdquo;: no document gives it.
            </p>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {p.programmes.map((x) => (
                <article key={x.programme} className="rounded-lg border border-border bg-card p-5">
                  <h3 className="text-lg font-medium">{x.programme}{x.quota && <span className="text-sm font-normal text-muted-foreground"> · {x.quota} seats</span>}</h3>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Fee (year 1)</dt>
                    <dd className={x.fee.missing ? "text-muted-foreground" : "numeric"}>{x.fee.value}</dd>
                    <dt className="text-muted-foreground">Stipend (year 1)</dt>
                    <dd className={x.stipend.missing ? "text-muted-foreground" : "numeric"}>{x.stipend.value}</dd>
                    <dt className="text-muted-foreground">Bond</dt>
                    <dd className="leading-relaxed">{x.bond}</dd>
                  </dl>
                  {x.sources.length > 0 && (
                    <ul className="mt-4 grid gap-1.5">
                      {x.sources.map((s) => (
                        <li key={`${s.name}|${s.url}`}><SourceLabel provenance={{ sourceName: s.name, sourceUrl: s.url, sourceType: "OFFICIAL", academicYear: s.year != null ? String(s.year) : "" }} /></li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </Container>
        </section>
      )}

      {p.residents && (
        <section aria-labelledby="res-h" className="border-b border-border">
          <Container className="py-16 md:py-20">
            <h2 id="res-h" className={h2}>Residents by course and year</h2>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
              How many candidates MCC&apos;s admitted-candidates lists show here, {p.residents.years[0]} to {p.residents.years.at(-1)}: {formatRank(p.residents.total)} in all. Counts only; signed-in members see the names.
            </p>
            <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">Residents at {college.name} by course and year (counts)</caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-3 py-3 text-left font-mono text-xs font-normal uppercase tracking-widest text-muted-foreground md:px-4">Course</th>
                    {p.residents.years.map((y) => <th key={y} scope="col" className="numeric px-3 py-3 text-right font-mono text-xs font-normal text-muted-foreground md:px-4">{y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {p.residents.courses.map((c) => (
                    <tr key={c.slug} className="border-t border-border">
                      <th scope="row" className="px-3 py-2.5 text-left font-normal md:px-4">{c.course}</th>
                      {c.byYear.map((v, i) => <td key={p.residents!.years[i]} className="numeric px-3 py-2.5 text-right md:px-4">{v || <span className="text-muted-foreground">—</span>}</td>)}
                    </tr>
                  ))}
                  <tr className="border-t border-border font-medium">
                    <th scope="row" className="px-3 py-2.5 text-left md:px-4">All courses</th>
                    {p.residents.byYear.map((v, i) => <td key={p.residents!.years[i]} className="numeric px-3 py-2.5 text-right md:px-4">{formatRank(v)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm">
              <Link href={p.gated[2].href} className="inline-flex min-h-11 items-center gap-1.5 text-sky underline underline-offset-4 hover:no-underline">
                See their names: sign up free <ArrowRight className="size-4" aria-hidden />
              </Link>
              <span className="text-muted-foreground"> · </span>
              <Link href="/neet-pg/residents" className={L}>Residents at every college</Link>
            </p>
          </Container>
        </section>
      )}

      <section aria-labelledby="more-h" className="border-b border-border">
        <Container className="py-16 md:py-20">
          <h2 id="more-h" className={h2}>In the planner, free with an account</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {p.gated.map((g) => (
              <li key={g.label}>
                <Link href={g.href} className="inline-flex min-h-11 items-center gap-2 text-sky underline underline-offset-4 hover:no-underline">
                  <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  {g.label}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <Faq items={faqs} title={`Questions about ${p.label}.`} />

      <section aria-labelledby="links-h" className="border-b border-border">
        <Container className="py-16 md:py-20">
          <h2 id="links-h" className={h2}>More NEET PG {at.year}</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {college.state && <li><Link href={statePath(college.state)} className={`inline-flex min-h-11 items-center ${L}`}>NEET PG colleges in {college.state}</Link></li>}
            <li><Link href={cutoffPath(at)} className={`inline-flex min-h-11 items-center ${L}`}>NEET PG {at.year} {round} cutoff by branch</Link></li>
            <li><Link href="/neet-pg/college-predictor" className={`inline-flex min-h-11 items-center ${L}`}>NEET PG college predictor</Link></li>
            <li><Link href="/neet-pg/stipend-bond" className={`inline-flex min-h-11 items-center ${L}`}>Stipend and bond by college</Link></li>
            <li><Link href="/neet-pg/residents" className={`inline-flex min-h-11 items-center ${L}`}>Residents at every college</Link></li>
          </ul>
          {rows && (
            <>
              <h3 className="mt-10 text-lg font-medium">Each course&apos;s cutoff at every college</h3>
              <ul className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {[...new Map([...d.tabs.flatMap((t) => t.rows), ...d.restricted].filter((r) => branches.has(r.slug)).map((r) => [r.slug, r.course])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([slug, course]) => (
                  <li key={slug}><Link href={branchPath(slug)} className={`inline-flex min-h-11 items-center ${L}`}>NEET PG {at.year} {course} cutoff</Link></li>
                ))}
              </ul>
            </>
          )}
        </Container>
      </section>
      <Cta />
    </>
  );
}
