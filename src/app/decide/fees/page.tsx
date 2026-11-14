import type { Metadata } from "next";
import Link from "next/link";
import { AppPage } from "@/features/decide/components/app-page";
import { DataSource } from "@/features/decide/components/data-source";
import { Dash, PageHead } from "@/features/decide/components/bits";
import { Empty, Field, FilterBar, profileOnly, Select, tbl } from "@/features/decide/components/ui";
import { formatLakh } from "@/features/decide/lib/format";
import { decideLinks } from "@/features/decide/lib/links";
import { toURLSearchParams } from "@/features/decide/profile";
import { getMeta, listFees } from "@/features/decide/service";

export const metadata: Metadata = { title: "Fees & bond" };

export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const meta = await getMeta();
  const program = (["MD", "DNB"] as const).find((p) => p === params.get("program"));
  const state = params.get("state") || undefined;
  const maxFeeLakh = Number(params.get("maxfee")) || undefined;
  const sort = (["fee", "stipend", "name"] as const).find((s) => s === params.get("sort")) ?? "fee";
  const rows = await listFees({ program, state, maxFeeLakh, sort });

  return (
    <AppPage className="grid gap-6 py-6">
      <PageHead title="Fees, stipend and bond">What each institute charges and pays, and the service bond you&apos;d sign. Missing values show as a dash, never zero.</PageHead>

      <FilterBar action="/decide/fees" params={params} cols="md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <Field label="Programme"><Select name="program" value={program} all="MD and DNB" options={[{ value: "MD", label: "MD" }, { value: "DNB", label: "DNB and NBEMS Diploma" }]} /></Field>
        <Field label="State"><Select name="state" value={state} all="All states" options={meta.states.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="Max fee per year"><Select name="maxfee" value={maxFeeLakh ? String(maxFeeLakh) : undefined} all="Any" options={[1, 2, 5, 10, 20, 30].map((l) => ({ value: String(l), label: `Up to ₹${l} L` }))} /></Field>
        <Field label="Sort by"><Select name="sort" value={sort} options={[{ value: "fee", label: "Lowest fee" }, { value: "stipend", label: "Highest stipend" }, { value: "name", label: "Name" }]} /></Field>
      </FilterBar>

      <p aria-live="polite" className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{rows.length}</span> institute programmes</p>

      {rows.length === 0 ? (
        <Empty title="Nothing matches these filters." href={profileOnly("/decide/fees", params)} />
      ) : (
        <div role="region" aria-label="Fees, stipend and bond" tabIndex={0} className={tbl.wrap}>
          <table className={`${tbl.table}`}>
            <caption className="sr-only">Fees, stipend and bond by institute</caption>
            <thead><tr className={tbl.headRow}>
              <th scope="col" className={tbl.th}>Institute</th>
              <th scope="col" className={tbl.th}>Programme</th>
              <th scope="col" className={`${tbl.th} text-right`}>Fee per year</th>
              <th scope="col" className={`${tbl.th} text-right`}>Stipend (year 1)</th>
              <th scope="col" className={tbl.th}>Bond</th>
              <th scope="col" className={tbl.th}>Penalty</th>
              <th scope="col" className={tbl.th}>Related</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.college.key}-${r.program}`} className={tbl.row}>
                  <th scope="row" className={`${tbl.td} text-left font-medium`}><Link href={L.institute(r.college.slug, "fees")} className="hover:text-sky hover:underline">{r.college.name}</Link><span className="block text-xs font-normal text-muted-foreground">{r.college.state}, {r.college.type}</span></th>
                  <td className={tbl.td}>{r.program === "MD" ? "MD" : "DNB / Diploma"}</td>
                  <td className={tbl.num}>{r.fee?.amountInr != null ? formatLakh(r.fee.amountInr) : <Dash />}<span className="block text-xs font-normal text-muted-foreground">{r.fee?.text}</span></td>
                  <td className={tbl.num}>{r.stipend?.amountInr != null ? `₹${r.stipend.amountInr.toLocaleString("en-IN")}` : <Dash />}<span className="block text-xs font-normal text-muted-foreground">per month</span></td>
                  <td className={tbl.td}>{r.bond?.text ?? <Dash />}</td>
                  <td className={tbl.td}>{r.penalty?.text ?? <Dash />}</td>
                  <td className={`${tbl.td} whitespace-nowrap`}>
                    <Link href={L.institute(r.college.slug, "courses")} className="block text-sky underline">Courses</Link>
                    <Link href={L.options({ q: r.college.name, closed: true })} className="block text-sky underline">In my options</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <DataSource />
    </AppPage>
  );
}
