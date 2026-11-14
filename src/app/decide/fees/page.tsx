import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { Dash, PageHead, TermText } from "@/features/decide/components/bits";
import { EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { feeChoices, toURLSearchParams } from "@/features/decide/profile";
import { getMeta, listFees } from "@/features/decide/service";
import { termLabel } from "@/features/decide/types";

export const metadata: Metadata = { title: "Fees & bond" };
const PAGE_SIZE = 50;
const programs = { MD: "Medical college seats (MD, MS, Diploma)", DNB: "DNB and NBEMS Diploma seats" } as const;
const schema = z.object({
  program: z.enum(["MD", "DNB"]).optional(),
  state: z.string().max(100).optional(),
  maxfee: z.coerce.number().positive().max(1000).optional(),
  sort: z.enum(["fee", "stipend", "name"]).default("fee"),
  page: pageValue.default(1),
});

export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const [meta, res] = await Promise.all([
    getMeta(),
    listFees({ program: f.program, state: f.state, maxFeeLakh: f.maxfee, sort: f.sort }, { page: f.page, pageSize: PAGE_SIZE }),
  ]);
  const { rows } = res;

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Fees, stipend and bond">What each institute charges and pays, the service bond and MCC&apos;s seat-leaving penalty, quoted as published with a link to each document. Missing values show as a dash, never zero.</PageHead>

      <FilterBar action="/decide/fees" params={params} cols="md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <Field label="Programme"><Select name="program" value={f.program} all="All programmes" options={Object.entries(programs).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="State"><Select name="state" value={f.state} all="All states" options={meta.states.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="Max fee per year"><Select name="maxfee" value={f.maxfee ? String(f.maxfee) : undefined} all="Any" options={feeChoices(f.maxfee).map((l) => ({ value: String(l), label: `Up to ₹${l} L` }))} /></Field>
        <Field label="Sort by"><Select name="sort" value={f.sort} options={[{ value: "fee", label: "Lowest fee" }, { value: "stipend", label: "Highest stipend" }, { value: "name", label: "Name" }]} /></Field>
      </FilterBar>

      <p id="results" tabIndex={-1} aria-live="polite" className="text-sm text-muted-foreground">
        <span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> institute programmes
      </p>

      {res.total === 0 ? (
        <EmptyState title="Nothing matches these filters." href={L.to("/decide/fees")} />
      ) : (
        <div role="region" aria-label="Fees, stipend and bond" tabIndex={0} className={tbl.wrap}>
          <table className={tbl.table}>
            <caption className="sr-only">Fees, stipend, bond and seat-leaving penalty by institute and programme, page {res.page}</caption>
            <thead><tr className={tbl.headRow}>
              <th scope="col" className={tbl.th}>Institute</th>
              <th scope="col" className={tbl.th}>Programme</th>
              <th scope="col" className={tbl.th}>{termLabel.FEE}</th>
              <th scope="col" className={tbl.th}>{termLabel.STIPEND}</th>
              <th scope="col" className={tbl.th}>{termLabel.BOND}</th>
              <th scope="col" className={tbl.th}>{termLabel.PENALTY}</th>
              <th scope="col" className={tbl.th}>Related</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.college.key}-${r.program}`} className={tbl.row}>
                  <th scope="row" className={`${tbl.td} min-w-48 text-left font-medium`}>
                    <Link href={L.institute(r.college.slug, "fees")} className="hover:text-sky hover:underline">{r.college.name}</Link>
                    <span className="block text-xs font-normal text-muted-foreground">{r.college.state ?? <Dash />}</span>
                  </th>
                  <td className={tbl.td}>{r.program === "MD" ? "MD, MS, Diploma" : "DNB, NBEMS Diploma"}</td>
                  <td className={`${tbl.td} numeric min-w-44`}><TermText term={r.fee} /></td>
                  <td className={`${tbl.td} numeric min-w-52`}><TermText term={r.stipend} /></td>
                  <td className={`${tbl.td} numeric`}><TermText term={r.bond} /></td>
                  <td className={`${tbl.td} numeric min-w-44`}><TermText term={r.penalty} /></td>
                  <td className={`${tbl.td} whitespace-nowrap`}>
                    <span className="flex gap-x-3">
                      <Link href={L.institute(r.college.slug, "courses")} className={`${smallLink} text-sky`}>Courses</Link>
                      <Link href={L.options({ q: r.college.name, closed: true, all: true })} className={`${smallLink} text-sky`}>In my options</Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page("/decide/fees", n)} focusId="results" label="Fees" />

      <div className="grid gap-2 text-xs text-muted-foreground">
        {rows.length > 0 && rows.every((r) => !r.bond) && <p>Service bonds aren&apos;t in the imported data yet, so Bond shows a dash. Check the institute&apos;s MCC profile before you lock a choice.</p>}
        <p>Sorting and the fee cap use the first rupee figure in the text (year 1). Values with no figure sort last and are kept under a cap.</p>
        <p>{termLabel.PENALTY}: the amount forfeited under MCC rules if you resign or don&apos;t join, from Round 2 on, as the institute&apos;s MCC profile lists it. It is not a bond penalty.</p>
        <DataSource terms={rows.flatMap((r) => [r.fee?.source, r.stipend?.source, r.bond?.source, r.penalty?.source])} results={false} />
      </div>
    </AppPage>
  );
}
