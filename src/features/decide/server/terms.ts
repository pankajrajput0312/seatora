import "server-only";
import type { Catalog } from "./catalog";
import type { SourceType } from "@/types/provenance";
import type { Term } from "../types";

// The ONE place that reads fee, stipend, bond and MCC-penalty texts (CollegeTerm, as published) into numbers. The UI
// only renders ProgrammeTerms. ponytail: regexes over the importer's text shapes; data/curated/terms_structured.json
// replaces the parsing here (same output shape) once it exists.

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
} as const;
export type Programme = keyof typeof programmes;
export const programmeNames = Object.keys(programmes) as Programme[];
const bucketName = { MD: "MD/MS", DNB: "DNB" } as const;

export function programmeOfDegree(degree: string): Programme {
  if (degree === "MD" || degree === "MS") return "MD/MS";
  if (degree === "DrNB") return "DNB";
  return degree in programmes ? (degree as Programme) : /^(DNB|NBEMS)/.test(degree) ? "DNB" : "MD/MS";
}

/** declared: the college's own figure; nbems: NBEMS's fixed DNB fee; minimum: NBEMS floor (actual may be higher); nmc: NMC stipend list (one PG figure, not split by year). */
export type FigureKind = "declared" | "nbems" | "minimum" | "nmc" | "published";
/** `src`: number of the source in ProgrammeTerms.sources. */
export type Figure = { inr: number; kind: FigureKind; src: number };
/**
 * `mccId`: the MCC institute profile the figure was read from. `sharedBy`: how many institutes in our data cite that
 * profile (more than 1: it may be another institute's). `filedUnder`: the term was filed under the college's other
 * programme bucket ("MD/MS" or "DNB") in the import, and is shown here because this programme has none of that kind.
 */
export type TermSource = { n: number; label: string; url: string | null; year: number | null; mccId: string | null; sharedBy: number; filedUnder: "MD/MS" | "DNB" | null; type: SourceType };
/**
 * One piece of a bond or leaving-penalty text, exactly as published (`text`), with its rupee figure (sum of the figures
 * outside brackets) and who it is for: degree (MD/MS/DNB), diploma, super (super-speciality), inservice, all.
 */
export type TermPart = { text: string; inr: number | null; group: Group };
type Group = "degree" | "diploma" | "super" | "inservice" | "all";

/**
 * A bond or leaving amount for one programme. figure: `min`–`max` in ₹ (a range when it depends on course type);
 * words: declared without a ₹ figure (the exact words say what); none: not declared. `perYear`: the published amount is
 * per defaulting year, so min/max are it × the bond years (computed). `varies`: the text gives a range by specialty
 * (min–max over it). `more`: some parts have no ₹ figure (in words only).
 */
export type Amount = { state: "figure" | "words" | "none"; min: number | null; max: number | null; perYear: number | null; varies: boolean; more: boolean };

export type Bond = {
  /** declared: a bond term applies; not_declared: no bond term; other_course: the declared bond is for other courses only. */
  status: "declared" | "not_declared" | "other_course";
  /** Years of service for this programme (the longest stated for it, All India figure first); null when not stated. */
  years: number | null;
  /** The years as published, e.g. "1 year (extendable up to 2 more years)". */
  yearsText: string | null;
  /** The amounts that apply to this programme; empty when none is stated for it. */
  amounts: TermPart[];
  /** True when the text also has amounts for other courses or quotas (left out of `amounts`). */
  otherAmounts: boolean;
  amount: Amount;
  /** The college or state penalty for leaving the course after joining (inside the bond text), not MCC's Round 2 forfeit. */
  leaving: TermPart[];
  leavingAmount: Amount;
  appliesTo: string | null;
  /** Some of this course's figures were read from the "applies to" words (e.g. "₹20,00,000 for PG diploma/MDS"). */
  fromAppliesTo: boolean;
  /** The published sentence, without the importer's "(summary of the bond document…)" tag. */
  text: string | null;
  src: number | null;
};

export type ProgrammeTerms = {
  programme: Programme;
  durationYears: number;
  /** One row per year of the course: a 2-year course has no year 3. */
  years: { year: number; fee: Figure | null; stipend: Figure | null }[];
  /** Words beside the fee figure, e.g. "+ GST". */
  feeNote: string | null;
  /** Σ fee of every year, when every year's fee is known (computed from one yearly figure: the terms have no year split). */
  wholeCourseFee: number | null;
  bond: Bond;
  /** MCC profile: what is forfeited if you resign or don't join from Round 2 (PENALTY). Not the leaving penalty. */
  resignForfeit: Figure | null;
  /** A term whose shape isn't read, or whose figure is known not to be what it says (`why`): shown as published. */
  unread: { kind: Term["kind"]; text: string; src: number; why?: string }[];
  /** Plain sentences about figures left out for this programme. */
  notes: string[];
  sources: TermSource[];
};

export type Quality = "full" | "partial" | "none";

// ---------- text helpers ----------

/** Splits on separators outside brackets. */
function splitTop(s: string, seps: string[]): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const sep = seps.find((x) => s.startsWith(x, i));
      if (sep) {
        out.push(s.slice(start, i));
        start = i + sep.length;
        i = start - 1;
      }
    }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** The text with bracketed parts blanked out. */
const outsideBrackets = (s: string) => {
  let depth = 0;
  return [...s].map((ch) => (ch === "(" ? (depth++, " ") : ch === ")" ? ((depth = Math.max(0, depth - 1)), " ") : depth ? " " : ch)).join("");
};
/** The contents of the outermost brackets. */
const bracketed = (s: string) => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(" && depth++ === 0) start = i + 1;
    else if (s[i] === ")" && depth > 0 && --depth === 0) out.push(s.slice(start, i));
  }
  return out;
};

const RUPEES = /₹\s?(\d[\d,]*(?:\.\d+)?)\s*(crore|cr\b|lakh|l\b)?/gi;
const toInr = (n: string, unit: string | undefined) => {
  const v = Number(n.replace(/,/g, ""));
  const u = unit?.toLowerCase();
  return Math.round(u === "crore" || u === "cr" ? v * 1e7 : u === "lakh" || u === "l" ? v * 1e5 : v);
};
const allRupees = (s: string) => [...s.matchAll(RUPEES)].map((m) => toInr(m[1], m[2]));
/** Σ rupee figures outside brackets ("₹20,00,000 + ₹10,00,000 seat lapse" → 30 L; "₹40 L (₹10 L + ₹30 L)" → 40 L); null when none. */
export function rupeesOutside(s: string): number | null {
  const xs = allRupees(outsideBrackets(s));
  return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
}
const firstYears = (s: string) => {
  const m = s.match(/(\d+)(?:\s|-)(?:years?|yrs?)\b/i);
  return m ? Number(m[1]) : null;
};
/** A part's years: the figure outside brackets, or a larger "minimum N years" inside them ("1 year (clause 2 says minimum 3 years)" → 3). */
const partYears = (p: string) => {
  const base = firstYears(outsideBrackets(p)) ?? firstYears(p);
  const min = p.match(/minimum (\d+)(?:\s|-)(?:years?|yrs?)\b/i);
  return min && (base == null || Number(min[1]) > base) ? Number(min[1]) : base;
};

function groupOf(s: string): Group {
  const t = s.toLowerCase();
  if (/\bin-service\b/.test(t) && !/non[- ]in-service/.test(t)) return "inservice";
  if (/super[- ]?speciali|\bdm\b|\bmch\b/.test(t)) return "super";
  if (/diploma/.test(t)) return "diploma";
  if (/degree|clinical|\bpg\b|\bmd\b|\bms\b|post doctoral/.test(t)) return "degree";
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

const max = (xs: (number | null)[]) => {
  const ys = xs.filter((x): x is number => x != null);
  return ys.length ? Math.max(...ys) : null;
};

const PER_YEAR = /per (?:defaulting )?year/i;
const BY_SPECIALTY = /by specialt?y|by speciality|subject-wise/i;
/** Words added to a figure ("₹50 L + amount spent on course", "fees for the entire course + ₹25 L", "+ 12% interest"). */
const plusWords = (t: string) => /\+\s*[^#\s]|[^#\s]\s*\+/.test(outsideBrackets(t).replace(RUPEES, "#"));
const NONE: Amount = { state: "none", min: null, max: null, perYear: null, varies: false, more: false };
/** One programme's amount over its parts. `years`: the bond years, for "per defaulting year" amounts (null: never multiplied). */
function amountOf(parts: TermPart[], years: number | null): Amount {
  if (!parts.length) return NONE;
  const per = years != null ? parts.find((p) => p.inr != null && PER_YEAR.test(p.text)) : undefined;
  const varies = parts.some((p) => BY_SPECIALTY.test(p.text));
  const xs = parts.flatMap((p) => (BY_SPECIALTY.test(p.text) ? allRupees(p.text) : p.inr == null ? [] : [p === per ? p.inr * years! : p.inr]));
  return {
    state: xs.length ? "figure" : "words",
    min: xs.length ? Math.min(...xs) : null,
    max: max(xs),
    perYear: per?.inr ?? null,
    varies,
    more: parts.some((p) => p.inr == null || plusWords(p.text)),
  };
}

// ---------- per kind ----------

/** "₹150,000/yr — college declaration to MCC 2025" or "₹1.25 L/yr + GST to NBEMS (official DNB course fee)". */
export function parseFee(text: string): { inr: number; kind: FigureKind; note: string | null; year: number | null; quality: Quality } | null {
  const m = text.match(/^₹\s?(\d[\d,]*(?:\.\d+)?)\s*(L|lakh)?\s*\/\s*yr\b(.*)$/i);
  if (!m) return null;
  const inr = toInr(m[1], m[2]);
  const rest = m[3].trim();
  const y = rest.match(/^— college declaration to MCC (\d{4})$/);
  if (y) return { inr, kind: "declared", note: null, year: Number(y[1]), quality: "full" };
  if (rest === "+ GST to NBEMS (official DNB course fee)") return { inr, kind: "nbems", note: "+ GST", year: null, quality: "full" };
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

/** "₹1,500 forfeited if you resign/don't join from Round 2 (MCC profile)". */
export function parsePenalty(text: string): { inr: number; quality: Quality } | null {
  const m = text.match(/^₹([\d,]+) forfeited if you resign\/don't join from Round 2 \(MCC profile\)$/);
  if (m) return { inr: toInr(m[1], undefined), quality: "full" };
  const inr = rupeesOutside(text);
  return inr == null ? null : { inr, quality: "partial" };
}

const TAG = " (summary of the bond document on the MCC institute profile)";

type Part = TermPart & { fromAppliesTo?: true };
/**
 * Figures for other courses written in the "applies to" words: "₹20,00,000 for PG diploma/MDS", "(super-speciality: 2
 * years / ₹2 crore)", "in-service: 5 years / ₹80,00,000", "Diploma: 2 years service, ₹2,00,000 discontinuation"
 * (a leaving penalty). Diploma, super-speciality and in-service ones only: a degree figure is the head's.
 */
function appliesToParts(s: string) {
  const segs = splitTop(s, ["; "]).flatMap((x) => [x, ...bracketed(x).flatMap((b) => splitTop(b, ["; "]))]);
  return segs.flatMap((text) => {
    const own = outsideBrackets(text);
    const [inr] = allRupees(own);
    const group = groupOf(own);
    if (inr == null || group === "degree" || group === "all") return [];
    return [{ text, inr, group, years: firstYears(own), leaving: /discontinu|leav/i.test(own) }];
  });
}

/**
 * The importer's bond sentence: "Service bond <amounts> (<years> service); seat-leaving penalty <penalty>; applies to
 * <who>". Amounts and penalties are split into parts (on "; " and " / " outside brackets), each with its group; figures
 * for other courses in "applies to" become parts of their own (then the head's unlabelled figures are the degree's).
 */
export function parseBond(text: string) {
  const plain = text.endsWith(TAG) ? text.slice(0, -TAG.length) : text;
  if (!plain.startsWith("Service bond")) return null;
  const segs = splitTop(plain.slice("Service bond".length), ["; "]);
  const iLeave = segs.findIndex((s) => s.startsWith("seat-leaving penalty "));
  const iApplies = segs.findIndex((s) => s.startsWith("applies to "));
  const headEnd = [iLeave, iApplies, segs.length].find((i) => i >= 0)!;
  let head = segs.slice(0, headEnd).join("; ");
  // The years are the last bracket of the head when it ends in " service)".
  let yearsText: string | null = null;
  if (head.endsWith(" service)")) {
    let depth = 0;
    for (let i = head.length - 1; i >= 0; i--) {
      if (head[i] === ")") depth++;
      else if (head[i] === "(" && --depth === 0) {
        yearsText = head.slice(i + 1, -" service)".length).trim();
        head = head.slice(0, i).trim();
        break;
      }
    }
  }
  const leaveEnd = iApplies >= 0 ? iApplies : segs.length;
  const leavingText = iLeave >= 0 ? segs.slice(iLeave, leaveEnd).join("; ").slice("seat-leaving penalty ".length) : null;
  const appliesTo = iApplies >= 0 ? segs.slice(iApplies).join("; ").slice("applies to ".length) : null;
  const extra = appliesTo ? appliesToParts(appliesTo) : [];
  // "Service bond ₹40 L (2 years service); applies to PG degree…; ₹20 L for PG diploma": the ₹40 L is the degree's.
  const headGroup = (g: Group): Group => (g === "all" && extra.some((e) => e.group === "diploma" || e.group === "super") ? "degree" : g);
  const parts = (s: string): Part[] => {
    const out: Part[] = [];
    for (const p of splitTop(s, ["; ", " / "])) {
      const inr = rupeesOutside(p);
      // "…; additional ₹10,00,000 for lapse of seat": on top of the part before it.
      if (/^additional\b/i.test(p) && out.length && inr != null) out[out.length - 1] = { ...out[out.length - 1], text: `${out[out.length - 1].text}; ${p}`, inr: (out[out.length - 1].inr ?? 0) + inr };
      else out.push({ text: p, inr, group: headGroup(groupOf(p)) });
    }
    return out;
  };
  const fromApplies = (e: (typeof extra)[number]): Part => ({ text: e.text, inr: e.inr, group: e.group, fromAppliesTo: true });
  const yearParts = [
    ...(yearsText ? splitTop(yearsText, ["; "]).map((p) => ({ text: p, years: partYears(p), group: headGroup(groupOf(p)), fromAppliesTo: false })) : []),
    ...extra.filter((e) => e.years != null).map((e) => ({ text: e.text, years: e.years, group: e.group, fromAppliesTo: true })),
  ];
  const amounts = [...parts(head), ...extra.filter((e) => !e.leaving).map(fromApplies)];
  const leaving = [...(leavingText ? parts(leavingText) : []), ...extra.filter((e) => e.leaving).map(fromApplies)];
  const quality: Quality =
    yearParts.some((p) => p.years != null) &&
    amounts.length > 0 &&
    amounts.every((a) => a.inr != null && !BY_SPECIALTY.test(a.text)) &&
    leaving.every((l) => l.inr != null) &&
    (!appliesTo?.includes("₹") || extra.length > 0)
      ? "full"
      : "partial";
  return { text: plain, yearsText, yearParts, amounts, leaving, appliesTo, quality };
}

/** How fully a term's text is read: every figure (full), some (partial) or none (shown as published only). */
export function termQuality(t: Pick<Term, "kind" | "text">): Quality {
  const r = t.kind === "FEE" ? parseFee(t.text) : t.kind === "STIPEND" ? parseStipend(t.text) : t.kind === "PENALTY" ? parsePenalty(t.text) : parseBond(t.text);
  return r?.quality ?? "none";
}

// ---------- per programme ----------

const MCC_PROFILE = "MCC institute profile (college declaration)";
const mccIdOf = (url: string | null) => url?.match(/[?&]InstituteId=(\d+)/i)?.[1] ?? null;

/** `shared`: institutes in our data citing the same MCC profile; more than one and it may be another institute's. */
function sourceLabel(t: Term, shared: number) {
  if (t.source.name === MCC_PROFILE) {
    const whose = shared > 1 ? `an MCC profile that ${shared} institutes in Seatora's data cite (it may be another institute's)` : null;
    if (t.kind === "BOND") return `Bond document summary on ${whose ?? "the college's MCC profile"}`;
    return whose ? `From ${whose}` : t.kind === "PENALTY" ? "The college's MCC profile" : "Declared by the college to MCC";
  }
  if (t.source.name === "NBEMS notice") return t.kind === "FEE" ? "NBEMS fee notice" : t.kind === "STIPEND" ? "NBEMS stipend notice" : t.source.name;
  if (t.source.url?.includes("nmc.org.in")) return "NMC stipend list";
  return t.source.name;
}

// ponytail: known misreads in the import, until data/curated/terms_structured.json carries the fields as published.
/** MCC profiles whose imported "fee" is the hostel fee (700440: tuition is listed separately, by subject). */
const HOSTEL_FEE = new Set(["700440"]);
/** Leaving texts that mean "the bond amount" ("Bond amount payable if PG course not completed", "Same amount payable…"). */
const SAME_AS_BOND = /^(bond amount|same amount|bond penalty)\b/i;
/** "applies to" names only the courses of one bucket ("MD course at …"): such a bond is not another bucket's. */
const namesOnly = (appliesTo: string | null, bucket: Term["program"]) =>
  !!appliesTo &&
  (bucket === "MD"
    ? /\b(md|ms|mbbs)\b/i.test(appliesTo) && !/\b(dnb|drnb|nbe|diploma|pg)\b/i.test(appliesTo)
    : /\b(dnb|drnb|nbe)\b/i.test(appliesTo) && !/\b(md|ms|pg|degree)\b/i.test(appliesTo));

const notDeclared = (): Bond => ({
  status: "not_declared", years: null, yearsText: null, amounts: [], otherAmounts: false, amount: NONE, leaving: [], leavingAmount: NONE, appliesTo: null, fromAppliesTo: false, text: null, src: null,
});

/**
 * One programme's terms at one college, from the terms of its bucket (MD or DNB). A kind the bucket lacks is taken from
 * the college's other bucket when it comes from an MCC institute profile (the profile is per institute; the import
 * filed it under one bucket), and its source says so. `sharedBy`: institutes citing an MCC profile id.
 */
export function normalizeProgramme(programme: Programme, terms: Term[], sharedBy: (mccId: string) => number = () => 1): ProgrammeTerms {
  const def = programmes[programme];
  const own = terms.filter((t) => t.program === def.bucket);
  const other = terms.filter((t) => t.program !== def.bucket && t.source.name === MCC_PROFILE);
  const get = (k: Term["kind"]) => own.find((t) => t.kind === k) ?? other.find((t) => t.kind === k);
  const sources: TermSource[] = [];
  const srcOf = (t: Term, year: number | null) => {
    const mccId = mccIdOf(t.source.url);
    const shared = mccId ? sharedBy(mccId) : 1;
    const s = { label: sourceLabel(t, shared), url: t.source.url, year, mccId, sharedBy: shared, filedUnder: t.program === def.bucket ? null : bucketName[t.program], type: t.source.type };
    const found = sources.find((x) => x.label === s.label && x.url === s.url && x.year === s.year && x.filedUnder === s.filedUnder);
    if (found) return found.n;
    sources.push({ n: sources.length + 1, ...s });
    return sources.length;
  };
  const unread: ProgrammeTerms["unread"] = [];
  const notes: string[] = [];

  let feeT = get("FEE");
  let stT = get("STIPEND");
  if (!def.figures && (feeT || stT)) {
    notes.push(`The college's MCC profile gives one fee and stipend (shown under MD/MS); none is declared for ${programme}.`);
    feeT = stT = undefined;
  }
  const fee = feeT && parseFee(feeT.text);
  const feeId = feeT && mccIdOf(feeT.source.url);
  let feeFig: Figure | null = null;
  if (feeT && fee && feeId && HOSTEL_FEE.has(feeId))
    unread.push({ kind: "FEE", text: feeT.text, src: srcOf(feeT, fee.year), why: "this is the hostel fee on the MCC profile, which lists tuition separately, by subject" });
  else if (feeT && fee) feeFig = { inr: fee.inr, kind: fee.kind, src: srcOf(feeT, fee.year) };
  else if (feeT) unread.push({ kind: "FEE", text: feeT.text, src: srcOf(feeT, null) });

  const st = stT && parseStipend(stT.text);
  const stSrc = stT && st ? srcOf(stT, st.year) : 0;
  if (stT && !st) unread.push({ kind: "STIPEND", text: stT.text, src: srcOf(stT, null) });
  const stipendAt = (y: number): Figure | null => {
    if (!st) return null;
    const inr = st.allYears ? st.perYear[0] : st.perYear[y - 1];
    return inr == null ? null : { inr, kind: st.kind, src: stSrc };
  };

  const years = Array.from({ length: def.years }, (_, i) => ({ year: i + 1, fee: feeFig, stipend: stipendAt(i + 1) }));

  const bondT = get("BOND");
  let bond = notDeclared();
  if (bondT) {
    const b = parseBond(bondT.text);
    const src = srcOf(bondT, null);
    if (!b) bond = { ...notDeclared(), status: "declared", amount: { ...NONE, state: "words" }, text: bondT.text, src };
    else {
      const otherCourse =
        (def.kind === "super"
          ? !/super[- ]?speciali|\bmch\b|\bdm\b/i.test(b.text)
          : !!b.appliesTo && /super[- ]?speciali/i.test(b.appliesTo) && !/\b(pg|md|ms|degree|diploma|dnb|mbbs)\b/i.test(b.appliesTo)) ||
        (bondT.program !== def.bucket && namesOnly(b.appliesTo, bondT.program));
      const amounts = aiqFirst(forKind(b.amounts, def.kind));
      const yearParts = aiqFirst(forKind(b.yearParts, def.kind));
      const yrs = max(yearParts.map((p) => p.years));
      const amount = amountOf(amounts, yrs);
      const leaving = aiqFirst(forKind(b.leaving, def.kind)).map((p) => (p.inr == null && SAME_AS_BOND.test(p.text) && amount.max != null ? { ...p, inr: amount.max } : p));
      bond = {
        status: otherCourse ? "other_course" : "declared",
        years: yrs,
        yearsText: b.yearsText,
        amounts,
        otherAmounts: amounts.length < b.amounts.length || leaving.length < b.leaving.length,
        amount,
        leaving,
        leavingAmount: amountOf(leaving, null),
        appliesTo: b.appliesTo,
        fromAppliesTo: [...amounts, ...leaving, ...yearParts].some((p) => p.fromAppliesTo),
        text: b.text,
        src,
      };
    }
  }

  const penT = get("PENALTY");
  const pen = penT && parsePenalty(penT.text);
  const resignForfeit: Figure | null = penT && pen ? { inr: pen.inr, kind: "declared", src: srcOf(penT, null) } : null;
  if (penT && !pen) unread.push({ kind: "PENALTY", text: penT.text, src: srcOf(penT, null) });

  return {
    programme,
    durationYears: def.years,
    years,
    feeNote: fee && feeFig ? fee.note : null,
    wholeCourseFee: years.every((y) => y.fee) ? years.reduce((a, y) => a + y.fee!.inr, 0) : null,
    bond,
    resignForfeit,
    unread,
    notes,
    sources,
  };
}

/** The programmes a college offers (from its courses), in the order MD/MS, Diploma, DNB, NBEMS Diploma, MCh, MPH. */
export function programmesOf(degrees: Iterable<string>): Programme[] {
  const have = new Set([...degrees].map(programmeOfDegree));
  return programmeNames.filter((p) => have.has(p));
}

type Index = { degrees: Map<string, Set<string>>; terms: Map<string, Term[]>; sharedBy: (mccId: string) => number; out: Map<string, ProgrammeTerms[]> };
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
    memo.set(cat, (m = { degrees, terms, sharedBy: (id) => byId.get(id)?.size ?? 1, out: new Map() }));
  }
  return m;
}

/** Every programme a college offers, normalized (memoized per catalog). */
export function collegeTerms(cat: Catalog, college: string): ProgrammeTerms[] {
  const m = indexOf(cat);
  let out = m.out.get(college);
  if (!out) {
    const terms = m.terms.get(college) ?? [];
    out = programmesOf(m.degrees.get(college) ?? []).map((p) => normalizeProgramme(p, terms, m.sharedBy));
    m.out.set(college, out);
  }
  return out;
}

/** The terms for one course at a college (its programme). */
export function courseTerms(cat: Catalog, college: string, degree: string): ProgrammeTerms {
  const p = programmeOfDegree(degree);
  const m = indexOf(cat);
  return collegeTerms(cat, college).find((x) => x.programme === p) ?? normalizeProgramme(p, m.terms.get(college) ?? [], m.sharedBy);
}
