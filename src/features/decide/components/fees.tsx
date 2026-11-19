import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { formatINR } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { fmtDay, formatInrShort } from "../lib/format";
import type { FeeQuotaGroup } from "../server/facts";
import type { Amount, Figure, ProgrammeTerms, TermPart, TermSource } from "../server/terms";
import { variantFor } from "../lib/specialty-search";
import { bondUnknownWhy, NONE_DECLARED, noneDeclared, noneDeclaredWhy, NOT_KNOWN, NOT_PUBLISHED, unreadWhy } from "../lib/stat-format";
import { termLabel } from "../types";
import { SourceRef } from "./page-sources";
import { smallLink } from "./ui";
import { ExamWords, QuotaName } from "./round-name";
import { authorityOf, type ExamKey } from "@/features/exams/keys";

// Fees, stipend and bond as ProgrammeTerms (server/terms.ts) renders them. Server-safe and client-safe on purpose (no
// "use client", type-only server imports): the institute and Fees pages render them on the server, Options rows in the browser.

/** The documents behind rows' stat cells, for the DataSource under them (one entry per document). */
export const termDocs = (ts: Pick<ProgrammeTerms, "sources">[]) => ts.flatMap((t) => t.sources.map((s) => ({ name: srcName(s), url: s.url, type: s.type })));
/** The MCC profile id to add to a source's name, unless its label already gives it (a fee-table source). */
const idOf = (s: TermSource) => (s.mccId && !s.label.includes(s.mccId) ? s.mccId : null);
/** "MCC institute profile (…), 2026, MCC profile 700417": a source's name with its year. */
const srcName = (s: TermSource) => `${s.label}${s.year ? `, ${s.year}` : ""}${idOf(s) ? `, MCC profile ${idOf(s)}` : ""}`;

/** "MD/MS", "Diploma (2 years)", "DNB", "NBEMS Diploma (2 years)", "MCh (6 years)". */
export const programmeTitle = (t: Pick<ProgrammeTerms, "programme" | "durationYears">) => (t.durationYears === 3 ? t.programme : `${t.programme} (${t.durationYears} years)`);

const isDnb = (t: ProgrammeTerms) => t.programme === "DNB" || t.programme === "NBEMS Diploma";

export const NBEMS_BOND_RULES = [
  { label: "NBEMS fee guidelines, 3 April 2019", url: "https://natboard.edu.in/pdoof/pbnotice2019/Notice%20Fee%20Guidelines%20-%2003-04-2019.pdf" },
  { label: "NBEMS accreditation bulletin 2025, para 5.10", url: "https://accr.natboard.edu.in/online_user/DOCUMENTS/misc/information_bulletin_chapter/Jan-feb/09-2025.pdf" },
];
// The rules that may still bind a bond that is not known.
const DNB_RULE = "NBEMS rule: private DNB hospitals may not take any bond or deposit; government hospitals may apply a state service bond only if they declared it to MCC before counselling.";
const STATE_CAUTION = "Government colleges may still have a state service bond: check the state's PG rules.";
const NOT_IN_DATA = NOT_PUBLISHED;

/** Missing data: "Not published" (no document gives it), never "—" (that is "not applicable") or 0. */
export function NotDeclared() {
  return <span className="text-muted-foreground">{NOT_PUBLISHED}</span>;
}


/** A figure's source number in the page's "Sources (N)" footer (page-sources.tsx), named "Source N: …". */
export function Sup({ n, sources }: { n: number | null | undefined; sources: TermSource[] }) {
  const s = n != null ? sources.find((x) => x.n === n) : undefined;
  return s ? <SourceRef doc={termDocs([{ sources: [s] }])[0]} /> : null;
}

const kindNote: Partial<Record<Figure["kind"], string>> = {
  maximum: "the most NBEMS lets a DNB hospital charge (no GST, paid to the hospital), not the college's own figure",
  nmc: "NMC list: one PG figure, not split by year; allowances such as DA may be extra",
};

/** A fee or stipend in full Indian grouping (a range: min–max) with what kind of figure it is and its source number; "—" when not declared. */
export function Money({ f, sources }: { f: Figure | null | undefined; sources: TermSource[] }) {
  if (!f) return <NotDeclared />;
  return (
    <span className="whitespace-nowrap">
      {f.kind === "maximum" ? "Up to " : f.kind === "minimum" ? "From " : ""}{f.min != null && `${formatINR(f.min)}–`}{formatINR(f.inr)}
      <Sup n={f.src} sources={sources} />
      {f.atAdmission && <span className="block text-xs font-normal text-muted-foreground">paid at admission</span>}
      {kindNote[f.kind] && <span className="block text-xs font-normal text-muted-foreground">{kindNote[f.kind]}</span>}
    </span>
  );
}

/**
 * A bond or leaving amount as one figure: "₹35 L–₹50 L" (a range when it depends on course type), "up to ₹30 L" (a per
 * defaulting year amount × the years); null unless it has a ₹ figure. `full`: full Indian grouping.
 */
export function amountText(a: Amount, full = false): string | null {
  if (a.state !== "figure" || a.max == null) return null;
  const f = full ? formatINR : formatInrShort;
  return `${a.perYear ? "up to " : ""}${a.min != null && a.min !== a.max ? `${f(a.min)}–${f(a.max)}` : f(a.max)}`;
}
/** What a figure leaves out: "₹10 L × 3 yrs, computed", "incl. ₹10 L additional", "varies by specialty", "+ terms in words". */
export function amountNote(a: Amount, years: number | null): string {
  return [
    a.perYear && years ? `${formatInrShort(a.perYear)} × ${years} yrs, computed` : null,
    a.extra ? `incl. ${formatInrShort(a.extra)} additional` : null,
    a.varies ? "varies by specialty (see source)" : null,
    a.more ? "+ terms in words" : null,
  ].filter(Boolean).join("; ");
}

/** A record's rows (each with its ₹ figure, or the source's words), " · " between them. */
const partsText = (parts: TermPart[]) => parts.map((p) => p.text).join(" · ");
/** Parts with their source numbers (a penalty item's own document, else the bond's). */
function Parts({ parts, src, sources }: { parts: TermPart[]; src: number | null; sources: TermSource[] }) {
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && " · "}
      {partsText([p])}
      <Sup n={p.src ?? src} sources={sources} />
    </span>
  ));
}
const years = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
/** "2 years", or "1 + 3 = 4 years" where the record's years are added up. */
const bondYears = (b: ProgrammeTerms["bond"]) => (b.years == null ? "Bond, years not stated" : b.yearsSum ? `${b.yearsSum} = ${years(b.years)}` : years(b.years));
const BASIS: Record<NonNullable<ProgrammeTerms["bond"]["basis"]>, string> = { document: "the college's own document", state_rule: "state rule", nbems_rule: "NBEMS rule" };


/** The NBEMS bond rules as source numbers (the page's footer). */
function NbemsRules() {
  return NBEMS_BOND_RULES.map((r) => <SourceRef key={r.url} doc={{ name: r.label, url: r.url, type: "OFFICIAL" }} />);
}

// ---------- The per-year fee table by seat-type group (FeesStructured, server/facts.ts feesFor) ----------

type Numbers = Extract<FeeQuotaGroup["fee"], { display: "numbers" }>;
type FeeEntry = NonNullable<Numbers["perYear"][number]>;
type StipendEntry = NonNullable<FeeQuotaGroup["stipendPerMonth"][number]>;

/** ₹ in Indian grouping; NRI fees are declared in US$. A range: min–max. */
function feeMoney(a: { amount: number; amount_max?: number; currency: "INR" | "USD" }) {
  const f = (n: number) => (a.currency === "USD" ? `US$${n.toLocaleString("en-US")}` : formatINR(n));
  return a.amount_max != null && a.amount_max !== a.amount ? `${f(a.amount)}–${f(a.amount_max)}` : f(a.amount);
}
/**
 * A group's numbered documents as TermSource (all official: MCC, the college's document on MCC, NBEMS, NMC), numbered on
 * from `off` (the programme's earlier groups), so one programme block has one numbering.
 */
const groupSources = (g: FeeQuotaGroup, off: number): TermSource[] =>
  g.sources.map((s) => ({ n: s.n + off, label: s.label, url: s.url, year: typeof s.year === "number" ? s.year : null, mccId: null, sharedBy: 1, type: "OFFICIAL" }));
const lastSource = (g: FeeQuotaGroup) => Math.max(0, ...g.sources.map((s) => s.n));

const FEE_KIND: Partial<Record<FeeEntry["kind"], string>> = { amount_at_admission: "paid at admission", annual_fee: "annual fee" };
const OTHER_KIND: Record<NonNullable<Numbers["otherFees"]>[number]["kind"], string> = {
  fee_part: "part of the fee",
  hostel: "hostel",
  one_time: "one-time",
  refundable_deposit: "refundable deposit",
  deposit: "deposit",
};
const HOSTEL_IN: Record<NonNullable<Numbers["includesHostel"]>, string> = {
  yes: "The fee includes hostel.",
  no: "The fee does not include hostel.",
  not_stated: "The profile does not say whether the fee includes hostel.",
};
const NBEMS_MAX = "NBEMS maximum: the most NBEMS lets a DNB hospital charge (no GST, paid to the hospital), not the college's own figure.";
const NBEMS_MIN = "NBEMS minimum: the hospital must pay at least this; the actual pay may be higher.";
/** MCC's three counselling form fields, in the order a candidate meets them. */
const FORFEIT = [
  ["deducted_on_reallocation", "deducted if MCC moves you to another seat"],
  ["refunded_if_resign_during_counselling", "refunded if you resign during counselling"],
  ["forfeited_if_resign_or_not_join_from_round2", "forfeited if you resign or don't join from Round 2"],
] as const;
/** A figure's source number in the programme block's numbering. */
type At = (n: number | undefined) => React.ReactNode;

function FeeCell({ f, at }: { f: FeeEntry | null; at: At }) {
  if (!f) return <NotDeclared />;
  return (
    <span className="whitespace-nowrap">
      {f.maximum && "Up to "}{f.amount != null ? feeMoney({ amount: f.amount, amount_max: f.amount_max, currency: f.currency }) : f.text}
      {at(f.src)}
      {f.above_nbems_ceiling && <Badge tone="warning" className="ml-1.5">above NBEMS limit</Badge>}
      {FEE_KIND[f.kind] && <span className="block text-xs font-normal text-muted-foreground">{FEE_KIND[f.kind]}</span>}
    </span>
  );
}

type Parsed = NonNullable<Extract<FeeQuotaGroup["fee"], { display: "verbatim" }>["parsed"]>;
/** A figure read out of the profile's own fee words (its exact words are listed under the table). */
function ParsedCell({ x, adm, at, src }: { x: Parsed["per_year"][number] | undefined; adm?: boolean; at: At; src: number }) {
  if (!x) return <NotDeclared />;
  return (
    <span className="whitespace-nowrap">
      {feeMoney(x)}
      {at(src)}
      {adm && <span className="block text-xs font-normal text-muted-foreground">paid at admission</span>}
    </span>
  );
}
const perOf = { per_year: "a year", per_month: "a month" } as const;

function StipendCell({ s, at }: { s: StipendEntry | null; at: At }) {
  if (!s) return <NotDeclared />;
  return (
    <span className="whitespace-nowrap">
      {s.minimum && "From "}{formatINR(s.inr)}{s.plus_da && " + DA"}
      {at(s.src)}
      {s.below_nbems_minimum && <Badge tone="warning" className="ml-1.5">below NBEMS min</Badge>}
      {s.kind === "nmc_list" && <span className="block text-xs font-normal text-muted-foreground">NMC stipend list{s.one_figure_all_years && ": one figure for every year"}</span>}
    </span>
  );
}

/** The profile's own fee words with their MCC link (a verbatim record's only fee; a numbers record's, to check against). */
function FeeWords({ fee }: { fee: FeeQuotaGroup["fee"] }) {
  return (
    <>
      {fee.text ? <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{fee.text}</blockquote> : <p className="text-muted-foreground"><ExamWords>The MCC profile gives no fee in words for these seats.</ExamWords></p>}
      {fee.src && (
        <a href={fee.src.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-xs text-sky`}>
          <ExamWords>MCC institute profile</ExamWords>, read <span className="numeric ml-1">{fmtDay(fee.src.date)}</span><span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </>
  );
}

/** A course here (the institute page passes them), `mine` when it is in her profile. */
export type MyCourse = { degree: string; specialty: string; name: string; mine: boolean };
type Variant = Extract<FeeQuotaGroup["fee"], { display: "numbers" }>["variants"][number];

/** A course's fee for the whole course: its years added (a range: both ends); null when a year has no figure. */
function variantTotal(v: Variant, years: number) {
  const ys = v.per_year.slice(0, years);
  if (ys.length < years || ys.some((y) => !y)) return null;
  const lo = ys.reduce((n, y) => n + y!.amount, 0);
  const hi = ys.reduce((n, y) => n + (y!.amount_max ?? y!.amount), 0);
  return { amount: lo, amount_max: hi, currency: ys[0]!.currency };
}

/**
 * The fee per course (fee_variants): her courses' own in view (a column each, the years and the whole course down the
 * side, so it fits a phone); every course's behind "Fee of every course here" (a row each).
 */
function CourseFees({ rows, all, years, at, caption, nameOf }: { rows: { name: string; v: Variant }[]; all: Variant[]; years: number; at: At; caption: React.ReactNode; nameOf: (v: Variant) => string }) {
  const money = (x: Parameters<typeof feeMoney>[0] | null | undefined) => (x ? feeMoney(x) : <NotDeclared />);
  const yearNos = Array.from({ length: years }, (_, i) => i);
  const th = "py-2 text-left font-normal text-muted-foreground";
  const num = "numeric px-2 py-2 text-right whitespace-nowrap";
  return (
    <div className="grid min-w-0 gap-2">
      {rows.length > 0 && (
        <table className="w-full max-w-xl text-sm">
          <caption className="mb-1 text-left text-sm font-semibold">
            {rows.length === 1 ? "Your course's fee" : "Your courses' fees"}<span className="sr-only">, {caption}</span>
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-semibold">Year</th>
              {rows.map(({ name, v }) => <th key={name} scope="col" className="px-2 py-2 text-right font-semibold">{name}{at(v.src)}</th>)}
            </tr>
          </thead>
          <tbody>
            {yearNos.map((i) => (
              <tr key={i} className="border-b border-border">
                <th scope="row" className={th}>Year {i + 1}</th>
                {rows.map(({ name, v }) => <td key={name} className={`${num} font-semibold`}>{money(v.per_year[i])}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row" className={th}>Whole course</th>
              {rows.map(({ name, v }) => <td key={name} className={`${num} font-semibold`}>{money(variantTotal(v, years))}</td>)}
            </tr>
          </tbody>
        </table>
      )}
      <details className="min-w-0 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky">Fee of every course here ({all.length})</summary>
        <div className="overflow-x-auto">
          <table className="w-full max-w-xl text-sm">
            <caption className="sr-only">{caption}: the fee of every course here, by year and for the whole course</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-semibold">Course</th>
                {yearNos.map((i) => <th key={i} scope="col" className="px-2 py-2 text-right font-semibold">Year {i + 1}</th>)}
                <th scope="col" className="py-2 pl-2 text-right font-semibold">Whole course</th>
              </tr>
            </thead>
            <tbody>
              {all.map((v) => (
                <tr key={v.applies_to} className="border-b border-border">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">{nameOf(v)}{at(v.src)}</th>
                  {yearNos.map((i) => <td key={i} className={num}>{money(v.per_year[i])}</td>)}
                  <td className={`${num} font-semibold`}>{money(variantTotal(v, years))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/**
 * One seat-type group's fee and stipend by course year. fee.display "numbers": a year table of the figures; "verbatim"
 * (also a record without fee_display): only the profile's fee words and their link, never a figure, then the stipends.
 * NBEMS ceilings and floors are labelled, never the college's figure.
 */
function FeeGroup({ g, id, of, title, off, courses = [], exam }: { g: FeeQuotaGroup; id: string; of: string; title: string; off: number; courses?: MyCourse[]; exam?: ExamKey }) {
  const sources = groupSources(g, off);
  const at: At = (x) => <Sup n={x == null ? x : x + off} sources={sources} />;
  const n = g.fee.display === "numbers" ? g.fee : null;
  // A verbatim record's figures its words state for these seats: a fee column beside the words, each figure quoted.
  const p = g.fee.display === "verbatim" ? g.fee.parsed : null;
  const pYear = (i: number) => p?.per_year[i] ?? (i === 0 ? p?.at_admission : undefined);
  const feeCol = !!n || Array.from({ length: g.years }, (_, i) => pYear(i)).some(Boolean);
  // Each seat type as the exam's MCC words it (NEET MDS's paid seats; NEET PG's as they are).
  const shown = <>{g.groups.map((x, i) => <Fragment key={x}>{i > 0 && " + "}<QuotaName quota={x} /></Fragment>)} seats</>;
  const fees = n?.perYear ?? [];
  const st = g.stipendPerMonth;
  // Per-course figures (a deemed university's fee_variants): her courses' own, above the range over every course.
  const variants = n?.variants ?? [];
  const own = courses.flatMap((c) => {
    const v = c.mine && variantFor(variants, c.degree, c.specialty);
    return v ? [{ name: c.name, v }] : [];
  });
  // A course's name for its record words ("MDS CONSERVATIVEDENTISTRY"): the course here it is, else its words.
  const nameOf = (v: Variant) => courses.find((c) => variantFor([v], c.degree, c.specialty))?.name ?? v.applies_to;
  // ponytail: stipend words the export calls "(no figure)" but that hold figures (one record: "35000/mth / 37000/mth"),
  // read here only to compare them with the NBEMS minimum shown; the export should read them as declared figures.
  const words = g.stipendNote?.match(/^MCC profile stipend text \(no figure\): (.*)$/)?.[1];
  const said = words ? [...words.matchAll(/\b\d{4,6}\b/g)].map((m) => Number(m[0])) : [];
  const lower = st.some((s, i) => s?.minimum && said[i] != null && said[i] < s.inr);
  const cf = g.counsellingForfeit;
  const notes: React.ReactNode[] = [
    ...fees.map((f, i) => f?.note && <>Year {i + 1}: {f.note}{at(f.gst_src)}</>),
    n?.otherFees.length ? (
      <>
        Other fees:{" "}
        {n.otherFees.map((o, i) => (
          <span key={i}>
            {i > 0 && " · "}
            {o.name} {feeMoney(o)} ({[OTHER_KIND[o.kind], o.included_in_fee && "included in the fee", (o.years ?? (o.year ? [o.year] : [])).map((y) => `year ${y}`).join(", ")].filter(Boolean).join(", ")})
            {at(o.src)}
          </span>
        ))}
      </>
    ) : null,
    n?.includesHostel && HOSTEL_IN[n.includesHostel],
    ...(n?.notes ?? []).map((x) => x.replace(/\s*\(each course in fee_variants\)/, "")),
    (fees.some((f) => f?.maximum) || n?.wholeCourse?.maximum) && NBEMS_MAX,
    fees.some((f) => f?.above_nbems_ceiling) && "Above NBEMS maximum: the college declared more than NBEMS's maximum fee.",
    st.some((s) => s?.minimum) && (lower ? "NBEMS minimum: the hospital must pay at least this." : NBEMS_MIN),
    (lower || st.some((s) => s?.below_nbems_minimum)) && "Below NBEMS minimum: the college declared less than NBEMS's minimum stipend.",
    ...st.map((s, i) => s?.as_stated_per_year != null && `Stipend year ${i + 1}: stated as ${formatINR(s.as_stated_per_year)} a year, shown per month.`),
    [...new Set(st.flatMap((s) => (s?.basis ? [s.basis] : [])))].map((b) => `Stipend: ${b}.`).join(" ") || null,
    said.length ? `The MCC profile's stipend words: ${words}` : g.stipendNote,
    // INI-CET: AIIMS's counselling rules in their own words (never MCC's Round 2 labels).
    cf && authorityOf(exam) !== "MCC" && FORFEIT.some(([k]) => cf[k]) && (
      <>
        {authorityOf(exam)}&apos;s counselling rules:{" "}
        {FORFEIT.flatMap(([k]) => {
          const x = cf[k];
          return x ? [[x.inr != null ? formatINR(x.inr) : "", x.text].filter(Boolean).join(": ")] : [];
        }).join(" · ")}
        {at(cf.src)}
      </>
    ),
    cf && authorityOf(exam) === "MCC" && FORFEIT.some(([k]) => cf[k]) && (
      <>
        MCC counselling (the college&apos;s MCC form):{" "}
        {FORFEIT.flatMap(([k, label]) => {
          const x = cf[k];
          return x ? [`${x.inr != null ? formatINR(x.inr) : ""}${x.percent != null ? ` (${x.percent}%)` : ""} ${label}${x.text ? ` ("${x.text}")` : ""}`.trim()] : [];
        }).join(" · ")}
        {at(cf.src)}
      </>
    ),
    p?.per_year[0] && p.at_admission && <>At admission: {feeMoney(p.at_admission)} (from the profile&apos;s words){at(p.src)}</>,
    p?.annual_fee && <>Annual fee: {feeMoney(p.annual_fee)} a year (from the profile&apos;s words){at(p.src)}</>,
    p?.hostel && <>Hostel: {feeMoney(p.hostel)} {perOf[p.hostel.period]} (from the profile&apos;s words){at(p.src)}</>,
    p?.includes_hostel && (p.includes_hostel === "yes" ? "The profile says the fee includes hostel." : "The profile says the fee does not include hostel."),
    g.hostel && (g.hostel.male || g.hostel.female) && `Hostel (MCC profile): men ${g.hostel.male === "Y" ? "yes" : g.hostel.male === "N" ? "no" : "not published"}, women ${g.hostel.female === "Y" ? "yes" : g.hostel.female === "N" ? "no" : "not published"}.`,
    ...g.notes,
  ].filter(Boolean);
  return (
    <section aria-labelledby={`${id} ${of}`} className="grid content-start gap-2">
      <h4 id={id} className="text-sm font-semibold">
        {shown}
        {/* The MCC quotas, when the group covers more than its own (All India: also "IP University"). */}
        {g.quotas.length > g.groups.length && <span className="font-normal text-muted-foreground"> · {g.quotas.join(", ")}</span>}
      </h4>
      {!n && (
        <div className="grid gap-1 text-sm">
          <p className="text-xs text-muted-foreground">
            <ExamWords>{feeCol
              ? "Fee in the MCC profile's own words. The figures in the table are the ones these words state for these seats (each year, or at admission); a year they give no clear figure for is —."
              : "Fee in the MCC profile's own words: it is not one clearly labelled amount per year, so Seatora shows no fee figure here."}</ExamWords>
          </p>
          <FeeWords fee={g.fee} />
        </div>
      )}
      {variants.length > 0 && courses.length > 0 && <CourseFees rows={own} all={variants} years={g.years} at={at} caption={<>{title}, {shown}</>} nameOf={nameOf} />}
      <table className="w-full max-w-xl text-sm">
        <caption className="sr-only">{title}, {shown}: {feeCol ? "fee and stipend" : "stipend"} by year of the course</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-semibold">Year</th>
            {feeCol && <th scope="col" className="px-3 py-2 text-right font-semibold">{variants.length && courses.length ? "Fee that year, every course" : "Fee that year"}</th>}
            <th scope="col" className="py-2 pl-3 text-right font-semibold">Stipend per month</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: g.years }, (_, i) => (
            <tr key={i} className="border-b border-border">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">Year {i + 1}</th>
              {n && <td className="numeric px-3 py-2 text-right font-semibold"><FeeCell f={fees[i] ?? null} at={at} /></td>}
              {p && feeCol && <td className="numeric px-3 py-2 text-right font-semibold"><ParsedCell x={pYear(i)} adm={!p.per_year[i] && i === 0} at={at} src={p.src} /></td>}
              <td className="numeric py-2 pl-3 text-right font-semibold"><StipendCell s={st[i] ?? null} at={at} /></td>
            </tr>
          ))}
          {n?.wholeCourse && (
            <tr>
              <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">Whole course</th>
              <td className="numeric px-3 py-2 text-right font-semibold">
                <span className="whitespace-nowrap">{n.wholeCourse.maximum && "Up to "}{feeMoney(n.wholeCourse)} total ({g.years} yrs)</span>
              </td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      {notes.length > 0 && (
        <ul className="grid gap-1 text-xs text-muted-foreground">
          {notes.map((x, i) => <li key={i}>{typeof x === "string" ? <ExamWords>{x}</ExamWords> : x}</li>)}
        </ul>
      )}
      {n?.text && (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky"><ExamWords>{"The MCC profile's own fee words"}</ExamWords></summary>
          <div className="grid gap-1"><FeeWords fee={n} /></div>
        </details>
      )}
    </section>
  );
}

/** A programme's fee and stipend by year from its terms (no fee table for it), the whole-course fee and what is missing. */
function TermsYears({ t }: { t: ProgrammeTerms }) {
  const { sources } = t;
  const title = programmeTitle(t);
  const fee1 = t.years[0]?.fee;
  const anyFee = t.years.some((y) => y.fee);
  const anyStipend = t.years.some((y) => y.stipend);
  const minimum = t.years.some((y) => y.stipend?.kind === "minimum");
  // Fee and stipend words as published; the bond's and penalty's are in the bond box.
  const fee = t.unread.filter((u) => u.kind === "FEE" || u.kind === "STIPEND");
  return (
    <div className="grid content-start gap-2">
      <h4 className="text-sm font-semibold">Fee and stipend by year</h4>
      <table className="w-full max-w-xl text-sm">
        <caption className="sr-only">{title}: fee and stipend by year of the course</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-semibold">Year</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Fee that year</th>
            <th scope="col" className="py-2 pl-3 text-right font-semibold">Stipend per month</th>
          </tr>
        </thead>
        <tbody>
          {t.years.map((y) => (
            <tr key={y.year} className="border-b border-border">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">Year {y.year}</th>
              <td className="numeric px-3 py-2 text-right font-semibold"><Money f={y.fee} sources={sources} /></td>
              <td className="numeric py-2 pl-3 text-right font-semibold"><Money f={y.stipend} sources={sources} /></td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">Whole course</th>
            <td className="numeric px-3 py-2 text-right font-semibold">
              {t.wholeCourseFee != null ? (
                <>
                  {formatINR(t.wholeCourseFee)}
                  {fee1 && t.years.every((y) => y.fee?.inr === fee1.inr) && (
                    <span className="block text-xs font-normal text-muted-foreground">{formatINR(fee1.inr)} × {t.durationYears} years from one yearly figure; year-wise fees may differ</span>
                  )}
                </>
              ) : (
                <NotDeclared />
              )}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      {(t.durationYears === 2 || !anyFee || !anyStipend || t.feeNote || minimum || fee.length > 0 || t.notes.length > 0) && (
        <div className="grid gap-1 text-xs text-muted-foreground">
          {t.durationYears === 2 && <p>No year 3: a 2-year course.</p>}
          {t.notes.map((n) => <p key={n}>{n}</p>)}
          {!anyFee && !t.notes.length && !t.unread.some((u) => u.kind === "FEE") && <p>Fee: not published.</p>}
          {!anyStipend && !t.notes.length && <p>Stipend: not published.</p>}
          {t.feeNote && <p>Fee: {t.feeNote}.</p>}
          {minimum && <p>Minimum: the hospital must pay at least this; the actual pay may be higher. Later years are not declared.</p>}
          {fee.map((u) => (
            <p key={u.kind}>
              {termLabel[u.kind]} in the profile&apos;s words: {u.text}<Sup n={u.src} sources={sources} />
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One programme's fees, stipend and bond (college Fees tab): fees on the left (wide screens), the bond box on the right,
 * each figure's source a number in the page's "Sources (N)" footer (Sup). `groups` (the fee table, FeesStructured): one block per seat-type group; without
 * them (MCh, MPH, an import before the table) a year table from the programme's terms (a 2-year course has no year 3)
 * with the whole-course fee.
 */
export function FeesSection({ t: all, id, className, groups = [], courses }: { t: ProgrammeTerms; id: string; className?: string; groups?: FeeQuotaGroup[]; courses?: MyCourse[] }) {
  // Each group's sources, then the bond block's, kept apart (Sup finds a figure's document in its block's list).
  const offs = groups.reduce<number[]>((o, g, i) => [...o, o[i] + lastSource(g)], [0]);
  const t = groups.length ? bondBlock(all, offs[groups.length]) : all;
  const title = programmeTitle(t);
  return (
    <section aria-labelledby={id} className={cn("grid content-start gap-5", className)}>
      <h3 id={id} className="text-lg font-semibold">{title}</h3>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid min-w-0 content-start gap-6">
          {groups.length > 0 ? groups.map((g, i) => <FeeGroup key={g.quotaGroup} g={g} id={`${id}-g${i}`} of={id} title={title} off={offs[i]} courses={courses} exam={t.exam} />) : <TermsYears t={t} />}
        </div>
        <BondBox t={t} id={`${id}-bond`} of={id} />
      </div>
    </section>
  );
}

/** "2" or "2 years" says no more than the years shown; "1 year (extendable up to 2 more years)" does. */
const sameYears = (text: string, n: number | null) => n != null && text.replace(/\s*years?\.?$/i, "").trim() === String(n);

/**
 * The bond box: years · ₹ and who it applies to (or the record's "no bond", or why it is unknown), then leaving the
 * course after joining, other penalties and MCC's Round 2 forfeit, and the bond document's exact words.
 */
function BondBox({ t, id, of }: { t: ProgrammeTerms; id: string; of: string }) {
  const { bond, sources } = t;
  const declared = bond.status === "declared";
  const perYear = declared && bond.amount.perYear && bond.years ? bond.amount : null;
  const note = "block text-xs text-muted-foreground";
  const term = "text-xs font-semibold text-muted-foreground";
  return (
    <section aria-labelledby={`${id} ${of}`} className="grid min-w-0 content-start gap-4 rounded-lg border border-border bg-muted/30 p-4">
      <h4 id={id} className="text-sm font-semibold">{bond.toComplete ? "Bond to complete the course" : "Service bond"}</h4>
      <div className="text-sm">
        {declared ? (
          <>
            <p className="text-base">
              <span className="numeric font-semibold">{bondYears(bond)}</span>
              {" · "}
              <span className="numeric font-semibold">{bond.amounts.length ? partsText(bond.amounts) : (amountText(bond.amount, true) ?? "amount not published")}</span>
              <Sup n={bond.src} sources={sources} />
            </p>
            {bond.basis && bond.text && <span className={note}>{bond.text}</span>}
            {bond.basis === "state_rule" && <span className="block text-xs text-sun">From the state&apos;s rule (its order is the source), not the college&apos;s own bond document.</span>}
            {bond.yearsText && !sameYears(bond.yearsText, bond.years) && <span className={note}>Years as written: {bond.yearsText}</span>}
            {perYear && <span className={note}>{amountText(perYear, true)} for {bond.years} years (the per-year amount × the years).</span>}
            {bond.amount.varies && <span className="block text-xs text-sun">The amount varies by specialty: check the exact words below.</span>}
            {bond.otherAmounts && <span className={note}>Figures for other courses or quotas are in the exact words below.</span>}
          </>
        ) : bond.status === "none" ? (
          <>
            <p className="text-base"><span className="font-semibold">No bond</span> ({BASIS[bond.basis ?? "document"]})<Sup n={bond.src} sources={sources} /></p>
            {bond.text && <span className={note}>{bond.text}</span>}
            {bond.caveat && <span className="block text-xs text-sun">{bond.basis === "nbems_rule" ? `Seatora's check: ${bond.caveat}.` : `${bond.caveat}.`}</span>}
            {bond.basis === "nbems_rule" && <NbemsRules />}
          </>
        ) : noneDeclared(t) ? (
          // No bond declared: NBEMS's rule lets none be imposed this session (stat-format noneDeclared).
          <>
            <p className="text-base"><span className="font-semibold">{NONE_DECLARED}</span><Sup n={bond.src} sources={sources} /></p>
            <span className={note}>{noneDeclaredWhy(authorityOf(t.exam))}<NbemsRules /></span>
            {bond.text && <span className={note}>{bond.text}</span>}
          </>
        ) : (
          // Not known (the cells' word): why, in one plain line (a scan Seatora couldn't read, a blank form, nothing
          // declared, no record), then the record's own words and the rules that may still bind.
          <>
            <p className="text-base font-semibold">{NOT_KNOWN}</p>
            <p>{bondUnknownWhy(t)}{(bond.text || bond.status === "other_course") && bond.why !== "unread" && <Sup n={bond.src} sources={sources} />}</p>
            {bond.why === "unread" ? unreadWhy(bond.text) && <span className={note}>{unreadWhy(bond.text)}<Sup n={bond.src} sources={sources} /></span> : bond.text && bond.status !== "other_course" && <span className={note}>{bond.text}</span>}
            {isDnb(t) ? <span className={note}>{bond.text ? "NBEMS bond rules" : DNB_RULE}<NbemsRules /></span> : (!bond.text || bond.status === "other_course") && <span className={note}>{STATE_CAUTION}</span>}
          </>
        )}
        {bond.doc != null && <span className={note}>The college&apos;s own bond document{authorityOf(t.exam) === "MCC" && " on MCC"}<Sup n={bond.doc} sources={sources} /></span>}
      </div>
      {(declared || bond.appliesTo) && (
        <p className="text-sm">
          <span className={cn(term, "block")}>Applies to</span>
          {bond.appliesTo ? <>{bond.appliesTo}<Sup n={bond.src} sources={sources} /></> : <span className="text-muted-foreground">Not published in the bond record</span>}
        </p>
      )}
      <dl className="grid gap-3 border-t border-border pt-3 text-sm">
        <div>
          <dt className={term}>Leaving the course after joining</dt>
          <dd>{bond.leaving.length ? <Parts parts={bond.leaving} src={bond.src} sources={sources} /> : NOT_IN_DATA}</dd>
        </div>
        {bond.otherPenalties.length > 0 && (
          <div>
            <dt className={term}>Other penalties</dt>
            <dd><Parts parts={bond.otherPenalties} src={bond.src} sources={sources} /></dd>
          </div>
        )}
        {t.roundRules ? (
          // INI-CET: AIIMS's round rules (not joining an allotted seat, the Open Round's deposit, an Open Round seat after joining), each in its own words.
          <div>
            <dt className={term}>{authorityOf(t.exam)}&apos;s round rules</dt>
            <dd><Parts parts={t.roundRules} src={bond.src} sources={sources} /><span className={note}>From the counselling rules: separate from the leaving penalty.</span></dd>
          </div>
        ) : (
        <div>
          <dt className={term}>Resign or don&apos;t join from Round 2</dt>
          <dd>
            {t.resignForfeit ? <span className="numeric font-semibold">{formatINR(t.resignForfeit.inr)}<Sup n={t.resignForfeit.src} sources={sources} /></span>
              : t.resignForfeitText ? <>{t.resignForfeitText.text}<Sup n={t.resignForfeitText.src} sources={sources} /></>
              : NOT_IN_DATA}
            <span className={note}>What {authorityOf(t.exam)} lets the college keep if you resign or don&apos;t join from Round 2. Separate from the leaving penalty.</span>
          </dd>
        </div>
        )}
      </dl>
      {t.unread.filter((u) => u.kind === "BOND" || u.kind === "PENALTY").map((u) => (
        <p key={u.kind} className="text-xs text-muted-foreground">{termLabel[u.kind]} in the profile&apos;s words: {u.text}<Sup n={u.src} sources={sources} /></p>
      ))}
      {(bond.quote ?? bond.text) && (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky">{bond.quote ? (authorityOf(t.exam) === "MCC" ? "Exact words of the bond document" : "Exact words of the prospectus") : "Exact words of the bond summary"}</summary>
          <blockquote className="mt-1 border-l-2 border-border pl-3 text-muted-foreground">{bond.quote ?? bond.text}</blockquote>
        </details>
      )}
    </section>
  );
}

/**
 * The bond and penalty block of a programme shown with its fee groups: only the sources it cites (the fee figures' are
 * the groups'), numbered on from `off`.
 */
function bondBlock(t: ProgrammeTerms, off: number): ProgrammeTerms {
  const b = t.bond;
  const unread = t.unread.filter((u) => u.kind === "BOND" || u.kind === "PENALTY");
  const cited = new Set([b.src, b.doc, t.resignForfeit?.src, t.resignForfeitText?.src, ...[...b.amounts, ...b.leaving, ...b.otherPenalties, ...(t.roundRules ?? [])].map((p) => p.src), ...unread.map((u) => u.src)]);
  const kept = t.sources.filter((s) => cited.has(s.n));
  const to = new Map(kept.map((s, i) => [s.n, off + i + 1]));
  const re = (n: number) => to.get(n)!;
  const part = (p: TermPart) => (p.src == null ? p : { ...p, src: re(p.src) });
  return {
    ...t,
    bond: { ...b, src: b.src && re(b.src), doc: b.doc && re(b.doc), amounts: b.amounts.map(part), leaving: b.leaving.map(part), otherPenalties: b.otherPenalties.map(part) },
    resignForfeit: t.resignForfeit && { ...t.resignForfeit, src: re(t.resignForfeit.src) },
    resignForfeitText: t.resignForfeitText && { ...t.resignForfeitText, src: re(t.resignForfeitText.src) },
    ...(t.roundRules && { roundRules: t.roundRules.map(part) }),
    unread: unread.map((u) => ({ ...u, src: re(u.src) })),
    sources: kept.map((s) => ({ ...s, n: re(s.n) })),
  };
}

/** A programme's numbered source documents (the numbers its figures carry), each with its trust tier and link. */
export function TermSources({ t, label }: { t: ProgrammeTerms; label?: string }) {
  return <SourceList sources={t.sources} label={label ?? `Sources, ${programmeTitle(t)}`} />;
}

function SourceList({ sources, label }: { sources: TermSource[]; label: string }) {
  if (!sources.length) return null;
  return (
    <ol aria-label={label} className="grid gap-1 text-xs text-muted-foreground">
      {sources.map((s) => (
        <li key={s.n}>
          <span className="numeric mr-1.5 font-semibold">{s.n}</span>
          <Badge tone={sourceTypeLabels[s.type].tone} className="mr-1.5">{sourceTypeLabels[s.type].text}</Badge>
          {s.label}{s.year ? `, ${s.year}` : ""}{idOf(s) && <> · MCC profile <span className="numeric">{idOf(s)}</span></>}{" "}
          {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className={smallLink}>open<span className="sr-only"> {srcName(s)} (opens in a new tab)</span></a>}
        </li>
      ))}
    </ol>
  );
}

