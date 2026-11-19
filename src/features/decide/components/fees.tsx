import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { sourceTypeLabels } from "@/components/ui/source-label";
import { formatINR } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { fmtDay, formatInrShort } from "../lib/format";
import type { FeeQuotaGroup } from "../server/facts";
import type { Amount, Figure, ProgrammeTerms, TermPart, TermSource } from "../server/terms";
import { termLabel } from "../types";
import { SourceRef } from "./page-sources";
import { smallLink } from "./ui";
import { QuotaName } from "./round-name";

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
// No bond record for the programme at all (the bundle has one for every college and programme with allotments).
const NOT_CHECKED = "Not checked yet: Seatora has no bond record for this programme.";
const DNB_NO_BOND = `${NOT_CHECKED} NBEMS rule: private DNB hospitals may not take any bond or deposit; government hospitals may apply a state service bond only if they declared it to MCC before counselling.`;
const MD_NO_BOND = `${NOT_CHECKED} Government colleges may still have a state service bond: check the state's PG rules.`;
const STATE_CAUTION = "Government colleges may still have a state service bond: check the state's PG rules.";
const NOT_IN_DATA = "Not published";

/** "—" with "not in our MCC data" for screen readers: missing is never 0 and never "no bond". */
export function NotDeclared({ what = "not in our MCC data" }: { what?: string }) {
  return <span>—<span className="sr-only">{what}</span></span>;
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
    a.varies ? "varies by specialty" : null,
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
const bondYears = (b: ProgrammeTerms["bond"]) => (b.years == null ? "Years not stated" : b.yearsSum ? `${b.yearsSum} = ${years(b.years)}` : years(b.years));
const BASIS: Record<NonNullable<ProgrammeTerms["bond"]["basis"]>, string> = { document: "the college's own document", state_rule: "state rule", nbems_rule: "NBEMS rule" };

const otherCourse = (t: ProgrammeTerms) => `Not published for ${t.programme}: the bond on the college's MCC profile is for other courses (its exact words are below).`;

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
  if (!f) return <NotDeclared what="not stated" />;
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
  if (!x) return <NotDeclared what="not stated" />;
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
  if (!s) return <NotDeclared what="not stated" />;
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
      {fee.text ? <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{fee.text}</blockquote> : <p className="text-muted-foreground">The MCC profile gives no fee in words for these seats.</p>}
      {fee.src && (
        <a href={fee.src.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-xs text-sky`}>
          MCC institute profile, read <span className="numeric ml-1">{fmtDay(fee.src.date)}</span><span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </>
  );
}

/**
 * One seat-type group's fee and stipend by course year. fee.display "numbers": a year table of the figures; "verbatim"
 * (also a record without fee_display): only the profile's fee words and their link, never a figure, then the stipends.
 * NBEMS ceilings and floors are labelled, never the college's figure.
 */
function FeeGroup({ g, id, of, title, off }: { g: FeeQuotaGroup; id: string; of: string; title: string; off: number }) {
  const sources = groupSources(g, off);
  const at: At = (x) => <Sup n={x == null ? x : x + off} sources={sources} />;
  const n = g.fee.display === "numbers" ? g.fee : null;
  // A verbatim record's figures its words state for these seats: a fee column beside the words, each figure quoted.
  const p = g.fee.display === "verbatim" ? g.fee.parsed : null;
  const pYear = (i: number) => p?.per_year[i] ?? (i === 0 ? p?.at_admission : undefined);
  const feeCol = !!n || Array.from({ length: g.years }, (_, i) => pYear(i)).some(Boolean);
  const name = `${g.groups.join(" + ")} seats`;
  // Shown as the exam's MCC words each seat type (NEET MDS's paid seats); the caption keeps the plain words.
  const shown = <>{g.groups.map((x, i) => <Fragment key={x}>{i > 0 && " + "}<QuotaName quota={x} /></Fragment>)} seats</>;
  const fees = n?.perYear ?? [];
  const st = g.stipendPerMonth;
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
    ...(n?.notes ?? []),
    (fees.some((f) => f?.maximum) || n?.wholeCourse?.maximum) && NBEMS_MAX,
    fees.some((f) => f?.above_nbems_ceiling) && "Above NBEMS maximum: the college declared more than NBEMS's maximum fee.",
    st.some((s) => s?.minimum) && (lower ? "NBEMS minimum: the hospital must pay at least this." : NBEMS_MIN),
    (lower || st.some((s) => s?.below_nbems_minimum)) && "Below NBEMS minimum: the college declared less than NBEMS's minimum stipend.",
    ...st.map((s, i) => s?.as_stated_per_year != null && `Stipend year ${i + 1}: stated as ${formatINR(s.as_stated_per_year)} a year, shown per month.`),
    [...new Set(st.flatMap((s) => (s?.basis ? [s.basis] : [])))].map((b) => `Stipend: ${b}.`).join(" ") || null,
    said.length ? `The MCC profile's stipend words: ${words}` : g.stipendNote,
    cf && FORFEIT.some(([k]) => cf[k]) && (
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
    g.hostel && (g.hostel.male || g.hostel.female) && `Hostel (MCC profile): men ${g.hostel.male === "Y" ? "yes" : g.hostel.male === "N" ? "no" : "not stated"}, women ${g.hostel.female === "Y" ? "yes" : g.hostel.female === "N" ? "no" : "not stated"}.`,
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
            {feeCol
              ? "Fee in the MCC profile's own words. The figures in the table are the ones these words state for these seats (each year, or at admission); a year they give no clear figure for is —."
              : "Fee in the MCC profile's own words: it is not one clearly labelled amount per year, so Seatora shows no fee figure here."}
          </p>
          <FeeWords fee={g.fee} />
        </div>
      )}
      <table className="w-full max-w-xl text-sm">
        <caption className="sr-only">{title}, {name}: {feeCol ? "fee and stipend" : "stipend"} by year of the course</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-semibold">Year</th>
            {feeCol && <th scope="col" className="px-3 py-2 text-right font-semibold">Fee that year</th>}
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
          {notes.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
      {n?.text && (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky">The MCC profile&apos;s own fee words</summary>
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
export function FeesSection({ t: all, id, className, groups = [] }: { t: ProgrammeTerms; id: string; className?: string; groups?: FeeQuotaGroup[] }) {
  // Each group's sources, then the bond block's, kept apart (Sup finds a figure's document in its block's list).
  const offs = groups.reduce<number[]>((o, g, i) => [...o, o[i] + lastSource(g)], [0]);
  const t = groups.length ? bondBlock(all, offs[groups.length]) : all;
  const title = programmeTitle(t);
  return (
    <section aria-labelledby={id} className={cn("grid content-start gap-5", className)}>
      <h3 id={id} className="text-lg font-semibold">{title}</h3>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid min-w-0 content-start gap-6">
          {groups.length > 0 ? groups.map((g, i) => <FeeGroup key={g.quotaGroup} g={g} id={`${id}-g${i}`} of={id} title={title} off={offs[i]} />) : <TermsYears t={t} />}
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
      <h4 id={id} className="text-sm font-semibold">Service bond</h4>
      <div className="text-sm">
        {declared ? (
          <>
            <p className="text-base">
              <span className="numeric font-semibold">{bondYears(bond)}</span>
              {" · "}
              <span className="numeric font-semibold">{bond.amounts.length ? partsText(bond.amounts) : (amountText(bond.amount, true) ?? "amount not stated")}</span>
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
        ) : bond.status === "other_course" ? (
          <p>{otherCourse(t)}<Sup n={bond.src} sources={sources} />{isDnb(t) ? <NbemsRules /> : ` ${STATE_CAUTION}`}</p>
        ) : bond.text ? (
          // The record's status is unknown: its words say why (not checked yet, not declared on MCC, no clear terms).
          <p>{bond.text}<Sup n={bond.src} sources={sources} />{isDnb(t) && <NbemsRules />}</p>
        ) : isDnb(t) ? (
          <p>{DNB_NO_BOND} <NbemsRules /></p>
        ) : (
          <p>{MD_NO_BOND}</p>
        )}
        {bond.doc != null && <span className={note}>The college&apos;s own bond document on MCC<Sup n={bond.doc} sources={sources} /></span>}
      </div>
      {(declared || bond.appliesTo) && (
        <p className="text-sm">
          <span className={cn(term, "block")}>Applies to</span>
          {bond.appliesTo ? <>{bond.appliesTo}<Sup n={bond.src} sources={sources} /></> : <span className="text-muted-foreground">Not stated in the bond record</span>}
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
        <div>
          <dt className={term}>Resign or don&apos;t join from Round 2</dt>
          <dd>
            {t.resignForfeit ? <span className="numeric font-semibold">{formatINR(t.resignForfeit.inr)}<Sup n={t.resignForfeit.src} sources={sources} /></span>
              : t.resignForfeitText ? <>{t.resignForfeitText.text}<Sup n={t.resignForfeitText.src} sources={sources} /></>
              : NOT_IN_DATA}
            <span className={note}>What MCC lets the college keep if you resign or don&apos;t join from Round 2. Separate from the leaving penalty.</span>
          </dd>
        </div>
      </dl>
      {t.unread.filter((u) => u.kind === "BOND" || u.kind === "PENALTY").map((u) => (
        <p key={u.kind} className="text-xs text-muted-foreground">{termLabel[u.kind]} in the profile&apos;s words: {u.text}<Sup n={u.src} sources={sources} /></p>
      ))}
      {(bond.quote ?? bond.text) && (
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sky">{bond.quote ? "Exact words of the bond document" : "Exact words of the bond summary"}</summary>
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
  const cited = new Set([b.src, b.doc, t.resignForfeit?.src, t.resignForfeitText?.src, ...[...b.amounts, ...b.leaving, ...b.otherPenalties].map((p) => p.src), ...unread.map((u) => u.src)]);
  const kept = t.sources.filter((s) => cited.has(s.n));
  const to = new Map(kept.map((s, i) => [s.n, off + i + 1]));
  const re = (n: number) => to.get(n)!;
  const part = (p: TermPart) => (p.src == null ? p : { ...p, src: re(p.src) });
  return {
    ...t,
    bond: { ...b, src: b.src && re(b.src), doc: b.doc && re(b.doc), amounts: b.amounts.map(part), leaving: b.leaving.map(part), otherPenalties: b.otherPenalties.map(part) },
    resignForfeit: t.resignForfeit && { ...t.resignForfeit, src: re(t.resignForfeit.src) },
    resignForfeitText: t.resignForfeitText && { ...t.resignForfeitText, src: re(t.resignForfeitText.src) },
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

