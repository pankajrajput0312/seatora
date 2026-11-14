import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { DataSource } from "@/features/decide/components/data-source";
import { formatRank } from "@/features/cutoffs/lib/format";
import { Closing, Dash, HISTORY_CAPTION, ReachBadge } from "@/features/decide/components/bits";
import { ChoiceStar, CompareToggle } from "@/features/decide/components/option-actions";
import { courseName, RoundGrid, toChoiceItem } from "@/features/decide/components/options-view";
import { SubTabs } from "@/features/decide/components/sub-tabs";
import { Field, FilterBar, Select, tbl } from "@/features/decide/components/ui";
import { formatLakh } from "@/features/decide/lib/format";
import { decideLinks } from "@/features/decide/lib/links";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getInstitute, listAllotments } from "@/features/decide/service";
import { roundLabel, type Round } from "@/features/decide/types";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const tabs = [
  { key: "overview", label: "Overview" },
  { key: "courses", label: "Courses" },
  { key: "allotments", label: "Allotments" },
  { key: "fees", label: "Fees & bond" },
  { key: "clinical", label: "Clinical data" },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const inst = await getInstitute((await params).slug, null);
  return { title: inst?.college.name ?? "Institute" };
}

type T = { fee?: { text: string; amountInr: number | null }; stipend?: { text: string }; bond?: { text: string }; penalty?: { text: string } };
function Terms({ title, t }: { title: string; t: T }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      {!t.fee && !t.stipend && !t.bond && !t.penalty ? (
        <p className="mt-2 text-sm text-muted-foreground">Not offered here, or not listed.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Fee</dt><dd className="font-semibold">{t.fee?.amountInr != null ? `${formatLakh(t.fee.amountInr)} per year` : t.fee?.text ?? <Dash />}{t.fee?.amountInr != null && <span className="block text-xs font-normal text-muted-foreground">{t.fee.text}</span>}</dd>
          <dt className="text-muted-foreground">Stipend</dt><dd className="font-semibold">{t.stipend?.text ?? <Dash />}</dd>
          <dt className="text-muted-foreground">Bond</dt><dd className="font-semibold">{t.bond?.text ?? <Dash />}</dd>
          <dt className="text-muted-foreground">Bond penalty</dt><dd className="font-semibold">{t.penalty?.text ?? <Dash />}</dd>
        </dl>
      )}
    </div>
  );
}

export default async function InstitutePage({ params, searchParams }: Props) {
  const sp = toURLSearchParams(await searchParams);
  const profile = profileFromParams(sp);
  const L = decideLinks(sp);
  const slug = (await params).slug;
  const inst = await getInstitute(slug, profile);
  if (!inst) notFound();
  const { college, options, allotmentsByYear, terms } = inst;
  const tab = tabs.find((t) => t.key === sp.get("tab"))?.key ?? "overview";
  const maxN = Math.max(1, ...allotmentsByYear.map((a) => a.n ?? 0));
  const courses = [...new Map(options.map((o) => [o.course.slug, o.course])).values()];

  const year = Number(sp.get("year")) || undefined;
  const courseF = sp.get("course") || undefined;
  const allot = tab === "allotments" ? await listAllotments({ year, course: courseF }, 200, college.key) : null;

  return (
    <Container className="grid gap-6 py-8">
      <div>
        <p className="text-sm text-muted-foreground"><Link href={L.institutes()} className="underline hover:text-foreground">Institutes</Link> / {college.state}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-[2.25rem]">{college.name}</h1>
        <p className="mt-1 text-muted-foreground">{college.type ?? "Type not listed"}, {college.state ?? "state not listed"}{college.pincode ? `, PIN ${college.pincode}` : ""}</p>
      </div>

      <SubTabs label="Institute sections" current={tab} items={tabs.map((t) => ({ key: t.key, label: t.label, href: L.institute(slug, t.key) }))} />

      {tab === "overview" && (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
            {[
              ["Courses here", String(courses.length)],
              ["Allotments in 2025", allotmentsByYear.find((a) => a.year === 2025)?.n != null ? String(allotmentsByYear.find((a) => a.year === 2025)!.n) : "—"],
              ["Beds", college.beds != null ? formatRank(college.beds) : "—"],
              ["Established", college.established ? String(college.established) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="bg-card p-5"><dt className="text-sm text-muted-foreground">{k}</dt><dd className="mt-1 text-3xl font-bold">{v}</dd></div>
            ))}
          </dl>

          <section aria-labelledby="yours" className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="yours" className="text-lg font-semibold">{profile ? "Your options here" : "Courses and quotas here"}</h2>
              <Link href={L.institute(slug, "courses")} className="text-sm text-sky underline">All course details</Link>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {options.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <span className="font-medium">{courseName(o)}</span> <span className="text-sm text-muted-foreground">{o.quota}</span>
                    <span className="mt-1 flex gap-3 text-sm">
                      <Link href={L.lastRanks(o.course.slug, { inst: slug })} className="text-sky underline">Last ranks</Link>
                      <Link href={L.institute(slug, "allotments") + `&course=${o.course.slug}`} className="text-sky underline">Allotments</Link>
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    {profile && <ReachBadge reach={o.reach} provisional={!!o.latest?.provisional} />}
                    <span className="text-right"><span className="block text-xs text-muted-foreground">2025 deepest</span><Closing d={o.byYear[2025]} /></span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="trend" className="rounded-xl border border-border bg-card p-5">
            <h2 id="trend" className="text-lg font-semibold">Allotments made by year</h2>
            <p className="mt-1 text-sm text-muted-foreground">All courses and rounds here. This counts allotments, not seats.</p>
            <table className="mt-4 w-full max-w-xl text-sm">
              <caption className="sr-only">Allotments made by year at {college.name}</caption>
              <tbody>
                {allotmentsByYear.map((a) => (
                  <tr key={a.year}>
                    <th scope="row" className="w-28 py-1.5 text-left font-normal text-muted-foreground">{a.year}{a.year === 2026 && " (R1)"}</th>
                    <td className="py-1.5">{a.n != null && <div className="h-3 rounded-r-[4px] bg-sky" style={{ width: `${(a.n / maxN) * 100}%` }} aria-hidden />}</td>
                    <td className="w-12 py-1.5 text-right font-semibold">{a.n ?? <Dash />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {tab === "courses" && (
        <section aria-label="Courses">
          <div role="region" aria-label="Courses offered" tabIndex={0} className={tbl.wrap}>
            <table className={`${tbl.table} min-w-[900px]`}>
              <caption className="sr-only">Courses at {college.name}, with past closing ranks</caption>
              <thead>
                <tr className={tbl.headRow}>
                  <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Add to choices</span></th>
                  <th scope="col" className={tbl.th}>Course and quota</th>
                  <th scope="col" className={tbl.th}>{profile ? "Your reach" : "Reach"}</th>
                  <th scope="col" className={`${tbl.th} text-right`}>2026 R1</th>
                  <th scope="col" className={`${tbl.th} text-right`}>2025 deepest</th>
                  <th scope="col" className={tbl.th}>By year and round</th>
                  <th scope="col" className={tbl.th}>Related</th>
                  <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Compare</span></th>
                </tr>
              </thead>
              <tbody>
                {options.map((r) => (
                  <tr key={r.id} className={tbl.row}>
                    <td className="px-2 py-2"><ChoiceStar item={toChoiceItem(r)} /></td>
                    <th scope="row" className={`${tbl.td} text-left font-medium`}>{courseName(r)}<span className="block text-xs font-normal text-muted-foreground">{r.quota}</span></th>
                    <td className={tbl.td}>{profile ? <ReachBadge reach={r.reach} provisional={!!r.latest?.provisional} /> : <span className="text-xs text-muted-foreground">Set your rank to see</span>}</td>
                    <td className={tbl.num}><Closing d={r.latest} />{r.latest?.provisional && <span className="block text-xs font-normal text-sun">Provisional</span>}</td>
                    <td className={tbl.num}><Closing d={r.byYear[2025]} /></td>
                    <td className={tbl.td}><RoundGrid row={r} caption={`${courseName(r)}, ${r.quota}: closing ranks by year and round`} /></td>
                    <td className={`${tbl.td} whitespace-nowrap`}>
                      <Link href={L.lastRanks(r.course.slug, { inst: slug })} className="block text-sky underline">Last ranks</Link>
                      <Link href={L.institute(slug, "allotments") + `&course=${r.course.slug}`} className="block text-sky underline">Allotments</Link>
                    </td>
                    <td className="px-2 py-2"><CompareToggle id={r.id} label={`${college.name}, ${courseName(r)}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{HISTORY_CAPTION}{!profile && " Closing ranks shown across all seat categories."}</p>
        </section>
      )}

      {tab === "allotments" && allot && (
        <section aria-label="Allotments" className="grid gap-4">
          <FilterBar action={`/decide/institutes/${slug}`} params={sp} cols="md:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="tab" value="allotments" />
            <Field label="Year"><Select name="year" value={year ? String(year) : undefined} all="All years" options={[2026, 2025, 2024].map((y) => ({ value: String(y), label: y === 2026 ? "2026 (R1, provisional)" : String(y) }))} /></Field>
            <Field label="Course"><Select name="course" value={courseF} all="All courses" options={courses.map((c) => ({ value: c.slug, label: `${c.degree} ${c.name}` }))} /></Field>
          </FilterBar>
          <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{allot.total}</span> allotments at this institute. Ranks only, never names.</p>
          <div role="region" aria-label="Allotments at this institute" tabIndex={0} className={tbl.wrap}>
            <table className={`${tbl.table} min-w-[760px]`}>
              <caption className="sr-only">Allotments at {college.name}</caption>
              <thead><tr className={tbl.headRow}>
                <th scope="col" className={`${tbl.th} text-right`}>Rank</th><th scope="col" className={tbl.th}>Year and round</th><th scope="col" className={tbl.th}>Course</th><th scope="col" className={tbl.th}>Quota</th><th scope="col" className={tbl.th}>Seat category</th><th scope="col" className={tbl.th}>Remark</th>
              </tr></thead>
              <tbody>
                {allot.rows.map((a, i) => (
                  <tr key={i} className={tbl.row}>
                    <td className={tbl.num}><Link href={L.rankScan(a.rank, a.year)} className="hover:text-sky hover:underline" title="Scan ranks around this one">{formatRank(a.rank)}</Link></td>
                    <td className={tbl.td}>{a.year} {roundLabel[a.round as Round]}</td>
                    <td className={tbl.td}><Link href={L.lastRanks(a.courseSlug, { inst: slug })} className="hover:text-sky hover:underline">{a.courseName}</Link></td>
                    <td className={tbl.td}>{a.quota}</td>
                    <td className={tbl.td}>{a.category}</td>
                    <td className={`${tbl.td} text-muted-foreground`}>{a.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Select a rank to scan the seats allotted around it that year.</p>
        </section>
      )}

      {tab === "fees" && (
        <section aria-label="Fees, stipend and bond" className="grid gap-4 md:grid-cols-2">
          <Terms title="MD" t={terms.md} />
          <Terms title="DNB and NBEMS Diploma" t={terms.dnb} />
          <p className="text-sm md:col-span-2"><Link href={L.fees({ state: college.state ?? undefined })} className="text-sky underline">Compare fees with other institutes in {college.state}</Link></p>
        </section>
      )}

      {tab === "clinical" && (
        <section aria-label="Clinical data" className="rounded-xl border border-border bg-card p-5">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {["OPD per year", "IPD per year", "Bed occupancy", "Major OT", "Minor OT", "Emergency OT"].map((k) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-1 text-2xl font-bold"><Dash /></dd></div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">Not yet collected. For DNB hospitals this will come from their NBEMS mandatory disclosures.</p>
        </section>
      )}

      <DataSource />
    </Container>
  );
}
