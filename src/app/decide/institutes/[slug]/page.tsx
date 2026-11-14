import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Closing, Dash, DemoSource, HISTORY_CAPTION, ReachBadge } from "@/features/decide/components/bits";
import { ChoiceStar, CompareToggle } from "@/features/decide/components/option-actions";
import { courseName, RoundGrid, toChoiceItem } from "@/features/decide/components/options-view";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getInstitute } from "@/features/decide/service";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const inst = await getInstitute((await params).slug, null);
  return { title: inst?.college.name ?? "Institute" };
}

function Terms({ title, t }: { title: string; t: { fee?: { text: string }; stipend?: { text: string }; bond?: { text: string }; penalty?: { text: string } } }) {
  if (!t.fee && !t.stipend && !t.bond && !t.penalty) return null;
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Fee</dt><dd>{t.fee?.text ?? <Dash />}</dd>
        <dt className="text-muted-foreground">Stipend</dt><dd>{t.stipend?.text ?? <Dash />}</dd>
        <dt className="text-muted-foreground">Bond</dt><dd>{t.bond?.text ?? "No bond listed"}</dd>
        <dt className="text-muted-foreground">Bond penalty</dt><dd>{t.penalty?.text ?? <Dash />}</dd>
      </dl>
    </div>
  );
}

export default async function InstitutePage({ params, searchParams }: Props) {
  const profile = profileFromParams(toURLSearchParams(await searchParams));
  const inst = await getInstitute((await params).slug, profile);
  if (!inst) notFound();
  const { college, options, allotmentsByYear, terms } = inst;
  const maxN = Math.max(1, ...allotmentsByYear.map((a) => a.n));

  return (
    <Container className="grid gap-10 py-10">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{college.type ?? "Institute"}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{college.name}</h1>
      </div>

      <section aria-labelledby="ov" className="rounded-xl border border-border bg-card p-6">
        <h2 id="ov" className="text-lg font-medium">Overview</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">State · PIN</dt><dd>{college.state ?? <Dash />} · {college.pincode ?? <Dash />}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Type</dt><dd>{college.type ?? <Dash />}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Beds</dt><dd className="numeric">{college.beds != null ? formatRank(college.beds) : <Dash />}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Established</dt><dd className="numeric">{college.established ?? <Dash />}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Website</dt><dd>{college.website ? <a href={college.website} target="_blank" rel="noopener noreferrer" className="text-sky underline">Website (opens new tab)</a> : <Dash />}</dd></div>
        </dl>
        <div className="mt-4"><DemoSource /></div>
      </section>

      <section aria-labelledby="courses">
        <h2 id="courses" className="text-lg font-medium">Courses offered</h2>
        <div role="region" aria-label="Courses offered" tabIndex={0} className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Courses at {college.name}, with past closing ranks</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="w-12 px-2 py-3 font-normal"><span className="sr-only">Add to choices</span></th>
                <th scope="col" className="px-3 py-3 font-normal">Course · quota</th>
                <th scope="col" className="px-3 py-3 font-normal">{profile ? "Your reach" : "Reach"}</th>
                <th scope="col" className="px-3 py-3 text-right font-normal">2025 deepest</th>
                <th scope="col" className="px-3 py-3 font-normal">Rounds</th>
                <th scope="col" className="w-12 px-2 py-3 font-normal"><span className="sr-only">Compare</span></th>
              </tr>
            </thead>
            <tbody>
              {options.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="px-2 py-2"><ChoiceStar item={toChoiceItem(r)} /></td>
                  <th scope="row" className="px-3 py-3 text-left font-normal">{courseName(r)}<span className="block text-xs text-muted-foreground">{r.quota}</span></th>
                  <td className="px-3 py-3">{profile ? <ReachBadge reach={r.reach} provisional /> : <span className="text-xs text-muted-foreground">Set your rank to see</span>}</td>
                  <td className="px-3 py-3 text-right"><Closing d={r.byYear[2025]} /></td>
                  <td className="px-3 py-3">
                    <details>
                      <summary className="cursor-pointer text-xs text-sky">By year and round</summary>
                      <div className="mt-2"><RoundGrid row={r} caption={`${courseName(r)}, ${r.quota}: closing ranks by year and round`} /></div>
                    </details>
                  </td>
                  <td className="px-2 py-2"><CompareToggle id={r.id} label={`${college.name}, ${courseName(r)}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{HISTORY_CAPTION}{!profile && " Closing ranks shown across all seat categories."}</p>
      </section>

      <section aria-labelledby="trend">
        <h2 id="trend" className="text-lg font-medium">Allotments made by year</h2>
        <p className="mt-1 text-sm text-muted-foreground">Allotments across all rounds and courses here, not the seat matrix.</p>
        <table className="mt-4 w-full max-w-xl text-sm">
          <caption className="sr-only">Allotments made by year at {college.name}</caption>
          <tbody>
            {allotmentsByYear.map((a) => (
              <tr key={a.year}>
                <th scope="row" className="w-24 py-1.5 text-left font-normal text-muted-foreground">{a.year}{a.year === 2026 && " (R1)"}</th>
                <td className="py-1.5"><div className="h-2 bg-sky" style={{ width: `${(a.n / maxN) * 100}%` }} aria-hidden /></td>
                <td className="numeric w-12 py-1.5 text-right">{a.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="money" className="rounded-xl border border-border bg-card p-6">
        <h2 id="money" className="text-lg font-medium">Fees, stipend and bond</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <Terms title="MD" t={terms.md} />
          <Terms title="DNB / NBEMS Diploma" t={terms.dnb} />
        </div>
        <div className="mt-4"><DemoSource /></div>
      </section>

      <section aria-labelledby="clinical" className="rounded-xl border border-border bg-card p-6">
        <h2 id="clinical" className="text-lg font-medium">Clinical data</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {["OPD / year", "IPD / year", "Bed occupancy", "Major OT", "Minor OT", "Emergency OT"].map((k) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd><Dash /></dd></div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">Not yet collected. For DNB hospitals this will come from their NBEMS mandatory disclosures.</p>
      </section>

      <p className="text-sm"><Link href="/decide/options" className="text-sky underline">Back to Options</Link></p>
    </Container>
  );
}
