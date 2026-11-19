import "server-only";
import { formatINR } from "@/features/cutoffs/lib/format";
import { seatGroups, termSourceName, type BondDetails, type PenaltyDetails } from "@/features/cutoffs/lib/import-schema";
import { DEFAULT_EXAM, type ExamKey } from "@/features/exams/keys";
import { variantFor } from "../lib/specialty-search";
import type { Catalog } from "./catalog";
import type { SourceType } from "@/types/provenance";
import type { FeeTableRecord, Term } from "../types";

// The ONE place that reads fee, stipend, bond and penalty terms (CollegeTerm) into numbers. The UI only renders
// ProgrammeTerms. BOND and PENALTY come from their verified record (`details`: status, amounts, by course and subject,
// penalty items; the importer requires it); FEE and STIPEND from their fee-table records (bundle schema 2, FeesStructured:
// the catalog attaches them), else (an older import) their texts, read with regexes over the export's text shapes.

/**
 * Programmes, by degree. "MD" terms cover MD/MS, Diploma, MCh and MPH; "DNB" terms cover DNB and NBEMS Diploma.
 * `figures: false`: the bucket's fee and stipend are the college's MD/MS figures, never copied to this course.
 */
export const programmes = {
  "MD/MS": { slug: "mdms", bucket: "MD", years: 3, kind: "degree", figures: true },
  Diploma: { slug: "diploma", bucket: "MD", years: 2, kind: "diploma", figures: true },
  DNB: { slug: "dnb", bucket: "DNB", years: 3, kind: "degree", figures: true },
  "NBEMS Diploma": { slug: "nbems-diploma", bucket: "DNB", years: 2, kind: "diploma", figures: true },
  // The MCh and MPH taken through NEET PG: 6-year (direct) MCh, 2-year MPH (course lengths, not from the terms).
  MCh: { slug: "mch", bucket: "MD", years: 6, kind: "super", figures: false },
  MPH: { slug: "mph", bucket: "MD", years: 2, kind: "degree", figures: false },
  // NEET MDS and NEET SS (their bundles' fee tables, MCC's institute profiles): MDS (and its PG Diploma), D.M. / M.Ch., DrNB.
  MDS: { slug: "mds", bucket: "MD", years: 3, kind: "degree", figures: true },
  "DM/MCh": { slug: "dm-mch", bucket: "MD", years: 3, kind: "super", figures: true },
  "DrNB SS": { slug: "drnb-ss", bucket: "DNB", years: 3, kind: "super", figures: true },
} as const;
export type Programme = keyof typeof programmes;
export const programmeNames = Object.keys(programmes) as Programme[];
/** The programmes an exam's courses can be: the Fees page offers only these. */
export const examProgrammes = (exam: ExamKey): Programme[] =>
  exam === "neet-mds" ? ["MDS"] : exam === "neet-ss" ? ["DM/MCh", "DrNB SS"] : ["MD/MS", "Diploma", "DNB", "NBEMS Diploma", "MCh", "MPH"];

/** A course's programme. NEET MDS: every course is MDS's; NEET SS: D.M. and M.Ch. one, DrNB the other (NEET PG's 6-year MCh is its own). */
export function programmeOfDegree(degree: string, exam: ExamKey = DEFAULT_EXAM): Programme {
  if (exam === "neet-mds") return "MDS";
  if (exam === "neet-ss") return degree === "DrNB" ? "DrNB SS" : "DM/MCh";
  if (degree === "MD" || degree === "MS") return "MD/MS";
  if (degree === "DrNB") return "DNB";
  return degree in programmes ? (degree as Programme) : /^(DNB|NBEMS)/.test(degree) ? "DNB" : "MD/MS";
}
/** The term bucket a course reads: MD/MS, Diploma, MCh, MPH → "MD"; DNB, DrNB, NBEMS Diploma → "DNB". Never the other one. */
export const bucketOfDegree = (degree: string): Term["program"] => programmes[programmeOfDegree(degree)].bucket;

/**
 * declared: the college's own figure; maximum: the NBEMS DNB course fee ceiling (the most a DNB hospital may charge, no
 * GST, paid to the hospital), shown where the hospital declared none, never the college's figure; minimum: NBEMS floor
 * (actual may be higher); nmc: NMC stipend list (one PG figure, not split by year).
 */
export type FigureKind = "declared" | "maximum" | "minimum" | "nmc" | "published";
/**
 * `src`: number of the source in ProgrammeTerms.sources. `min`: a range (by subject): `inr` is its highest figure.
 * `atAdmission`: the profile's amount paid at admission (year 1), not an annual fee. `above` / `below`: a declared fee
 * above the NBEMS maximum, a declared stipend below the NBEMS minimum. `plusDa`: declared as this plus DA. `note`: the
 * record's words on how the figure was read (a GST taken off), citing `noteSrc`. `declared`: the college's own figure when
 * `inr` is Seatora's reading of it (GST taken off). `nbems`: the NBEMS minimum a `below` stipend is under, with its source.
 */
export type Figure = {
  inr: number; kind: FigureKind; src: number; min?: number; atAdmission?: true; above?: true; below?: true; plusDa?: true; note?: string; noteSrc?: number;
  declared?: number; nbems?: { inr: number; src: number };
  /** Another exam: the record prices some subjects apart and this course isn't one of them, so it may differ ("may vary by subject"). */
  varies?: true;
  /**
   * Read out of the MCC profile's own fee words (fee_parsed, a verbatim record): `quote` the exact words it stands in,
   * `field` the form field ("Year 2", "Annual fees"). The words stay one tap away ("see text").
   */
  fromText?: { quote: string; field?: string };
};
/** A hostel fee the record states: a year, a month, or (period null) as the record gives it; `included`: part of the year figures. */
export type HostelFee = { inr: number; period: "per_year" | "per_month" | null; src: number; included?: true; quote?: string };
/**
 * `mccId`: the MCC institute profile the figure was read from. `sharedBy`: how many institutes in our data cite that
 * profile (more than 1: it may be another institute's).
 */
export type TermSource = { n: number; label: string; url: string | null; year: number | null; mccId: string | null; sharedBy: number; type: SourceType };
/**
 * One row of a bond or penalty record as words (`text`: its figure and who it is for, or the source's words when it has
 * no ₹ figure), with its rupee figure and who it is for: degree (MD/MS/DNB), diploma, super (super-speciality), inservice, all.
 */
export type TermPart = {
  text: string;
  inr: number | null;
  group: Group;
  /** Its source, when not the bond's (a penalty item). */
  src?: number;
  /** Owed on top of the others ("lapse of the PG seat (additional)"), not instead of them. */
  extra?: boolean;
  /** From the state rule beside the college's document (the rule gives the years too), not the document. */
  rule?: true;
};
type Group = "degree" | "diploma" | "super" | "inservice" | "all";

/**
 * A bond or leaving amount for one programme. figure: `min`–`max` in ₹ (a range when it depends on course type);
 * words: declared without a ₹ figure (the exact words say what); none: not declared. `perYear`: the published amount is
 * per defaulting year, so min/max are it × the bond years (computed). `varies`: the record prices it by specialty
 * (min–max over it). `more`: some rows have no ₹ figure (in words only). `extra`: owed on top (an "additional" penalty
 * item), included in `max`. `formula`: Seatora computed min/max from the record's own words over this row's figures
 * (FORMULA below): `text` says how; `bound` upTo: at most it (a balance, a stipend received by the date of leaving, an
 * NBEMS fee maximum), atLeast: at least it (an NBEMS minimum stipend, "+ DA").
 */
export type Amount = {
  state: "figure" | "words" | "none"; min: number | null; max: number | null; perYear: number | null; varies: boolean; more: boolean; extra: number | null;
  formula?: Formula;
};
/**
 * `words`: the record's own words it reads. `text`: how Seatora computed it, or why it could not. `label`: the short
 * phrase a cell shows when there is no number ("Refund stipend", "Rest of course fee"); absent when computed.
 */
export type Formula = { text: string; bound: "upTo" | "atLeast" | null; words: string[]; label?: string };

export type Bond = {
  /**
   * declared: a bond applies (the college's document, or a state rule: `basis`); none: no bond (the college's document,
   * or the NBEMS rule for private DNB hospitals); not_declared: no bond term, or one whose status is unknown (`text` says
   * why: not checked, not declared on MCC, no clear terms; or, with `caveat`, a no-bond document adding that a state
   * law's service may apply); other_course: the record's bond is for other courses only (an MCh reading a record for PG seats).
   */
  status: "declared" | "none" | "not_declared" | "other_course";
  /**
   * Why a not_declared bond has no answer, where the record says (NEET SS / MDS records; NEET PG's never carry it):
   * unread, MCC lists a bond document Seatora has not read; unclear, read, and no clear service bond in it.
   */
  why?: "unread" | "unclear";
  /** What says so (verified records only): the college's own document (or an official prospectus), a state rule, or the NBEMS rule. */
  basis: "document" | "state_rule" | "nbems_rule" | null;
  /** The college's own document says no bond (or a bond), and a state rule also covers the seat: its summary. */
  stateRule: string | null;
  /** The years are the state rule's (`stateRule`), not the college's own document's. */
  yearsFrom?: "state_rule";
  /** Years of service for this programme (All India figure first; added up where the record joins them, `yearsSum`); 0 = no bond; null when not stated. */
  years: number | null;
  /** The years added up, as "1 + 3" (Karnataka: compulsory service + the undertaking); null when one figure. */
  yearsSum: string | null;
  /** The years as published, e.g. "1 year (extendable up to 2 more years)". */
  yearsText: string | null;
  /** The amounts that apply to this programme; empty when none is stated for it. */
  amounts: TermPart[];
  /** True when the record also has amounts for other courses or quotas (left out of `amounts`). */
  otherAmounts: boolean;
  amount: Amount;
  /** The college or state penalty for leaving the seat or course after joining, not MCC's Round 2 forfeit. */
  leaving: TermPart[];
  leavingAmount: Amount;
  /** Other penalties of the record (an admission ban, a stipend refund…), as words with any ₹ figure. */
  otherPenalties: TermPart[];
  appliesTo: string | null;
  /** The record's summary to show (who it binds, the state rule and its order, why it is unknown). */
  text: string | null;
  /** The bond document's own words, where the record quotes them. */
  quote: string | null;
  /** What the record says it is unsure of beside "no bond": a private status inferred from the name (none), a state law's service that may apply (not_declared). */
  caveat: string | null;
  src: number | null;
  /** The college's own MCC document a status stands over or that has no clear terms (`details.doc_url`), when not `src`. */
  doc: number | null;
};

export type ProgrammeTerms = {
  programme: Programme;
  durationYears: number;
  /** One row per year of the course: a 2-year course has no year 3. null: not stated for that year. */
  years: { year: number; fee: Figure | null; stipend: Figure | null }[];
  /** Words beside the fee figure, e.g. "tuition by subject" (older imports' fee texts). */
  feeNote: string | null;
  /**
   * The whole course's fee, only when every year's is stated: the fee table's (an NBEMS maximum when the years are), or
   * (an older import) one yearly figure × the years, computed.
   */
  wholeCourseFee: number | null;
  bond: Bond;
  /** MCC profile: what is forfeited if you resign or don't join from Round 2 (PENALTY, else the fee table). Not the leaving penalty. */
  resignForfeit: Figure | null;
  /** That forfeit when the PENALTY record gives it in words only (no ₹ figure): never the leaving penalty. */
  resignForfeitText?: { text: string; src: number } | null;
  /** The hostel fee, where the fee record states one (a numbers record's one hostel head, or a verbatim record's words). */
  hostelFee: HostelFee | null;
  /** Read out of the fee words beside the year figures: the amount at admission and the annual fee, when they differ from them. */
  feeExtras: { label: "At admission" | "Annual fee"; f: Figure }[];
  /** A term whose shape isn't read: shown as published. Also a bond or penalty without its record (an import older than the records). */
  unread: { kind: Term["kind"]; text: string; src: number }[];
  /** Plain sentences about figures left out for this programme. */
  notes: string[];
  /** The page the notes are about (the MCC profile read for a fee's words), when known. */
  notesSrc?: number;
  sources: TermSource[];
  /** The college's website as declared on its MCC profile (a fee in words pointing to it links it). */
  website?: string | null;
};

export type Quality = "full" | "partial" | "none";

// ---------- text helpers ----------

const toInr = (n: string, unit: string | undefined) => {
  const v = Number(n.replace(/,/g, ""));
  const u = unit?.toLowerCase();
  return Math.round(u === "crore" || u === "cr" ? v * 1e7 : u === "lakh" || u === "l" ? v * 1e5 : v);
};

/** Who a record row is for, from its label. DNB and DrNB are degrees; "NBEMS Diploma" (or "DNB Diploma") the diploma. */
export function groupOf(s: string): Group {
  const t = s.toLowerCase();
  // Not "non-WB-in-service", "other than WB-sponsored in-service doctors".
  if (/\bin-service\b/.test(t) && !/(?:\bnon[- ]|\bother than )(?:[a-z]+-)?(?:[a-z]+ )?in-service/.test(t)) return "inservice";
  // "All PG (MD/MS/DM/MCh)", "PG Diploma/DNB/…/DM/MCh": PG seats too.
  if (/super[- ]?speciali|\bdm\b|\bmch\b/.test(t)) return /\b(md|ms|pg|dnb|drnb)\b|diploma|degree/.test(t) ? "all" : "super";
  // "PG (MD/MS/Diploma)", "PG diploma/degree", "DNB/Diploma", "DNB, NBEMS Diploma": both; "PG diploma / MDS", "NBEMS Diploma": the diploma's.
  if (/diploma/.test(t)) return /\b(md|ms)\b|degree|\b(dnb|drnb)\b(?!\s*diploma)/.test(t) ? "all" : "diploma";
  if (/degree|clinical|\b(pg|md|ms|dnb|drnb)\b|post doctoral/.test(t)) return "degree";
  return "all";
}

type Kind = (typeof programmes)[Programme]["kind"];
/**
 * The parts that apply to a programme kind: its own group if the text names one, else degree + all (super-speciality:
 * all only). Never in-service-only parts.
 */
function forKind<T extends { group: Group }>(parts: T[], kind: Kind): T[] {
  const own = kind === "degree" ? [] : parts.filter((p) => p.group === kind);
  const keep: Group[] = own.length ? [kind, "all"] : kind === "super" ? ["all"] : ["degree", "all"];
  return parts.filter((p) => keep.includes(p.group));
}
/** MCC counselling is All India: when parts are labelled AIQ, the state-quota ones are left out ("₹10 L (AIQ); ₹15 L (state fresh candidates)"). */
const AIQ = /\bAIQ\b|all india/i;
const aiqFirst = <T extends { text: string }>(ps: T[]) => (ps.some((p) => AIQ.test(p.text)) ? ps.filter((p) => AIQ.test(p.text) || !/\bstate\b/i.test(p.text)) : ps);

const PER_YEAR = /per (?:defaulting |unserved )?year/i;
const BY_SPECIALTY = /by specialt?y|by speciality|subject-wise/i;
const NONE: Amount = { state: "none", min: null, max: null, perYear: null, varies: false, more: false, extra: null };
/**
 * One programme's amount over its parts. `years`: the bond years, for "per defaulting year" amounts (null: never
 * multiplied). Parts owed on top (`extra`) add to the highest of the others.
 */
function amountOf(parts: TermPart[], years: number | null): Amount {
  if (!parts.length) return NONE;
  const base = parts.some((p) => !p.extra) ? parts.filter((p) => !p.extra) : parts;
  const extra = base === parts ? 0 : parts.reduce((s, p) => s + (p.extra ? (p.inr ?? 0) : 0), 0);
  const per = years != null ? base.find((p) => p.inr != null && PER_YEAR.test(p.text)) : undefined;
  // Priced by specialty, or by clinical vs pre/para-clinical subject (a course in neither list keeps the range).
  const varies = parts.some((p) => BY_SPECIALTY.test(p.text)) || ofGroup(parts, "clinical") != null;
  const xs = base.flatMap((p) => (p.inr == null ? [] : [p === per ? p.inr * years! : p.inr]));
  return {
    state: xs.length ? "figure" : "words",
    min: xs.length ? Math.min(...xs) : null,
    max: xs.length ? Math.max(...xs) + extra : null,
    perYear: per?.inr ?? null,
    varies,
    more: parts.some((p) => p.inr == null),
    extra: xs.length && extra ? extra : null,
  };
}

// ---------- formulas ----------

/**
 * A bond or leaving amount the record gives as a formula over figures this row holds, only from its explicit words:
 * "refund 3 years' stipend" (₹/month × 12, years 1..3), "stipend received" (every year's), "N months' stipend" (year 1's),
 * "double the stipend", "balance / entire / remaining course fee(s) / tuition" (every year's fee), "N years' fee", plus a ₹
 * figure joined with "+" / "plus". A part Seatora cannot price (a blank sum, interest, a share, a guarantee) or a figure it
 * lacks: no number, a label saying what it is. A sum already paid ("fees paid forfeited") is not owed again.
 */
const NUMS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, twelve: 12 };
const num = (s: string) => NUMS[s.toLowerCase()] ?? Number(s);
const UNPRICED = /book grant|discontinuation fee|bank guarantee[^.;]*redeem|invoke the bank guarantee|security cheque|interest|\d+\s?%|amount spent|left blank|\betc\b|as applicable|\bas per\b|per the policy/i;
const PAID = /\b(?:first-year |entire )?fees? (?:paid|collected)(?: at admission)?(?: (?:forfeited|not refunded))?|\bfirst-year fee (?:forfeited|not refunded)/gi;
const FEE_WORD = /\b(?:fees?|tuition)\b/i;
const WHOLE = /\b(?:entire|whole|full|complete)\b/i;
const REST = /\b(?:balance|remaining|rest of)\b/i;
const N_YEARS_FEE = /\b(one|two|three|\d) years?'? (?:tuition )?fees?\b/i;
const STIPEND = /\bstipend/i;
const PAY_BACK = /refund|repay|return|pay back|received|drawn|double|twice/i;
const N_YEARS_ST = /\b(one|two|three|four|five|\d) years?'? stipend/i;
const N_MONTHS_ST = /\b(one|two|three|four|five|six|twelve|\d+) months?'? stipend/i;
const DOUBLE = /\b(?:double|twice)\b/i;
const RUPEES = /(?:₹|\bRs\.?)\s?(\d[\d,]*(?:\.\d+)?)\s*(lakh|crore|L\b|Cr\b)?/gi;
/** A clause about leaving the seat or course (a bond's own words keep only the not-serving ones). */
const LEAVING_WORDS = /\bleav|discontinu|\bquit|resign|withdraw|abandon|mid-?way|lapse/i;

type Years = ProgrammeTerms["years"];
type Part = { inr: number; text: string; bound: Formula["bound"]; why?: string };
/** Years 1..n of a fee (a year) or stipend (₹/month × 12), each stated; null when one is not (or a sum at admission). */
function sumOf(years: Years, pick: "fee" | "stipend", n: number, label: string): Part | null {
  if (n < 1 || n > years.length) return null;
  const fs = years.slice(0, n).map((y) => y[pick]);
  if (fs.some((f) => !f || f.atAdmission)) return null;
  const xs = fs as Figure[];
  const unit = pick === "stipend" ? 12 : 1;
  const inr = xs.reduce((s, f) => s + f.inr * unit, 0);
  const same = xs.every((f) => f.inr === xs[0].inr);
  const each = pick === "stipend" ? (same ? `${formatINR(xs[0].inr)} a month × ${12 * n} months` : `(${xs.map((f) => formatINR(f.inr)).join(" + ")}) a month × 12`) : same && n > 1 ? `${formatINR(xs[0].inr)} a year × ${n} years` : xs.map((f) => formatINR(f.inr)).join(" + ");
  const max = xs.some((f) => f.kind === "maximum" || f.min != null);
  const min = xs.some((f) => f.kind === "minimum" || f.plusDa);
  const why = max ? (xs.some((f) => f.kind === "maximum") ? "the fee is the NBEMS maximum" : "the figure is a range's highest") : min ? (xs.some((f) => f.kind === "minimum") ? "the stipend is the NBEMS minimum" : "the stipend is plus DA") : undefined;
  return { inr, text: `${label}: ${each} = ${formatINR(inr)}`, bound: max ? "upTo" : min ? "atLeast" : null, why };
}

/** One clause: a computed part list, `words` (a formula Seatora cannot price: `label` says what), or null (no formula). */
function clauseFormula(clause: string, years: Years, leaving: boolean): { parts: Part[] } | { label: string; why: string } | null {
  const c = clause.replace(PAID, "");
  // "the lesser of the stipend paid or ₹5 lakh": the figure is the most, no formula on top.
  if (/\blesser\b|whichever is (?:less|lower)/i.test(c)) return null;
  const nFee = c.match(N_YEARS_FEE);
  // A fee of its own ("a discontinuation fee") is not the course's fee.
  const fee = FEE_WORD.test(c.replace(/\b(?:discontinuation|processing) fees?\b/gi, "")) && (WHOLE.test(c) || REST.test(c) || !!nFee);
  const st = STIPEND.test(c) && PAY_BACK.test(c);
  if (!fee && !st) return null;
  const nSt = c.match(N_YEARS_ST);
  const months = c.match(N_MONTHS_ST);
  const twice = st && DOUBLE.test(c);
  const rest = fee && !nFee && REST.test(c);
  const feeLabel = nFee ? `${num(nFee[1])} years' fee` : rest ? "Rest of course fee" : "Whole course fee";
  const stLabel = months ? `${num(months[1])} months' stipend` : nSt ? `${num(nSt[1])} years' stipend` : twice ? "2× stipend" : "Refund stipend";
  const label = fee && st ? "Fees + stipend" : fee ? feeLabel : stLabel;
  if (UNPRICED.test(c)) return { label, why: "part of it has no figure Seatora holds" };
  const parts: Part[] = [];
  if (fee) {
    const p = sumOf(years, "fee", nFee ? num(nFee[1]) : years.length, nFee ? `${num(nFee[1])} years' fee` : "Whole course fee");
    if (!p) return { label, why: "Seatora has no fee figure for every year of this seat" };
    parts.push(rest ? { ...p, bound: p.bound === "atLeast" ? p.bound : "upTo", why: p.why ?? "a balance is what is still unpaid when you leave" } : p);
  }
  if (st) {
    const all = years.length;
    const p = months ? sumOf(years, "stipend", 1, "") : sumOf(years, "stipend", nSt ? num(nSt[1]) : all, nSt ? `${num(nSt[1])} years' stipend` : "Stipend for the whole course");
    if (!p) return { label, why: "Seatora has no stipend figure for every year needed" };
    const m = months ? num(months[1]) : 1;
    const q: Part = months ? { ...p, inr: (p.inr / 12) * m, text: `${m} months' stipend: ${formatINR(p.inr / 12)} a month × ${m} = ${formatINR((p.inr / 12) * m)}` } : p;
    // Stipend received by the date of leaving: at most the whole course's.
    const received = leaving && !nSt && !months;
    if (received && q.bound === "atLeast") return { label, why: "the stipend received by the date you leave is at most the whole course's, and its figure is only a minimum" };
    const r: Part = received ? { ...q, bound: "upTo", why: "the stipend received by the date you leave" } : q;
    parts.push(twice ? { ...r, inr: r.inr * 2, text: `${r.text}, doubled = ${formatINR(r.inr * 2)}` } : r);
  }
  if (/\+|\bplus\b/i.test(c))
    for (const m of c.matchAll(RUPEES)) {
      const inr = toInr(m[1], m[2]);
      parts.push({ inr, text: `${formatINR(inr)} as stated`, bound: null });
    }
  const bounds = new Set(parts.map((p) => p.bound).filter(Boolean));
  if (bounds.size > 1) return { label, why: "one part is at most and another at least its figure" };
  return { parts };
}

/**
 * The formula over one set of clauses (a bond's not-serving words, a leaving penalty's words): the highest computed
 * clause; any clause it cannot price: no number (`label`); none a formula: null.
 */
export function formulaAmount(clauses: string[], years: Years, leaving: boolean, stated?: number): { inr: number | null; formula: Formula } | null {
  const read = clauses.map((c) => [c, clauseFormula(c, years, leaving)] as const).filter((x) => x[1]);
  if (!read.length) return null;
  const words = [...new Set(read.map(([c]) => c))];
  const no = read.find((x) => "label" in x[1]!);
  if (no) {
    const r = no[1] as { label: string; why: string };
    return { inr: null, formula: { text: `No number: ${r.why}.`, bound: null, words, label: r.label } };
  }
  const own: Part[] = stated != null ? [{ inr: stated, text: `${formatINR(stated)} as stated`, bound: null }] : [];
  const best = read.map(([, r]) => [...(r as { parts: Part[] }).parts, ...own]).map((ps) => ({ ps, inr: ps.reduce((s, p) => s + p.inr, 0) })).sort((a, b) => b.inr - a.inr)[0];
  const bound = best.ps.find((p) => p.bound)?.bound ?? null;
  const why = best.ps.find((p) => p.why)?.why;
  const lines = best.ps.map((p) => p.text).join("; ");
  const total = best.ps.length > 1 ? `; total ${formatINR(best.inr)}` : "";
  const b = bound === "upTo" ? ` At most this: ${why}.` : bound === "atLeast" ? ` At least this: ${why}.` : "";
  return { inr: best.inr, formula: { text: `Computed by Seatora from the record's words and this seat's own figures: ${lines}${total}.${b}`, bound, words } };
}

const clausesOf = (s: string | null | undefined, split: RegExp) => (s ? s.split(split).map((x) => x.trim()).filter(Boolean) : []);
/** The PENALTY text's seat-leaving section ("Seat-leaving penalty: X (when) · Y; Other penalty: …"), as clauses. */
const leavingSection = (text: string | undefined) => clausesOf(text?.match(/Seat-leaving penalty: (.*?)(?:; (?:Other penalty|Counselling forfeit):|$)/)?.[1], / · /);

/** A bond and leaving amount in words only that the record gives as a formula: computed where it can be (formulaAmount). */
/** A bond after withFormulas → the bond before it and the penalty text, so a course's own fee years (withFeeVariant) price it again. */
const unpriced = new WeakMap<Bond, { raw: Bond; penaltyText: string | undefined }>();

function withFormulas(b: Bond, years: Years, penaltyText: string | undefined): Bond {
  let out = b;
  if (b.status === "declared" && b.amount.state === "words") {
    const clauses = [...clausesOf(b.text, / · |; /), ...clausesOf(b.quote, /\.{3}|\.\s/)].filter((c) => !LEAVING_WORDS.test(c));
    const f = formulaAmount(clauses, years, false);
    if (f) out = { ...out, amount: f.inr != null ? { ...NONE, state: "figure", min: f.inr, max: f.inr, formula: f.formula } : { ...out.amount, formula: f.formula } };
  }
  // The leaving items' own words, and the record text's when no item has a figure; never a state rule's prose.
  const own = b.leaving.filter((p) => !p.text.startsWith("State rule"));
  if (own.length && b.leavingAmount.state === "words") {
    const f = formulaAmount([...own.map((p) => p.text), ...leavingSection(penaltyText)], years, true);
    if (f) out = { ...out, leavingAmount: f.inr != null ? { ...NONE, state: "figure", min: f.inr, max: f.inr, formula: f.formula } : { ...out.leavingAmount, formula: f.formula } };
  }
  // A figure with a formula on top ("₹10,00,000: …; plus all stipend received up to leaving"): its highest, computed.
  const a = out.leavingAmount;
  if (own.length && a.state === "figure" && a.max != null && !a.extra) {
    const top = own.filter((p) => p.inr != null).map((p) => formulaAmount([p.text.replace(/^₹[\d,]+: /, "")], years, true, p.inr!)).filter((f) => f?.inr != null && f.inr > a.max!).sort((x, y) => y!.inr! - x!.inr!)[0];
    if (top) out = { ...out, leavingAmount: { ...a, min: Math.min(a.min ?? a.max, a.max), max: top.inr, formula: top.formula } };
  }
  return out;
}

// ---------- per kind ----------

/**
 * An older import's fee text: "₹150,000/yr — college declaration to MCC 2025", or the NBEMS ceiling ("Up to ₹1,25,000/yr,
 * no GST …"; older: "₹1.25 L/yr + GST to NBEMS (official DNB course fee)": NBEMS withdrew the GST in November 2023).
 */
export function parseFee(text: string): { inr: number; min?: number; kind: FigureKind; note: string | null; year: number | null; quality: Quality } | null {
  // "₹1,00,000 to ₹68,00,000/yr tuition by subject (management / paid seats) + ₹3,05,000 hostel — college declaration to MCC 2025"
  const r = text.match(/^₹([\d,]+) to ₹([\d,]+)\/yr (.+?) — college declaration to MCC (\d{4})$/);
  if (r) return { inr: toInr(r[2], undefined), min: toInr(r[1], undefined), kind: "declared", note: r[3], year: Number(r[4]), quality: "partial" };
  const up = text.match(/^Up to ₹([\d,]+)\/yr, no GST\b/);
  if (up) return { inr: toInr(up[1], undefined), kind: "maximum", note: null, year: null, quality: "full" };
  const m = text.match(/^₹\s?(\d[\d,]*(?:\.\d+)?)\s*(L|lakh)?\s*\/\s*yr\b(.*)$/i);
  if (!m) return null;
  const inr = toInr(m[1], m[2]);
  const rest = m[3].trim();
  const y = rest.match(/^— college declaration to MCC (\d{4})$/);
  if (y) return { inr, kind: "declared", note: null, year: Number(y[1]), quality: "full" };
  if (rest === "+ GST to NBEMS (official DNB course fee)") return { inr, kind: "maximum", note: null, year: null, quality: "full" };
  return { inr, kind: "published", note: rest || null, year: null, quality: "partial" };
}

/**
 * "₹63,000 / 64,000 / 65,000/month (yr 1/2/3) — college declaration to MCC 2025" (values in year order; fewer than 3 =
 * the later years unknown), "At least ₹43,000/month yr 1 (NBEMS floor…) — actual not verified" (year 1 minimum), or
 * "₹55,200/month PG (NMC stipend filing)" (one PG figure for every year: NMC's list does not split it by year).
 */
export function parseStipend(text: string): { perYear: number[]; allYears: boolean; kind: FigureKind; year: number | null; quality: Quality } | null {
  let m = text.match(/^At least ₹([\d,]+)\/month yr 1 \(NBEMS floor from \w+ (\d{4}); state rate if higher\) — actual not verified$/);
  if (m) return { perYear: [toInr(m[1], undefined)], allYears: false, kind: "minimum", year: Number(m[2]), quality: "full" };
  m = text.match(/^₹([\d,]+)\/month PG \(NMC stipend filing\)$/);
  // NMC's stipend-detail-list.pdf is its 2024 report.
  if (m) return { perYear: [toInr(m[1], undefined)], allYears: true, kind: "nmc", year: 2024, quality: "full" };
  m = text.match(/^₹\s?(\d[\d,]*(?:\s*\/\s*\d[\d,]*)*)\s*\/\s*month\b(.*)$/i);
  if (!m) return null;
  const perYear = m[1].split("/").map((x) => toInr(x.trim(), undefined));
  const rest = m[2].trim();
  const y = rest.match(/^\(yr 1\/2\/3\) — college declaration to MCC (\d{4})$/);
  if (y) return { perYear, allYears: false, kind: "declared", year: Number(y[1]), quality: perYear.length === 3 ? "full" : "partial" };
  return { perYear, allYears: false, kind: "published", year: null, quality: "partial" };
}

/** How fully a fee or stipend text is read: every figure (full), some (partial) or none (shown as published only). */
export function termQuality(t: Pick<Term, "kind" | "text">): Quality {
  const r = t.kind === "FEE" ? parseFee(t.text) : t.kind === "STIPEND" ? parseStipend(t.text) : null;
  return r?.quality ?? "none";
}

// ---------- per programme ----------

const MCC_PROFILE = termSourceName("https://mcc.admissions.nic.in/");
const BOND_PAGE = /[?&]Type=BM\b/i;
const BOND_DOC = "The college's bond document on MCC";
const mccIdOf = (url: string | null) => url?.match(/[?&]InstituteId=(\d+)/i)?.[1] ?? null;

/** `shared`: institutes in our data citing the same MCC profile; more than one and it may be another institute's. */
function sourceLabel(t: Pick<Term, "kind" | "source">, shared: number) {
  if (t.source.name === MCC_PROFILE) {
    const whose = shared > 1 ? `an MCC profile that ${shared} institutes in Seatora's data cite (it may be another institute's)` : null;
    // The profile's bond page (Type=BM), whichever term cites it: named the same everywhere, so the page lists it once.
    if (BOND_PAGE.test(t.source.url ?? "")) return whose ? `Bond document on ${whose}` : BOND_DOC;
    if (t.kind === "BOND") return `Bond document summary on ${whose ?? "the college's MCC profile"}`;
    return whose ? `From ${whose}` : t.kind === "PENALTY" ? "The college's MCC profile" : "Declared by the college to MCC";
  }
  if (t.source.name === "NBEMS notice") return t.kind === "FEE" ? "NBEMS fee notice" : t.kind === "STIPEND" ? "NBEMS stipend notice" : t.source.name;
  if (t.source.url?.includes("nmc.org.in")) return "NMC stipend list";
  return t.source.name;
}

const notDeclared = (): Bond => ({
  status: "not_declared", basis: null, stateRule: null, years: null, yearsSum: null, yearsText: null, amounts: [], otherAmounts: false, amount: NONE, leaving: [], leavingAmount: NONE,
  otherPenalties: [], appliesTo: null, text: null, quote: null, caveat: null, src: null, doc: null,
});

const STATUS: Record<BondDetails["status"], Pick<Bond, "status" | "basis">> = {
  documented: { status: "declared", basis: "document" },
  yes: { status: "declared", basis: "document" },
  state_rule: { status: "declared", basis: "state_rule" },
  no_bond_verified: { status: "none", basis: "document" },
  no: { status: "none", basis: "document" },
  no_bond_rule: { status: "none", basis: "nbems_rule" },
  // Checked every official place (MCC profile and bond page, state rules, NBEMS rules, website): nothing declared.
  not_declared: { status: "not_declared", basis: null },
  unknown: { status: "not_declared", basis: null },
  unclear: { status: "not_declared", basis: null },
};
/**
 * Bond years from the head of the bundle's bond text, the one place it writes them for the seat ("Service bond: 2 years ·
 * …", "State bond: 3 yrs (diploma 2 yrs) as SR, …", "3 years (diploma 2)"); never from other words ("3 years of study").
 * Years joined on in the head clause are added up ("1 + 3 years", "1 yr compulsory govt service + up to 3 yrs if
 * called", "3 yrs if Govt needs, ₹50 L, plus 1 yr compulsory service"). A number in the record wins.
 */
const YEARS_HEAD = /^(?:Service|State) bond: (\d+)(?: \+ (\d+))? (?:years?|yrs?)\b(?: \(diploma (\d+)(?: yrs?)?\))?/;
const MORE_YEARS = /(?:\+|\bplus\b) (?:up to )?(\d+) (?:years?|yrs?)\b/g;
function bondYearsOf(text: string, years: BondDetails["years"], kind: Kind): number[] | null {
  if (typeof years === "number") return [years];
  const m = text.match(YEARS_HEAD);
  if (!m) return null;
  const head = text.slice(m[0].length).split(/ · |;/)[0];
  return [kind === "diploma" && m[3] ? Number(m[3]) : Number(m[1]), ...(m[2] ? [Number(m[2])] : []), ...[...head.matchAll(MORE_YEARS)].map((x) => Number(x[1]))];
}
const yearsOf = (ys: number[] | null) => ({ years: ys && ys.reduce((a, y) => a + y, 0), yearsSum: ys && ys.length > 1 ? ys.join(" + ") : null });
/** One record row as a part: "₹35,00,000 (PG degree, clinical subjects)", or its words when it has no ₹ figure. */
const recordPart = (appliesTo: string, inr: number | null): TermPart => ({ text: inr != null ? `${formatINR(inr)} (${appliesTo})` : `${appliesTo}: no rupee figure`, inr, group: groupOf(appliesTo) });
/** A no-bond document's note that a state law's service may still apply ("…; Karnataka law: 1 yr compulsory govt service may apply"). */
const MAY_APPLY = /; ([^;]*\bmay apply)$/;

/**
 * A bond from its verified record (BOND `details`) for one programme: status from the record (or its by_course entry for
 * this course), years from the text's head (a state rule beside the document: the rule's, the newer), amounts from the
 * record's rows for this programme kind (never in-service), the All India figure first. `amountInr` null (no figure for
 * a non-service All India candidate): the amount is words. `src`: a document's source number (`label`: its name).
 */
function bondFromRecord(programme: Programme, t: Term, d: BondDetails, src: (url: string | null, label?: string) => number): Bond {
  const kind = programmes[programme].kind;
  const course = d.by_course?.find((c) => c.course === programme);
  const st = STATUS[course?.status ?? d.status];
  const unknown = st.status === "not_declared";
  const text = course?.text ?? t.text;
  const url = course ? course.src_url : t.source.url;
  // An unknown record links the college's MCC profile, not a bond document: named so; its document (doc_url) beside it.
  const own = src(url, unknown && url && termSourceName(url) === MCC_PROFILE ? "The college's MCC profile" : undefined);
  const doc = d.doc_url && d.doc_url !== url ? src(d.doc_url, BOND_PAGE.test(d.doc_url) ? undefined : BOND_DOC) : null;
  const mayApply = st.status === "none" ? (text.match(MAY_APPLY)?.[1] ?? null) : null;
  const caveat = mayApply ?? (st.basis === "nbems_rule" && d.confidence ? d.confidence.replace(/^\w+: /, "") : null);
  // A state rule's applies_to is the checker's research note; its text already says whom the rule binds.
  const appliesTo = st.basis === "state_rule" ? null : (d.applies_to ?? null);
  const rs = course?.status ?? d.status;
  // A listed document not read (NEET SS / MDS: "unknown" with the document's link); read with no clear bond, or unknown otherwise.
  const why = rs === "unknown" && d.doc_url ? ("unread" as const) : rs === "unknown" || rs === "unclear" ? ("unclear" as const) : null;
  const base = { ...notDeclared(), ...st, stateRule: d.state_rule?.text ?? null, appliesTo, text, quote: d.quote || null, caveat, src: own, doc, ...(why && { why }) };
  // "No bond" only where nothing may still bind: one where a state law's service may apply is unknown (cells, filters, CSV).
  if (st.status === "none") return mayApply ? { ...base, status: "not_declared", basis: null } : { ...base, years: 0 };
  if (unknown) return base;
  const rule = d.state_rule?.text ? bondYearsOf(d.state_rule.text, null, kind) : null;
  // The rule's years: its amounts too (same basis), citing the rule; else the document's rows.
  const ruleRows = rule && d.state_rule?.amounts?.length ? d.state_rule.amounts : null;
  const ruleSrc = ruleRows && d.state_rule?.source ? src(d.state_rule.source.url) : own;
  const ys = yearsOf(rule ?? bondYearsOf(text, course ? null : d.years, kind));
  const yearsText = (rule ? d.state_rule?.years : typeof d.years === "string" ? d.years : null) ?? null;
  if (course) {
    // Its own entry: one figure; "₹10 L per unserved year" × the years (computed).
    const per = course.amount_inr && ys.years && PER_YEAR.test(course.text) ? course.amount_inr / ys.years : null;
    const amount: Amount = course.amount_inr ? { ...NONE, state: "figure", min: course.amount_inr, max: course.amount_inr, perYear: per } : { ...NONE, state: "words" };
    return { ...base, ...ys, ...(rule && { yearsFrom: "state_rule" as const }), yearsText, amount };
  }
  // Priced by subject (details.by_subject): a row with no ₹ figure is the subject-priced one; the range is over the subjects.
  const subjects = ruleRows ? [] : Object.values(d.by_subject ?? {}).filter((x): x is number => x != null);
  const all = ruleRows
    ? ruleRows.map((a): TermPart => ({ ...recordPart(a.applies_to, a.inr), src: ruleSrc, rule: true }))
    : (d.amounts ?? []).map((a) => recordPart(a.applies_to, a.inr)).filter((p) => !subjects.length || p.inr != null);
  const amounts = aiqFirst(forKind(all, kind));
  // MCh: a record whose rows are all for PG (MD/MS, Diploma) seats is not its bond.
  if (kind === "super" && all.length && !amounts.length) return { ...base, status: "other_course", basis: null, otherAmounts: true };
  const a = amountOf(amounts, ys.years);
  const amount: Amount =
    subjects.length ? { ...a, state: "figure", min: Math.min(...subjects, ...(a.min != null ? [a.min] : [])), max: Math.max(...subjects, ...(a.max != null ? [a.max] : [])), varies: true }
    // No single figure for a non-service All India candidate (amountInr null): words.
    : t.amountInr == null || a.state === "words" ? { ...NONE, state: "words" }
    : a.state === "figure" ? a
    : { ...NONE, state: "figure", min: t.amountInr, max: t.amountInr };
  return { ...base, ...ys, ...(rule && { yearsFrom: "state_rule" as const }), yearsText, amounts, otherAmounts: amounts.length < all.length, amount };
}

/** An item owed on top of another ("lapse of the PG seat (additional)", "in addition to Rs 20 lakh"), not "in addition to fees". */
const ADDITIONAL = /\badditional\b|\bin addition\b(?! to (?:the )?fees?)/i;
/**
 * Penalty items for one programme kind (never in-service-only, All India first): leaving, other, MCC's Round 2 forfeit.
 * Text: "₹35,00,000: PG degree, clinical subjects, discontinues PG course", or the source's words when there is no ₹ figure.
 */
function penaltiesFromRecord(d: PenaltyDetails, kind: Kind) {
  const of = (k: PenaltyDetails["items"][number]["kind"]) =>
    aiqFirst(
      forKind(
        d.items.filter((i) => i.kind === k).map((i) => ({
          text: `${i.inr != null ? `${formatINR(i.inr)}: ` : ""}${i.applies_to}, ${i.when}${i.inr == null && i.quote ? `: "${i.quote}"` : ""}`,
          inr: i.inr,
          group: groupOf(i.applies_to),
          url: i.source_url,
          extra: ADDITIONAL.test(i.when),
        })),
        kind,
      ),
    );
  // A forfeit item with neither figure nor quote says only who and when (`bare`).
  const bare = d.items.some((i) => i.kind === "counselling_forfeit" && i.inr == null && !i.quote);
  return { leaving: of("leaving_penalty"), other: of("other"), forfeit: of("counselling_forfeit"), bare };
}

/**
 * The programme's fee-table records, All India, Deemed/Paid, NRI, DNB Quota first (a summary line shows the first); null
 * when its terms have none (an import before the fee table: the texts are read), [] when none is for this programme.
 */
function recordsOf(programme: Programme, ...ts: (Term | undefined)[]): FeeTableRecord[] | null {
  const d = ts.map((t) => t?.details).find((x) => x && "records" in x);
  if (!d || !("records" in d)) return null;
  const pos = (r: FeeTableRecord) => seatGroups.indexOf(r.seat_groups[0]);
  return d.records.filter((r) => r.programme === programme).sort((a, b) => pos(a) - pos(b));
}

/**
 * The record for a seat's quota: the one whose MCC quotas include it, else the All India group's (a central or state
 * quota such as Delhi University pays its fee), else none (an NRI seat at a college with only Deemed/Paid figures: never
 * another group's). No quota, or records without their quotas (an older import): the first, as a programme summary.
 */
function recordFor(recs: FeeTableRecord[], quota: string | undefined) {
  if (!quota || recs.some((r) => !r.quotas)) return recs[0];
  return recs.find((r) => r.quotas!.includes(quota)) ?? recs.find((r) => r.seat_groups.includes("All India"));
}

/**
 * Figures of one fee-table record, each with its source (`src`: its number in ProgrammeTerms.sources). Fee only when the
 * record says it may be shown (fee_display "numbers"; verbatim or absent: none, `verbatim`), in ₹; each year as stated
 * (null: not stated, never copied from another year); the whole course only when the record gives it (every year stated).
 * Stipends always (an NBEMS floor is `minimum`). MCC's Round 2 forfeit from its form fields.
 */
/** Every year's fee added up; null when a year has none, or one is a range or a ceiling. */
const yearsTotal = (years: { fee: Figure | null }[]) => (years.every((y) => y.fee && y.fee.min == null && y.fee.kind !== "maximum") ? years.reduce((n, y) => n + y.fee!.inr, 0) : null);

/** The NBEMS annual DNB course fee (no GST): the most a DNB hospital may charge. */
const NBEMS_FEE = 125000;

function fromRecords(r: FeeTableRecord | undefined, src: (s: FeeTableRecord["sources"][number]) => number) {
  if (!r) return null;
  const at = (n: number) => src(r.sources.find((s) => s.n === n)!); // the importer checks every cited n is listed
  const numbers = r.fee_display === "numbers";
  const fee = r.fee_per_year.map((f): Figure | null =>
    numbers && f?.amount != null && f.currency === "INR"
      ? {
          inr: f.amount_max ?? f.amount,
          kind: f.maximum ? "maximum" : "declared",
          src: at(f.src),
          ...(f.amount_max != null && f.amount_max !== f.amount && { min: f.amount }),
          ...(f.kind === "amount_at_admission" && { atAdmission: true as const }),
          ...(f.above_nbems_ceiling && { above: true as const }),
          ...(f.note && { note: f.note, noteSrc: f.gst_src != null ? at(f.gst_src) : at(f.src) }),
          ...(f.declared_amount != null && f.declared_amount !== (f.amount_max ?? f.amount) && { declared: f.declared_amount }),
        }
      : null,
  );
  // A verbatim record's figures its own words state for this seat type (tools/parse_fee_text.py): the record's words stay
  // its display, these figures stand beside them with their quote. Year 1 with none: the amount at admission (as a
  // numbers record's year 1). US$ (NRI) figures are never read as ₹.
  const p = numbers ? null : r.fee_parsed;
  const dnb = r.programme === "DNB" || r.programme === "NBEMS Diploma";
  const read = (x: NonNullable<FeeTableRecord["fee_parsed"]>["per_year"][number] | undefined, adm?: true): Figure | null =>
    p && x && x.currency === "INR"
      ? { inr: x.amount, kind: "declared", src: at(p.src), fromText: { quote: x.quote, ...(x.field && { field: x.field }) }, ...(adm && { atAdmission: true as const }), ...(dnb && !adm && x.amount > NBEMS_FEE && { above: true as const }) }
      : null;
  const textFee = p ? p.per_year.map((x, i) => read(x) ?? (i === 0 ? read(p.at_admission, true) : null)) : null;
  const extras = p
    ? [
        ...(p.per_year[0] && p.at_admission ? [{ label: "At admission" as const, f: read(p.at_admission, true)! }] : []),
        ...(p.annual_fee ? [{ label: "Annual fee" as const, f: read(p.annual_fee)! }] : []),
      ].filter((x) => x.f)
    : [];
  const hostels = numbers ? (r.other_fees ?? []).filter((o) => o.kind === "hostel" && o.currency === "INR") : [];
  const ph = p?.hostel?.currency === "INR" ? p.hostel : null;
  const hostel: HostelFee | null = ph
    ? { inr: ph.amount, period: ph.period, src: at(p!.src), quote: ph.quote }
    : hostels.length === 1
      ? { inr: hostels[0].amount, period: hostels[0].period === "per_month" || hostels[0].period === "per_year" ? hostels[0].period : null, src: at(hostels[0].src), ...(hostels[0].included_in_fee && { included: true as const }) }
      : null;
  const stipend = r.stipend_per_month.map((s, i): Figure | null => {
    if (!s) return null;
    const nb = s.below_nbems_minimum ? r.stipend_nbems_minimum?.[i] : undefined;
    return {
      inr: s.inr, kind: s.minimum ? "minimum" : s.kind === "nmc_list" ? "nmc" : "declared", src: at(s.src),
      ...(s.below_nbems_minimum && { below: true as const }), ...(nb && { nbems: { inr: nb.inr, src: at(nb.src) } }), ...(s.plus_da && { plusDa: true as const }),
    };
  });
  const w = numbers ? r.fee_whole_course : null;
  const cf = r.counselling_forfeit;
  const forfeit = cf?.forfeited_if_resign_or_not_join_from_round2?.inr;
  const forfeitWords = cf?.forfeited_if_resign_or_not_join_from_round2?.text;
  return {
    verbatim: !numbers,
    fee: textFee ?? fee,
    extras,
    hostel,
    stipend,
    whole: w && w.currency === "INR" && w.amount_max == null ? w.amount : null,
    forfeit: cf && forfeit != null ? ({ inr: forfeit, kind: "declared", src: at(cf.src) } satisfies Figure) : null,
    /** The profile's forfeit in words only (no ₹ figure), verbatim. */
    forfeitText: cf && forfeit == null && forfeitWords ? { text: forfeitWords, src: at(cf.src) } : null,
  };
}

/**
 * One programme's terms at one college, from the terms of its own bucket only (MD: MD/MS, Diploma, MCh, MPH; DNB: DNB,
 * NBEMS Diploma): never the other bucket's. `sharedBy`: institutes citing an MCC profile id. `quota`: the fee and stipend
 * of that quota's fee-table record (recordFor); omitted, the first record's.
 */
export function normalizeProgramme(programme: Programme, terms: Term[], sharedBy: (mccId: string) => number = () => 1, quota?: string): ProgrammeTerms {
  const def = programmes[programme];
  const own = terms.filter((t) => t.program === def.bucket);
  const get = (k: Term["kind"]) => own.find((t) => t.kind === k);
  const sources: TermSource[] = [];
  const add = (s: Omit<TermSource, "n">) => {
    const found = sources.find((x) => x.label === s.label && x.url === s.url && x.year === s.year);
    if (found) return found.n;
    sources.push({ n: sources.length + 1, ...s });
    return sources.length;
  };
  const srcOf = (t: Pick<Term, "kind" | "source">, year: number | null, label?: string | null) => {
    const mccId = mccIdOf(t.source.url);
    const shared = mccId ? sharedBy(mccId) : 1;
    return add({ label: label ?? sourceLabel(t, shared), url: t.source.url, year, mccId, sharedBy: shared, type: t.source.type });
  };
  /**
   * A document a record links (its own, by_course, penalty items): the term's own source when it is the same URL, named
   * as the record names it (a state order or NBEMS rule: its title and date).
   */
  const docOf = (t: Term) => (url: string | null, label?: string) => {
    const named = (t.details && "status" in t.details ? [t.details.source, t.details.state_rule?.source] : []).flat().find((x) => x && x.url === (url ?? t.source.url));
    const name = label ?? (named ? (named.date && !named.title.includes(named.date) ? `${named.title} (${named.date})` : named.title) : null);
    return srcOf(url == null || url === t.source.url ? t : { kind: t.kind, source: { name: termSourceName(url), url, type: "OFFICIAL" } }, null, name);
  };
  const unread: ProgrammeTerms["unread"] = [];
  const notes: string[] = [];

  let feeT = get("FEE");
  let stT = get("STIPEND");
  if (!def.figures && (feeT || stT)) {
    notes.push(`The college's MCC profile gives one fee and stipend (shown under MD/MS); none is declared for ${programme}.`);
    feeT = stT = undefined;
  }
  const recs = recordsOf(programme, feeT, stT);
  const read = recs ? fromRecords(recordFor(recs, quota), (s) => add({ label: s.label, url: s.url, year: typeof s.year === "number" ? s.year : null, mccId: s.mcc_id ?? null, sharedBy: 1, type: "OFFICIAL" })) : null;
  // A fee in the profile's own words only (verbatim): no figure; the quota's record's words as published ("see terms"),
  // read from its MCC profile page; none in words: said so (the export may then have no FEE term, only the STIPEND one).
  let notesSrc: number | undefined;
  const recT = feeT ?? stT;
  if (read?.verbatim && recT) {
    const r = recordFor(recs!, quota)!;
    const url = r.fee_text_src?.url;
    const at = url ? srcOf({ kind: "FEE", source: { name: termSourceName(url), url, type: "OFFICIAL" } }, null) : srcOf({ kind: "FEE", source: recT.source }, null);
    if (r.fee_text) unread.push({ kind: "FEE", text: r.fee_text, src: at });
    else {
      notes.push("The MCC profile gives no fee in words for these seats, so Seatora shows no fee.");
      notesSrc = at;
    }
  }

  const fee = !recs && feeT ? parseFee(feeT.text) : null;
  let feeFig: Figure | null = null;
  if (feeT && fee) feeFig = { inr: fee.inr, kind: fee.kind, src: srcOf(feeT, fee.year), ...(fee.min != null && { min: fee.min }) };
  else if (feeT && !recs) unread.push({ kind: "FEE", text: feeT.text, src: srcOf(feeT, null) });

  const st = !recs && stT ? parseStipend(stT.text) : null;
  const stSrc = stT && st ? srcOf(stT, st.year) : 0;
  if (stT && !st && !recs) unread.push({ kind: "STIPEND", text: stT.text, src: srcOf(stT, null) });
  const stipendAt = (y: number): Figure | null => {
    if (recs) return read?.stipend[y - 1] ?? null;
    if (!st) return null;
    const inr = st.allYears ? st.perYear[0] : st.perYear[y - 1];
    return inr == null ? null : { inr, kind: st.kind, src: stSrc };
  };

  const years = Array.from({ length: def.years }, (_, i) => ({ year: i + 1, fee: recs ? (read?.fee[i] ?? null) : feeFig, stipend: stipendAt(i + 1) }));

  const bondT = get("BOND");
  const penT = get("PENALTY");
  const penRecord = penT?.details && "items" in penT.details ? penT.details : null;
  let bond = notDeclared();
  if (bondT?.details && "status" in bondT.details) bond = bondFromRecord(programme, bondT, bondT.details, docOf(bondT));
  else if (bondT) unread.push({ kind: "BOND", text: bondT.text, src: srcOf(bondT, null) });

  let resignForfeit: Figure | null = null;
  let resignForfeitText: ProgrammeTerms["resignForfeitText"] = null;
  if (penT && penRecord) {
    const p = penaltiesFromRecord(penRecord, def.kind);
    const src = docOf(penT);
    const at = (parts: (TermPart & { url: string | null })[]) => parts.map(({ url, ...x }) => ({ ...x, src: src(url) }));
    bond = { ...bond, leaving: at(p.leaving), leavingAmount: amountOf(p.leaving, null), otherPenalties: at(p.other) };
    const f = p.forfeit.find((x) => x.inr != null);
    const w = p.forfeit[0];
    if (f) resignForfeit = { inr: f.inr!, kind: "declared", src: src(f.url) };
    // An item with neither figure nor quote says only who and when: the profile's own words say what is forfeited.
    else if (w) resignForfeitText = p.bare && read?.forfeitText ? { text: `${w.text}: "${read.forfeitText.text}"`, src: read.forfeitText.src } : { text: w.text, src: src(w.url) };
  } else if (penT) unread.push({ kind: "PENALTY", text: penT.text, src: srcOf(penT, null) });
  // A state rule's own seat-leaving penalty (its record's words; the college has no PENALTY record of its own here):
  // the Leaving cell shows "See text" with them, never a figure read out of the words.
  const rulePenalty = bond.basis === "state_rule" && bondT?.details && "status" in bondT.details ? bondT.details.penalty : null;
  if (rulePenalty && !bond.leaving.length) bond = { ...bond, leaving: [{ text: `State rule${bondT!.details && "state" in bondT!.details && bondT!.details.state ? ` (${bondT!.details.state})` : ""}: ${rulePenalty}`, inr: null, group: "all", src: bond.src ?? undefined }], leavingAmount: { ...NONE, state: "words" } };
  const raw = bond;
  bond = withFormulas(bond, years, penT?.text);
  unpriced.set(bond, { raw, penaltyText: penT?.text });
  resignForfeit ??= read?.forfeit ?? null;
  if (!resignForfeit && !resignForfeitText && read?.forfeitText) resignForfeitText = read.forfeitText;

  return {
    programme,
    durationYears: def.years,
    years,
    feeNote: fee && feeFig ? fee.note : null,
    hostelFee: read?.hostel ?? null,
    feeExtras: read?.extras ?? [],
    // A range (by subject) has no one whole-course figure. NEET MDS / SS: a record without its total, every year's figure
    // stated (and none a range or a ceiling), adds them up (RIMS Ranchi: ₹42,000 + ₹25,000 + ₹22,000).
    wholeCourseFee: recs ? (read?.whole ?? (examProgrammes(DEFAULT_EXAM).includes(programme) ? null : yearsTotal(years))) : feeFig && feeFig.min == null ? feeFig.inr * def.years : null,
    bond,
    resignForfeit,
    resignForfeitText,
    unread,
    notes,
    ...(notesSrc != null && { notesSrc }),
    sources,
  };
}

/** The programmes a college offers (from its courses), in the order MD/MS, Diploma, DNB, NBEMS Diploma, MCh, MPH. */
export function programmesOf(degrees: Iterable<string>, exam: ExamKey = DEFAULT_EXAM): Programme[] {
  const have = new Set([...degrees].map((d) => programmeOfDegree(d, exam)));
  return programmeNames.filter((p) => have.has(p));
}

type Index = { degrees: Map<string, Set<string>>; terms: Map<string, Term[]>; sharedBy: (mccId: string) => number; out: Map<string, ProgrammeTerms[]>; byQuota: Map<string, ProgrammeTerms> };
const memo = new WeakMap<Catalog, Index>();
function indexOf(cat: Catalog) {
  let m = memo.get(cat);
  if (!m) {
    const degrees = new Map<string, Set<string>>();
    for (const p of cat.pairs.values()) (degrees.get(p.college) ?? degrees.set(p.college, new Set()).get(p.college)!).add(p.degree);
    const terms = new Map<string, Term[]>();
    const byId = new Map<string, Set<string>>();
    for (const t of cat.terms) {
      (terms.get(t.college) ?? terms.set(t.college, []).get(t.college)!).push(t);
      const id = mccIdOf(t.source.url);
      if (id) (byId.get(id) ?? byId.set(id, new Set()).get(id)!).add(t.college);
    }
    memo.set(cat, (m = { degrees, terms, sharedBy: (id) => byId.get(id)?.size ?? 1, out: new Map(), byQuota: new Map() }));
  }
  return m;
}

/** Every programme a college offers, normalized (memoized per catalog). */
export function collegeTerms(cat: Catalog, college: string): ProgrammeTerms[] {
  const m = indexOf(cat);
  let out = m.out.get(college);
  if (!out) {
    const terms = m.terms.get(college) ?? [];
    const website = cat.collegeByKey?.get(college)?.website ?? null;
    out = programmesOf(m.degrees.get(college) ?? [], cat.exam).map((p) => ({ ...normalizeProgramme(p, terms, m.sharedBy), website }));
    m.out.set(college, out);
  }
  return out;
}

/**
 * The terms for one course at a college (its programme). `specialty`: a bond that varies by specialty (the record's
 * by_subject) gives that course's own figure. `quota`: the fee and stipend of that quota's fee-table record (memoized).
 */
/**
 * A deemed university's fee for one course: its fee record (this quota's) lists per-course figures (`fee_variants`,
 * applies_to "MD ANAESTHESIOLOGY"); the course's own years replace the record's range (min-max across subjects).
 */
function withFeeVariant(cat: Catalog, t: ProgrammeTerms, college: string, degree: string, specialty: string | undefined, quota: string | undefined): ProgrammeTerms {
  if (!specialty) return t;
  const p = programmeOfDegree(degree, cat.exam);
  const own = indexOf(cat).terms.get(college)?.filter((x) => x.program === programmes[p].bucket) ?? [];
  const recs = recordsOf(p, own.find((x) => x.kind === "FEE"), own.find((x) => x.kind === "STIPEND"));
  const v = recs ? recordFor(recs, quota)?.fee_variants : undefined;
  if (!v?.length) return t;
  const hit = variantFor(v, degree, specialty);
  // Another exam: a figure for the programme where some subjects have their own says it may vary (NEET PG: as before).
  if (!hit) return cat.exam === DEFAULT_EXAM ? t : { ...t, years: t.years.map((y) => (y.fee && y.fee.min == null ? { ...y, fee: { ...y.fee, varies: true as const } } : y)) };
  const years = t.years.map((y, i) => {
    const f = hit.per_year[i];
    if (!f || !y.fee) return y;
    const { min: _min, ...rest } = y.fee;
    void _min;
    return { ...y, fee: { ...rest, inr: f.amount_max ?? f.amount, ...(f.amount_max != null && f.amount_max !== f.amount && { min: f.amount }) } };
  });
  const all = years.every((y) => y.fee && y.fee.min == null);
  // A penalty priced from the fee ("tuition for the remaining course") on this course's own fee, not the range's highest.
  const r = unpriced.get(t.bond);
  const bond = r ? withFormulas(r.raw, years, r.penaltyText) : t.bond;
  return { ...t, years, bond, wholeCourseFee: all ? years.reduce((n, y) => n + (y.fee?.inr ?? 0), 0) : t.wholeCourseFee };
}

export function courseTerms(cat: Catalog, college: string, degree: string, specialty?: string, quota?: string): ProgrammeTerms {
  return withFeeVariant(cat, courseTermsBase(cat, college, degree, specialty, quota), college, degree, specialty, quota);
}

function courseTermsBase(cat: Catalog, college: string, degree: string, specialty?: string, quota?: string): ProgrammeTerms {
  const p = programmeOfDegree(degree, cat.exam);
  const m = indexOf(cat);
  const k = quota ? `${college}|${p}|${quota}` : null;
  let t = k ? m.byQuota.get(k) : undefined;
  if (!t) {
    t = k ? normalizeProgramme(p, m.terms.get(college) ?? [], m.sharedBy, quota) : (collegeTerms(cat, college).find((x) => x.programme === p) ?? normalizeProgramme(p, m.terms.get(college) ?? [], m.sharedBy));
    if (t.website === undefined) t = { ...t, website: cat.collegeByKey?.get(college)?.website ?? null };
    if (k) m.byQuota.set(k, t);
  }
  const d = specialty && t.bond.status === "declared" && !t.bond.amounts.some((x) => x.rule) ? m.terms.get(college)?.find((x) => x.program === programmes[p].bucket && x.kind === "BOND")?.details : undefined;
  const own = d && "status" in d ? d.by_subject?.[specialty!] : undefined;
  if (own != null) return { ...t, bond: { ...t.bond, amount: { ...t.bond.amount, state: "figure", min: own, max: own, perYear: null, varies: false, formula: undefined } } };
  // Rows priced by subject group ("PG degree, clinical subjects" / "pre/para-clinical subjects"): this course's group's.
  const g = specialty ? subjectGroup(specialty) : null;
  if (!g) return t;
  const b = t.bond;
  const amount = b.status === "declared" && b.amount.state === "figure" && !b.amount.formula ? ofGroup(b.amounts, g) : null;
  const leaving = b.leavingAmount.state === "figure" && !b.leavingAmount.formula ? ofGroup(b.leaving, g) : null;
  if (!amount && !leaving) return t;
  return { ...t, bond: { ...b, ...(amount && { amount: amountOf(amount, b.years) }), ...(leaving && { leavingAmount: amountOf(leaving, null) }) } };
}

// Subjects every state counts the same way (Gujarat's pre/para-clinical list leaves out Pathology and Microbiology,
// so those two, and any other, keep the range).
const PRE_PARA_SUBJECTS = new Set(["ANATOMY", "PHYSIOLOGY", "BIOCHEMISTRY", "PHARMACOLOGY", "FORENSICMEDICINE", "COMMUNITYMEDICINE"]);
const CLINICAL_SUBJECTS = new Set([
  "ANAESTHESIOLOGY", "DERMATOLOGY", "EMERGENCYMEDICINE", "ENT", "FAMILYMEDICINE", "GENERALMEDICINE", "GENERALSURGERY", "GERIATRICMEDICINE", "OBG",
  "OPHTHALMOLOGY", "ORTHOPAEDICS", "PAEDIATRICS", "PSYCHIATRY", "RADIODIAGNOSIS", "RADIATIONONCOLOGY", "RESPIRATORYMEDICINE",
]);
const subjectGroup = (s: string) => (PRE_PARA_SUBJECTS.has(s) ? "prePara" : CLINICAL_SUBJECTS.has(s) ? "clinical" : null);
const PRE_PARA = /\b(?:pre|para)(?:\b|clinical)/i;
/** The parts for a subject group, when the record prices both groups apart (else null: one figure or range for all). */
function ofGroup<T extends { text: string }>(parts: T[], g: "prePara" | "clinical"): T[] | null {
  const pp = parts.filter((x) => /clinical/i.test(x.text) && PRE_PARA.test(x.text));
  const cl = parts.filter((x) => /\bclinical\b/i.test(x.text) && !PRE_PARA.test(x.text));
  return pp.length && cl.length ? parts.filter((x) => !(g === "prePara" ? cl : pp).includes(x)) : null;
}
