import { Info } from "lucide-react";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { dataVersion } from "@/features/decide/server/catalog";
import { glossary } from "@/features/decide/lib/glossary";
import { inrRange, noneDeclaredWhy } from "@/features/decide/lib/stat-format";
import { DEFAULT_EXAM } from "@/features/exams/keys";
import { CollegeTable } from "@/features/exams/landing/college-table";
import { HubHead, HubSection, Lead, hubCrumbs, hubLink } from "@/features/exams/landing/hub-bits";
import { stipendBond, type Range } from "@/features/exams/landing/hubs";
import { cn } from "@/lib/cn";
import { JsonLd, pageMeta, pageWords } from "@/lib/seo";

// Stipends and service bonds of every institute with MCC seats: by course type and state, the state rules MCC seats'
// bonds are read from, and a searchable table of every institute linking its college page. The same terms and cells
// as Decide's (features/exams/landing/hubs.ts stipendBond). Static, re-rendered hourly.
export const revalidate = 3600;
const PATH = "/neet-pg/stipend-bond";
export const metadata = pageMeta(PATH, pageWords[PATH]);
const n = formatRank;
/** Institutes shown before "Show all" (a search shows every match). */
const FOLD = 40;
const stipendOf = (r: Range | undefined) => (r ? `${inrRange(r.min, r.max, false)}/mo (${n(r.n)})` : "—");
const th = "px-3 py-3 font-mono text-xs font-normal uppercase tracking-widest text-muted-foreground md:px-4";
/** A table's cells: padding and numbers from the table (one class list, not one per cell). */
const CELLS = "[&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top md:[&_td]:px-4 [&_th[scope=row]]:px-3 [&_th[scope=row]]:py-2.5 md:[&_th[scope=row]]:px-4";
const programmeName: Record<string, string> = { "MD/MS": "MD/MS", Diploma: "Diploma (university)", DNB: "DNB", "NBEMS Diploma": "NBEMS Diploma", MCh: "MCh (6-year)", MPH: "MPH" };

export default async function StipendBondPage() {
  const [d, marker] = await Promise.all([stipendBond(), dataVersion(DEFAULT_EXAM)]);
  const h1 = "NEET PG Stipend and Bond: State-wise and College-wise";
  const types = d.types.filter((t) => t.own || t.floor).sort((a, b) => (b.own?.n ?? 0) + b.floor - ((a.own?.n ?? 0) + a.floor));
  const md = d.types.find((t) => t.programme === "MD/MS")?.own;
  const dnbType = d.types.find((t) => t.programme === "DNB");
  const bondStates = d.states.filter((s) => s.bond.bond > 0).map((s) => s.state);
  const mdStates = d.states.filter((s) => s.colleges > 0);
  const dnbTotal = d.dnb.bond + d.dnb.none + d.dnb.unknown;
  const g = glossary(DEFAULT_EXAM);

  const faqs = [
    {
      q: "How much stipend do NEET PG residents get?",
      a: `It depends on the college and state. In Seatora's data, year 1 MD/MS stipends the colleges declared run ${md ? `${inrRange(md.min, md.max, false)} a month (${n(md.n)} colleges)` : "as each college's page shows"}${dnbType?.own ? `, and DNB ${inrRange(dnbType.own.min, dnbType.own.max, false)} a month (${n(dnbType.own.n)} hospitals; ${n(dnbType.floor)} more show only NBEMS's minimum)` : ""}. Later years can pay more: each college's page has every year.`,
    },
    {
      q: "Which states have a service bond for NEET PG seats?",
      a: `Among MD/MS seats MCC fills, colleges in ${n(bondStates.length)} states have a bond on record: ${bondStates.join(", ")}. Not every college in a state has the same terms, and some are not known yet: check the college's own page.`,
    },
    {
      q: "Do DNB seats have a bond?",
      a: `${d.dnb.none * 2 > dnbTotal ? "Mostly not: of" : "Of"} ${n(dnbTotal)} DNB hospitals with MCC seats, ${n(d.dnb.none)} have no bond or declared none, ${n(d.dnb.bond)} have one and ${n(d.dnb.unknown)} are not known. ${noneDeclaredWhy("MCC")}`,
    },
    { q: "What is the difference between a bond penalty and a leaving penalty?", a: `Bond penalty: ${g["bond-penalty"]} Leaving penalty: ${g["leaving-penalty"]}` },
    { q: "Does this include state quota seats?", a: "No. It covers the institutes in MCC's All India counselling (All India Quota, deemed and DNB seats). A state's bond rule is shown where its document says it binds those seats too; state quota counselling isn't covered." },
  ];

  return (
    <>
      <JsonLd
        data={{
          "@graph": [
            hubCrumbs(["Stipend & bond", PATH]),
            {
              "@type": "Dataset",
              name: h1,
              description: pageWords[PATH].description,
              url: `${siteConfig.url}${PATH}`,
              ...(marker && { dateModified: marker }),
              temporalCoverage: "2026",
              spatialCoverage: { "@type": "Country", name: "India" },
              inLanguage: "en-IN",
              isAccessibleForFree: true,
              creator: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
              variableMeasured: ["Year 1 stipend per month", "Service bond years", "Bond penalty (₹)", "Bond status: bond, no bond, not known"],
              isBasedOn: [
                { "@type": "CreativeWork", name: "MCC institute profiles (college declarations)", publisher: { "@type": "GovernmentOrganization", name: "Medical Counselling Committee (MCC)", url: "https://mcc.nic.in/" } },
                ...d.rules.filter((r, i, all) => r.source?.url && all.findIndex((x) => x.source?.url === r.source?.url) === i).map((r) => ({ "@type": "CreativeWork", name: r.source!.label, url: r.source!.url })),
              ],
              keywords: ["NEET PG stipend", "NEET PG bond", "PG service bond by state", "DNB stipend", "MCC"],
            },
          ],
        }}
      />
      <HubHead trail={[["Stipend & bond", PATH]]} h1={h1}>
        <Lead>
          The monthly stipend and the service bond of {n(d.rows.length)} institutes with seats in MCC&apos;s NEET PG counselling: what each pays in year 1, whether
          it binds you to serve after the course, and what not serving costs. From each college&apos;s MCC institute profile, NBEMS&apos;s rules for DNB seats and
          the state rules linked below; a figure no document gives is &ldquo;Not published&rdquo;, an unread bond &ldquo;Not known&rdquo;.
        </Lead>
        <p className="mt-4 flex max-w-prose gap-2 rounded-md bg-sun/10 px-3 py-2.5 text-sm leading-relaxed text-sun">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          MCC seats only (All India Quota, deemed and DNB): state quota counselling isn&apos;t covered.
        </p>
      </HubHead>

      <HubSection id="types-h" title="Stipend by course type" intro="Year 1, a month, where the college or hospital declared its own figure (or NMC's filing gives it). NBEMS's minimum is the least a DNB hospital must pay, not its figure.">
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <table className={cn("w-full text-sm", CELLS)}>
            <caption className="sr-only">NEET PG stipend by course type, year 1, per month</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(th, "text-left")}>Course type</th>
                <th scope="col" className={cn(th, "text-right")}>Stipend, year 1</th>
                <th scope="col" className={cn(th, "text-right")}>Own figure</th>
                <th scope="col" className={cn(th, "text-right")}>NBEMS minimum only</th>
              </tr>
            </thead>
            <tbody className="numeric">
              {types.map((t) => (
                <tr key={t.programme} className="border-t border-border">
                  <th scope="row" className="text-left font-normal">{programmeName[t.programme] ?? t.programme}</th>
                  <td className="text-right">{t.own ? `${inrRange(t.own.min, t.own.max, false)}/mo` : "Not published"}</td>
                  <td className="text-right">{n(t.own?.n ?? 0)}</td>
                  <td className="text-right text-muted-foreground">{t.floor ? n(t.floor) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubSection>

      <HubSection id="states-h" title="Stipend and bond by state" intro="MD/MS and DNB stipends (year 1, a month; how many declared one), and the service bond of MD/MS seats: how many colleges have a bond, none, or not known, its years, and the ₹ penalty for not serving where a document states one.">
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <table className={cn("w-full min-w-[56rem] text-sm", CELLS)}>
            <caption className="sr-only">NEET PG stipend and MD/MS service bond by state</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(th, "text-left")}>State</th>
                <th scope="col" className={cn(th, "text-right")}>MD/MS stipend</th>
                <th scope="col" className={cn(th, "text-right")}>DNB stipend</th>
                <th scope="col" className={cn(th, "text-right")}>MD/MS bond · none · not known</th>
                <th scope="col" className={cn(th, "text-right")}>Bond years</th>
                <th scope="col" className={cn(th, "text-right")}>Bond penalty</th>
              </tr>
            </thead>
            <tbody className="numeric">
              {d.states.map((s) => (
                <tr key={s.state} className="border-t border-border">
                  <th scope="row" className="text-left font-normal">{s.state}</th>
                  <td className="text-right">{stipendOf(s.md)}</td>
                  <td className="text-right">{stipendOf(s.dnb)}</td>
                  <td className="text-right">{s.colleges ? `${s.bond.bond} · ${s.bond.none} · ${s.bond.unknown}` : "—"}</td>
                  <td className="text-right">{s.years ? (s.years.min === s.years.max ? `${s.years.min}` : `${s.years.min}–${s.years.max}`) : "—"}</td>
                  <td className="text-right">{s.penalty ? inrRange(s.penalty.min, s.penalty.max) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {n(mdStates.length)} states and union territories have MD/MS seats in MCC&apos;s counselling. DNB seats: {n(d.dnb.none)} of {n(dnbTotal)} hospitals have no bond or declared none,{" "}
          {n(d.dnb.bond)} have one, {n(d.dnb.unknown)} not known.
        </p>
      </HubSection>

      {d.rules.length > 0 && (
        <HubSection id="rules-h" title="State bond rules" intro="Where a college's bond is read from its state's rule (the college's own document doesn't give it), the rule in short and its document. Confirm with the college.">
          <ul className="mt-6 grid gap-x-10 gap-y-5 text-sm leading-relaxed md:grid-cols-2">
            {d.rules.map((r) => (
              <li key={`${r.state}|${r.text}`} className="border-t border-border pt-4">
                <p className="font-medium">{r.state}</p>
                <p className="mt-1 text-muted-foreground">{r.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n(r.colleges)} {r.colleges === 1 ? "institute" : "institutes"}.{" "}
                  {r.source?.url ? (
                    <a href={r.source.url} target="_blank" rel="noopener noreferrer" className={hubLink} title={r.source.label}>
                      The rule&apos;s document<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : r.source?.label}
                </p>
              </li>
            ))}
          </ul>
        </HubSection>
      )}

      <HubSection id="colleges-h" title="College-wise stipend and bond" intro="Each institute's first course type (MD/MS before DNB), year 1's stipend and its bond. Open an institute for every course type, year and penalty, each with its document.">
        <CollegeTable rows={d.rows.map((r) => [r.name, r.slug, r.state, r.programme, r.stipend, r.bond, ...r.sort])} fold={FOLD} />
      </HubSection>

      <Faq items={faqs} title="Questions about stipends and bonds." />
      <Cta />
    </>
  );
}
