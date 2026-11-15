import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { formatINR, formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { amountNote, Money, NotDeclared, programmeTitle } from "@/features/decide/components/fees";
import { feeDefaults, feesFilters, feesParamsSchema } from "@/features/decide/components/fees-view";
import { control, EmptyState, Field, FilterBar, Pager, rangeLabel, Select, smallLink, tbl } from "@/features/decide/components/ui";
import { decideLinks } from "@/features/decide/lib/links";
import { pageValue, parseSearchParams } from "@/features/decide/lib/params";
import { BOND_YEAR_CHOICES, feeChoices, profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { getDecideData, getMeta, listFees, type FeeSort } from "@/features/decide/service";
import { programmeNames, programmes, type Amount, type ProgrammeTerms } from "@/features/decide/server/terms";

export const metadata: Metadata = { title: "Fees & bond" };
const PAGE_SIZE = 50;
const schema = feesParamsSchema.extend({ page: pageValue.default(1) });
const STIPEND_CHOICES = [40000, 50000, 60000, 70000, 80000, 90000, 100000];
const BOND_LAKH_CHOICES = [5, 10, 20, 25, 40, 50, 100];
/** Sortable columns, in table order; stipend sorts highest first by default, the rest lowest first. */
const columns: { key: Exclude<FeeSort, "name">; label: string }[] = [
  { key: "fee1", label: "Fee/yr (year 1)" },
  { key: "feetotal", label: "Whole-course fee" },
  { key: "stip1", label: "Stipend year 1" },
  { key: "bondyrs", label: "Bond years" },
  { key: "bond", label: "Bond ₹ (max)" },
  { key: "leave", label: "Leaving penalty ₹" },
];
const natural = (k: FeeSort) => (k === "stip1" ? "desc" : "asc");
const arrow = (on: boolean, dir: string) => (on ? <span aria-hidden="true">{dir === "asc" ? " ↑" : " ↓"}</span> : null);
/** Filters folded behind "More filters" on phones (globals.css `.more-filter`). */
const more = "more-filter";

/** A bond or leaving amount cell: the highest ₹ figure with what it leaves out, "In words" (declared, no ₹ figure), "None" (no bond on record), or "—". */
function AmountCell({ a, years, declared, none, href }: { a: Amount; years: number | null; declared: boolean; none?: boolean; href: string }) {
  if (none) return <span className="text-xs font-normal">None</span>;
  if (!declared || a.state === "none") return <NotDeclared />;
  if (a.state === "words" || a.max == null)
    return <Link href={href} className="text-xs font-normal text-sky underline">In words<span className="sr-only">: declared, no rupee figure; see the exact words</span></Link>;
  const note = amountNote(a, years);
  return <>{formatINR(a.max)}{note && <span className="block text-xs font-normal text-muted-foreground">{note}</span>}</>;
}

/** Year 1's fee; "In words" where the profile gives the fee only in its own words (no figure is shown for it). */
function FeeCell({ t, href }: { t: ProgrammeTerms; href: string }) {
  if (t.years[0]?.fee || !t.unread.some((u) => u.kind === "FEE")) return <Money f={t.years[0]?.fee} sources={t.sources} />;
  return <Link href={href} className="text-xs font-normal text-sky underline">In words<span className="sr-only">: the fee is in the MCC profile&apos;s own words, no figure; see them</span></Link>;
}

/** Bond years; "No bond" only where a record says so (the college's document or the NBEMS rule), "Unknown" where it says that. */
function BondYears({ t }: { t: ProgrammeTerms }) {
  const b = t.bond;
  const rule = b.basis === "state_rule" ? " (state rule)" : b.basis === "nbems_rule" ? " (NBEMS rule)" : "";
  if (b.status === "none") return <span className="text-xs font-normal">No bond{rule}{b.caveat && <span className="block text-sun">{b.caveat}</span>}</span>;
  if (b.status === "not_declared" && b.text) return <span className="text-xs font-normal">Unknown<span className="sr-only">: the bond is not checked or not clear</span></span>;
  if (b.status !== "declared") return <NotDeclared what={b.status === "other_course" ? "bond not declared for this course" : "bond not in our MCC data"} />;
  return b.years != null ? <>{b.yearsSum ? `${b.yearsSum} = ${b.years}` : b.years} yr{rule && <span className="block text-xs font-normal text-muted-foreground">{rule.trim()}</span>}</> : <span className="text-xs font-normal">Declared, years not stated{rule}</span>;
}

export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const f = parseSearchParams(schema, params);
  const profile = profileFromParams(params);
  const [meta, { courses }] = await Promise.all([getMeta(), getDecideData()]);
  const d = feeDefaults(profile, courses);
  const res = await listFees(feesFilters(f, d), { page: f.page, pageSize: PAGE_SIZE });
  const { rows } = res;
  const dir = f.dir ?? natural(f.sort);
  const sortHref = (k: FeeSort) => L.with("/decide/fees", { sort: k, dir: f.sort === k ? (dir === "asc" ? "desc" : "asc") : natural(k), page: null });
  const exportHref = `/api/v1/fees/export?${params}`;
  const years = (r: (typeof rows)[number]) => `${L.institute(r.college.slug, "fees")}#fees-${programmes[r.terms.programme].slug}`;
  const byName = f.sort === "name";
  const moreSet = f.minstip != null || f.maxbond != null || f.bdecl != null || f.nd === "hide" || f.dir != null;

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Fees, stipend and bond">
        What each institute charges and pays per programme, its service bond and the penalty for leaving, from what colleges declared to MCC and NBEMS rules. A dash means not in Seatora&apos;s MCC data, never zero or &quot;no bond&quot;.
      </PageHead>

      <FilterBar action="/decide/fees" params={params} cols="md:grid-cols-4">
        <Field label="Programme">
          <Select name="program" value={f.program} all={d.programmes ? `Your profile: ${d.programmes.join(", ")}` : "All programmes"}
            options={[...(d.programmes ? [{ value: "all", label: "All programmes" }] : []), ...programmeNames.map((p) => ({ value: programmes[p].slug, label: p }))]} />
        </Field>
        <Field label="State">
          <Select name="state" value={f.state} all={d.states ? `Your profile: ${d.states.join(", ")}` : "All states"}
            options={[...(d.states ? [{ value: "all", label: "All states" }] : []), ...meta.states.map((s) => ({ value: s, label: s }))]} />
        </Field>
        <Field label="Institute">
          <input name="q" type="search" defaultValue={f.q ?? ""} placeholder="Name or state" className={control} />
        </Field>
        <Field label="Max fee per year">
          <Select name="maxfee" value={f.maxfee == null ? undefined : String(f.maxfee)} all={d.maxFeeLakh ? `Your cap: up to ₹${d.maxFeeLakh} L` : "Any"}
            options={[...(d.maxFeeLakh ? [{ value: "any", label: "Any" }] : []), ...feeChoices(typeof f.maxfee === "number" ? f.maxfee : null).map((l) => ({ value: String(l), label: `Up to ₹${l} L` }))]} />
        </Field>
        <div className={more}>
          <Field label="Min stipend, year 1">
            <Select name="minstip" value={f.minstip ? String(f.minstip) : undefined} all="Any" options={STIPEND_CHOICES.map((n) => ({ value: String(n), label: `At least ${formatINR(n)}/month` }))} />
          </Field>
        </div>
        <Field label="Max bond years">
          <Select name="bondyrs" value={f.bondyrs == null ? undefined : String(f.bondyrs)} all={d.maxBondYears != null ? `Your cap: ${d.maxBondYears === 0 ? "no bond" : `up to ${d.maxBondYears} yr`}` : "Any"}
            options={[...(d.maxBondYears != null ? [{ value: "any", label: "Any" }] : []), ...BOND_YEAR_CHOICES.map((n) => ({ value: String(n), label: n === 0 ? "No bond" : `Up to ${n} ${n === 1 ? "year" : "years"}` }))]} />
        </Field>
        <div className={more}>
          <Field label="Max bond ₹">
            <Select name="maxbond" value={f.maxbond ? String(f.maxbond) : undefined} all="Any" options={BOND_LAKH_CHOICES.map((l) => ({ value: String(l), label: `Up to ₹${l} L` }))} />
          </Field>
        </div>
        <div className={more}>
          <Field label="Service bond">
            <Select name="bdecl" value={f.bdecl} all="Declared or not" options={[{ value: "declared", label: "Bond declared" }, { value: "none", label: "No bond on record" }]} />
          </Field>
        </div>
        <Field label="Sort by">
          <Select name="sort" value={f.sort} options={[...columns.map((c) => ({ value: c.key, label: c.label })), { value: "name", label: "Institute name" }]} />
        </Field>
        <div className={more}>
          <Field label="Order">
            <Select name="dir" value={f.dir} all={`Default: ${byName ? "A to Z" : natural(f.sort) === "desc" ? "highest first" : "lowest first"}`}
              options={[{ value: "asc", label: byName ? "A to Z" : "Lowest first" }, { value: "desc", label: byName ? "Z to A" : "Highest first" }]} />
          </Field>
        </div>
        {/* Ticked: nd=keep comes first and wins; unticked: only the hidden nd=hide is sent. */}
        <label className={`${more} flex min-h-11 items-center gap-2 self-end text-sm`}>
          <input type="checkbox" name="nd" value="keep" defaultChecked={f.nd !== "hide"} className="size-5 accent-sky" />
          <span>Include colleges that haven&apos;t declared it<span className="block text-xs text-muted-foreground">For the fee, stipend and bond caps (bond: not declared or unknown)</span></span>
        </label>
        <input type="hidden" name="nd" value="hide" />
        <label className="flex min-h-11 items-center gap-2 text-sm md:hidden">
          <input type="checkbox" className="more-toggle size-5 accent-sky" defaultChecked={moreSet} />
          Show all filters
        </label>
      </FilterBar>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="results" tabIndex={-1} aria-live="polite" className="text-sm font-normal text-muted-foreground">
          <span className="numeric font-semibold text-foreground">{rangeLabel(res)}</span> institute programmes
          {res.undeclared > 0 && <>; <span className="numeric">{formatRank(res.undeclared)}</span> of them have nothing in Seatora&apos;s MCC data</>}
        </h2>
        <Button asChild variant="secondary"><a href={exportHref} download>Download CSV</a></Button>
      </div>

      {res.total === 0 ? (
        <EmptyState title="Nothing matches these filters." href={L.to("/decide/fees", { program: "all", state: "all", maxfee: "any", bondyrs: "any" })} />
      ) : (
        <>
          <div role="region" aria-label="Fees, stipend and bond" tabIndex={0} className={`${tbl.wrap} hidden md:block`}>
            <table className={tbl.table}>
              <caption className="sr-only">Fees, stipend, service bond and leaving penalty by institute and programme, page {res.page}</caption>
              <thead><tr className={tbl.headRow}>
                <th scope="col" className={`${tbl.th} sticky left-0 z-10 bg-card`} aria-sort={byName ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                  <Link href={sortHref("name")} className="inline-flex min-h-11 items-center hover:text-foreground"><span className="sr-only">Sort by </span>Institute{arrow(byName, dir)}</Link>
                </th>
                <th scope="col" className={tbl.th}>Programme</th>
                {columns.map((c) => {
                  const on = f.sort === c.key;
                  return (
                    <th key={c.key} scope="col" className={`${tbl.th} text-right`} aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                      <Link href={sortHref(c.key)} className="inline-flex min-h-11 items-center justify-end hover:text-foreground"><span className="sr-only">Sort by </span>{c.label}{arrow(on, dir)}</Link>
                    </th>
                  );
                })}
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const t = r.terms;
                  const b = t.bond;
                  const declared = b.status === "declared";
                  return (
                    <tr key={`${r.college.key}-${t.programme}`} className={tbl.row}>
                      <th scope="row" className={`${tbl.td} sticky left-0 min-w-48 bg-card text-left font-medium`}>
                        <Link href={L.institute(r.college.slug, "fees")} className="hover:text-sky hover:underline">{r.college.name}</Link>
                        <span className="block text-xs font-normal text-muted-foreground">{r.college.state ?? <NotDeclared what="state not available" />}</span>
                      </th>
                      <td className={`${tbl.td} whitespace-nowrap`}>
                        {programmeTitle(t)}
                        <Link href={years(r)} className="flex min-h-11 items-center text-sky">Year by year<span className="sr-only">: {r.college.name}, {t.programme}</span></Link>
                      </td>
                      <td className={`${tbl.num} numeric`}><FeeCell t={t} href={years(r)} /></td>
                      <td className={`${tbl.num} numeric`}>
                        {t.wholeCourseFee != null ? <>{formatINR(t.wholeCourseFee)}{t.years[0]?.fee?.kind === "maximum" && <span className="block text-xs font-normal text-muted-foreground">NBEMS maximum</span>}</> : <NotDeclared what="not stated for every year" />}
                      </td>
                      <td className={`${tbl.num} numeric`}><Money f={t.years[0]?.stipend} sources={t.sources} /></td>
                      <td className={`${tbl.num} numeric`}><BondYears t={t} /></td>
                      <td className={`${tbl.num} numeric`}><AmountCell a={b.amount} years={b.years} declared={declared} none={b.status === "none"} href={years(r)} /></td>
                      <td className={`${tbl.num} numeric`}><AmountCell a={b.leavingAmount} years={null} declared={b.leaving.length > 0} href={years(r)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Phones: one card per row (fee and stipend year 1, bond, leaving); sorting is the Sort by select. */}
          <ul className="grid gap-3 md:hidden">
            {rows.map((r) => {
              const t = r.terms;
              const b = t.bond;
              const declared = b.status === "declared";
              return (
                <li key={`${r.college.key}-${t.programme}`} className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold"><Link href={L.institute(r.college.slug, "fees")} className="hover:text-sky hover:underline">{r.college.name}</Link></h3>
                  <p className="text-xs text-muted-foreground">{r.college.state ?? "State not available"} · {programmeTitle(t)}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Fee, year 1</dt><dd className="numeric font-semibold"><FeeCell t={t} href={years(r)} /></dd></div>
                    <div><dt className="text-xs text-muted-foreground">Stipend, year 1</dt><dd className="numeric font-semibold"><Money f={t.years[0]?.stipend} sources={t.sources} /></dd></div>
                    <div><dt className="text-xs text-muted-foreground">Service bond</dt><dd className="numeric font-semibold"><BondYears t={t} />{declared && b.amount.state !== "none" && <span className="block"><AmountCell a={b.amount} years={b.years} declared href={years(r)} /></span>}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Leaving penalty</dt><dd className="numeric font-semibold"><AmountCell a={b.leavingAmount} years={null} declared={b.leaving.length > 0} href={years(r)} /></dd></div>
                  </dl>
                  <Link href={years(r)} className={`${smallLink} text-sm text-sky`}>Year by year, sources<span className="sr-only">: {r.college.name}, {t.programme}</span></Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(n) => L.page("/decide/fees", n)} focusId="results" label="Fees" />

      <div className="grid max-w-3xl gap-2 text-xs text-muted-foreground">
        <p><b className="font-semibold text-foreground">Fee</b>: what the college&apos;s MCC profile says you pay in year 1 (an amount paid at admission says so). A DNB hospital that declared no fee shows the NBEMS maximum: the most NBEMS lets it charge (no GST, paid to the hospital), not its own figure. &quot;In words&quot;: the profile gives the fee only in words (by subject, a range), so no figure is shown. Whole course: only where every year&apos;s fee is stated.</p>
        <p><b className="font-semibold text-foreground">Stipend</b>: monthly pay before tax. A &quot;minimum&quot; is the NBEMS floor: the actual pay may be higher. An NMC list figure is one PG figure, not split by year.</p>
        <p><b className="font-semibold text-foreground">Service bond</b>: years you must work after the course, and what you pay if you don&apos;t. The highest amount for that programme; an amount per defaulting year is multiplied by the years (computed). Figures for other courses, in-service candidates, or the state quota where an All India one is given are left out (they are in the exact words under Year by year).</p>
        <p><b className="font-semibold text-foreground">Leaving penalty</b>: what you pay if you leave the seat or course after joining, from the college&apos;s bond document or the state&apos;s rule. &quot;In words&quot;: declared without a ₹ figure.</p>
        <p><b className="font-semibold text-foreground">Resign from Round 2</b>: what the college keeps if you resign or don&apos;t join from Round 2 (MCC rules). This is separate; see Year by year.</p>
        <p>A dash means not in Seatora&apos;s MCC data: not declared in the MCC profile fields we import (the profile may say more), never zero or &quot;no bond&quot;. &quot;No bond&quot; is shown only where the college&apos;s own document or the NBEMS rule for private DNB hospitals says so; &quot;Unknown&quot; where Seatora&apos;s check found no clear answer; &quot;state rule&quot; where the figure is the state&apos;s rule, not the college&apos;s own document. Sorting: those go last either way; figures in words count as not declared.</p>
        <p className="flex flex-wrap items-center gap-x-2">
          <Badge tone={sourceTypeLabels.OFFICIAL.tone}>{sourceTypeLabels.OFFICIAL.text}</Badge>
          From the colleges&apos; MCC institute profiles (their declarations and bond documents), NBEMS notices and NMC&apos;s stipend list. Year by year numbers every figure and links its document; a figure from an MCC profile several institutes cite says it may be another institute&apos;s.
        </p>
      </div>
    </AppPage>
  );
}
