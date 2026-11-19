import { formatINR } from "@/features/cutoffs/lib/format";
import type { Amount, Figure, ProgrammeTerms, TermPart } from "../server/terms";
import { authorityOf, profileOf } from "@/features/exams/keys";

// The stat cells (Fee | Stipend | Bond | Bond ₹ | Leaving, components/stat-cells.tsx) as plain data, from one course's
// ProgrammeTerms (service courseTerms: that course and quota's fee-table record, its specialty's bond figure).
// Each cell: a short value (cards), a full value (tables), a tiny marker, and the exact words behind its (i) with
// source numbers (ProgrammeTerms.sources n). Missing data is one of three words (NOT_PUBLISHED, VARIES, "—" for not
// applicable), never 0 and never "no bond".

/** ₹ in full Indian grouping: "₹1,36,008". */
export const inrFull = (inr: number) => formatINR(inr);

/**
 * ₹ short, only where it loses nothing: "₹50 L", "₹1.25 L", "₹1.5 Cr"; under ₹1 L, or any figure the short form would
 * round ("₹1,24,999" never becomes "₹1.25 L", the NBEMS ceiling; "₹99,99,999" never "₹1 Cr"), in full.
 */
export function inrShort(inr: number): string {
  if (inr >= 1e7 && inr % 1e5 === 0) return `₹${inr / 1e7} Cr`;
  if (inr >= 1e5 && inr % 1e3 === 0) return `₹${inr / 1e5} L`;
  return formatINR(inr);
}

/**
 * A fee on a card: "₹1.7 L" (lakh to one decimal; "₹1.25 L" where that is exact), "₹41,000" under ₹1 L. Cards only: the
 * full figure is read out with it, in tables and in the (i).
 */
export function inrApprox(inr: number): string {
  if (inr < 1e5 || inr % 1e3 === 0) return inrShort(inr);
  const [v, u] = inr >= 1e7 ? [inr / 1e7, "Cr"] : [inr / 1e5, "L"];
  return `₹${Number(v.toFixed(1))} ${u}`;
}

/** ₹ in lakh or crore to two decimals, cut not rounded ("₹1.71 L", "₹19.8 L", never "₹1.25 L" for ₹1,24,999); under ₹1 L in full. */
export function inrL(inr: number): string {
  const [v, u] = inr >= 1e7 ? [inr / 1e7, "Cr"] : inr >= 1e5 ? [inr / 1e5, "L"] : [0, ""];
  return u ? `₹${Math.floor(v * 100 + 1e-9) / 100} ${u}` : formatINR(inr);
}
/**
 * One money style on cards for fees, stipends and penalties (Indian notation): lakh / crore from ₹1 L ("₹1.25 L",
 * "₹1.05 L", cut, never rounded up), full grouping under it ("₹43,000"); never "₹43k". Tables and (i)s: inrFull.
 */
export const inrCard = inrL;
/** A fee range: "₹15–25 L" when both are lakh, else "₹50,000–₹1.5 L". */
export function feeRange(min: number | null | undefined, max: number): string {
  if (min == null || min === max) return inrL(max);
  const [a, b] = [inrL(min), inrL(max)];
  return a.endsWith(" L") && b.endsWith(" L") ? `${a.slice(0, -2)}–${b.slice(1)}` : `${a}–${b}`;
}
/**
 * A website as a link: "www.x.in" gets http:// (browsers upgrade it); null for anything that isn't an http(s) address.
 */
export function websiteUrl(w: string | null | undefined): string | null {
  if (!w) return null;
  const u = /^[a-z][a-z\d+.-]*:/i.test(w) ? w : `http://${w}`;
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

/** "₹35 L–₹50 L", or one figure when min is absent or the same. */
export const inrRange = (min: number | null | undefined, max: number, short = true) => {
  const f = short ? inrShort : inrFull;
  return min != null && min !== max ? `${f(min)}–${f(max)}` : f(max);
};

export type StatKey = "fee" | "stipend" | "bond" | "bondInr" | "leaving";
/** Column labels, in cell order (a table's headers). */
export const statLabel: Record<StatKey, string> = { fee: "Fee", stipend: "Stipend", bond: "Bond period", bondInr: "Bond penalty", leaving: "Leaving penalty" };
export const statKeys = Object.keys(statLabel) as StatKey[];
/** One line behind a cell's (i): exact words, the source number it cites. `rules`: cite the NBEMS bond rules. */
export type TipLine = { text: string; src?: number | null; warn?: true; quote?: true; rules?: true; href?: string };
export type StatCell = {
  key: StatKey;
  /** Column / cell label: "Fee". */
  label: string;
  /** The (i) button's name after "About": "fee". */
  about: string;
  short: string;
  full: string;
  /**
   * Tiny note beside the value: a warning, "below NBEMS min" (stipend), and a range's reason, "depends on specialty"
   * (RANGE_HINT), where the data gives it. Everything else a value leaves out is said in its (i), never in the cell.
   */
  marker: string | null;
  /** bond: a bond applies (orange); muted: "Not published", "Not known", a short reason ("Refund stipend"); warn: the marker is a warning. */
  tone: "bond" | "muted" | null;
  markerWarn?: true;
  /** Not published: no document gives it (exports and share text leave it out). */
  missing?: true;
  tip: TipLine[];
  /**
   * Bond, Bond penalty and Leaving: one plain line on what the row's bond and penalties mean for her, before the record's
   * words (the (i) shows `tip` under a "Source" heading after it). From the cells' own fields (bondPlain), never new data.
   */
  lead?: string;
  /** Display colour only (docs/APP_DESIGN_SYSTEM.md "Colour key"), never a new reading; `levelWord` says it in words. */
  level?: Level;
  levelWord?: string;
};

/**
 * The colour of a value: good (green: no bond, a low fee), caution (amber: a bond of 1-2 years or years not stated, a
 * stipend below the NBEMS minimum), strong (orange: a bond of 3 years or more), heavy (red: ₹25 L or more to pay for
 * not serving or for leaving, a high fee). No level: plain ink. Unknown and "—" stay grey (tone "muted").
 */
export type Level = "good" | "caution" | "strong" | "heavy";
/** ₹25 L: from here a bond or leaving amount is "high" (red). */
export const HIGH_PENALTY = 25e5;
/**
 * Fee bands a year, by course type: MD/MS and Diploma low under ₹1 L, high from ₹5 L; DNB and NBEMS Diploma (NBEMS lets a
 * hospital charge at most ₹1.25 L) low under ₹1.25 L, high above it. Between: no colour. An NBEMS maximum (no figure
 * of the college's own) and an amount at admission that is not also every later year's fee (feeBasis) get no band.
 */
const FEE_BANDS = { "MD/MS": [1e5, 5e5], Diploma: [1e5, 5e5], DNB: [125000, 125001], "NBEMS Diploma": [125000, 125001] } as const;
export const feeBandText = "MD/MS and Diploma: low under ₹1 L a year, high from ₹5 L. DNB and NBEMS Diploma: low under the NBEMS maximum of ₹1.25 L, high above it.";
const levelOf = (c: StatCell, level: Level | undefined, word: string | undefined): StatCell => (level ? { ...c, level, levelWord: word } : c);

/**
 * Missing data in three words only, on every screen: NOT_PUBLISHED (no document gives it), VARIES (the document gives a
 * range, or a figure by course: the range is shown when known), and "—" (not applicable: a 2-year course's year 3).
 */
export const NOT_PUBLISHED = "Not published";
export const VARIES = "Varies (see source)";
export const NOT_IN_DATA = `${NOT_PUBLISHED}.`;
/** The three, said once (a page's note or a column's (i)). */
export const MISSING_WORDS = `“${NOT_PUBLISHED}”: no document gives it. “${VARIES}”: the document gives a range or a figure by course (the range is shown when known). “—”: not applicable. Never zero.`;
const NOT_CHECKED = "Not checked yet: Seatora has no bond record for this programme.";
const DNB_RULE = "NBEMS rule: private DNB hospitals may not take any bond or deposit; government hospitals may apply a state service bond only if they declared it to MCC before counselling.";
const STATE_CAUTION = "Government colleges may still have a state service bond: check the state's PG rules.";
const NBEMS_MAX = "the most NBEMS lets a DNB hospital charge (no GST, paid to the hospital), not the college's own fee";
const NBEMS_MIN = "NBEMS minimum: the hospital must pay at least this; the actual pay may be higher.";
const ABOVE_MAX = "Above the NBEMS maximum: the hospital declared more than NBEMS lets a DNB hospital charge.";
const BELOW_MIN = "Below the NBEMS minimum: the college declared less than NBEMS's minimum stipend";
const SUMMARY_YEARS = "The years are the state's rule as Seatora's summary gives them; the college's own document does not state them.";
const RULE_YEARS = "Years from the state's rule (its order is the source), not the college's own document.";
/** A document's bond whose years its summary marks as the state's rule ("Service bond: 2 years (state rule) · …"). */
const STATE_YEARS = /^Service bond: [^·;]*\(state rule\)/;
const NMC = "NMC stipend list: one PG figure, not split by year; allowances such as DA may be extra.";
const BASIS = { document: "the college's own document", state_rule: "state rule", nbems_rule: "NBEMS rule" } as const;

const isDnb = (t: ProgrammeTerms) => t.programme === "DNB" || t.programme === "NBEMS Diploma";
const yrs = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
const sameYears = (text: string, n: number | null) => n != null && text.replace(/\s*years?\.?$/i, "").trim() === String(n);
const notPublished = (c: Pick<StatCell, "key" | "label" | "about">, tip: TipLine[]): StatCell => ({ ...c, short: NOT_PUBLISHED, full: NOT_PUBLISHED, marker: null, tone: "muted", missing: true, tip });
const words = (c: Pick<StatCell, "key" | "label" | "about">, tip: TipLine[], label: string): StatCell => ({ ...c, short: label, full: label, marker: null, tone: "muted", tip });
const unread = (t: ProgrammeTerms, kind: ProgrammeTerms["unread"][number]["kind"]) => t.unread.find((u) => u.kind === kind);
const asQuote = (u: { text: string; src: number }): TipLine => ({ text: u.text, src: u.src, quote: true });

/** The year lines of a fee or stipend: "Year 2: ₹12,000", "Year 1: up to ₹1,25,000" (NBEMS maximum), "Year 3: not stated". */
const yearLines = (t: ProgrammeTerms, pick: "fee" | "stipend", unit: string): TipLine[] =>
  t.years.map((y) => {
    const f: Figure | null = y[pick];
    const bound = f?.kind === "maximum" ? "up to " : f?.kind === "minimum" ? "at least " : "";
    const declared = f?.declared != null ? ` (declared ${inrFull(f.declared)}; see below)` : "";
    return f ? { text: `Year ${y.year}: ${bound}${inrRange(f.min, f.inr, false)}${f.atAdmission ? ", paid at admission" : unit}${declared}`, src: f.src } : { text: `Year ${y.year}: not published` };
  });
/** The record's words on how a figure was read (a GST taken off), once each. */
const figureNotes = (t: ProgrammeTerms): TipLine[] =>
  [...new Map(t.years.flatMap((y) => (y.fee?.note ? [[y.fee.note, y.fee.noteSrc ?? y.fee.src] as const] : []))).entries()].map(([n, src]) => ({ text: n[0].toUpperCase() + n.slice(1), src }));

/** The hostel fee line: "Hostel: ₹50,660 a year", "(included in the fee above)". */
const hostelLines = (t: ProgrammeTerms): TipLine[] => {
  const h = t.hostelFee;
  if (!h) return [];
  const per = h.period === "per_year" ? " a year" : h.period === "per_month" ? " a month" : "";
  return [{ text: `Hostel: ${inrFull(h.inr)}${per}${h.included ? " (included in the fee above)" : ""}.`, src: h.src }];
};
/** Figures read out of the profile's own words: what they are, their exact words, then the record's whole fee text. */
function textLines(t: ProgrammeTerms, u: ReturnType<typeof unread>): TipLine[] {
  const read = [...t.years.map((y) => y.fee), ...t.feeExtras.map((x) => x.f)].filter((f): f is Figure => !!f?.fromText);
  if (!read.length) return [];
  const quotes = [...new Map(read.map((f) => [f.fromText!.quote, f.src])).entries()];
  return [
    { text: `Read from ${profileOf(t.exam)}'s own fee words for these seats: the figure, its year and the seat type are stated there. Their exact words:` },
    ...quotes.map(([text, src]) => ({ text, src, quote: true as const })),
    ...t.feeExtras.map((x) => ({ text: `${x.label}: ${inrFull(x.f.inr)}${x.label === "Annual fee" ? " a year" : ""} (as the profile states it).`, src: x.f.src })),
    ...(u ? [{ text: "The profile's whole fee text:" }, asQuote(u)] : []),
  ];
}

/**
 * A fee in words only: a ₹ range the words give, VARIES (words saying it depends on the subject), else NOT_PUBLISHED
 * (words pointing to the college's site among them). The words are in the (i), with the site's link (`href`: the words'
 * own address, else the college's MCC website) under them.
 */
function feeWords(text: string, website: string | null | undefined): { label: string; href?: string; hint?: string } {
  const url = websiteUrl(text.match(/\b(?:https?:\/\/|www\.)[^\s,;()<>"']+[^\s,;()<>"'.]/i)?.[0]);
  // A ₹ range in the words ("100000 to 4000000 depending upon the specialty", "Rs.3,00,000/- to Rs.48,00,000/-"): shown
  // as the range, never US$ (an NRI line).
  const r = text.replace(/US\$[^|]*/gi, "").match(/(\d[\d,]{4,})\s*(?:\/-)?\s*(?:to|-|–)\s*(?:rs\.?|₹|inr)?\s*(\d[\d,]{4,})/i);
  const varies = /\b(?:by|per|depend\w*(?: up)?on)\b[^.|]{0,20}?\b(?:subject|speciality|specialty|branch|discipline)|(?:subject|speciality|specialty|branch|course)[- ]?wise|var(?:y|ies)|differ/i.test(text);
  if (r) {
    const [lo, hi] = [r[1], r[2]].map((x) => Number(x.replace(/,/g, "")));
    if (lo >= 10000 && hi > lo) return { label: `${feeRange(lo, hi)}/yr`, ...(url && { href: url }), ...(varies && { hint: RANGE_HINT }) };
  }
  if (varies) return { label: VARIES, ...(url && { href: url }) };
  const href = url ?? (/website|web ?site|\bsite\b|portal|online/i.test(text) ? websiteUrl(website) : null);
  return { label: NOT_PUBLISHED, ...(href && { href }) };
}

/**
 * How a fee figure is shown, stated once (the cell): "yearly" ("₹1.25 L/yr"): a fee a year, including MCC's "At
 * admission" amount when every later year is the same yearly figure (year 1's is paid at admission; CIHSR: ₹1,25,000 at
 * admission, then ₹1,25,000 a year, ₹3,75,000 for the course); "admission" ("₹1.25 L at admission (Year 1)"): the
 * amount at admission, with later years different or not stated. MCC's form never says an amount at admission is
 * one-time, so no screen says "not a yearly fee". The whole course is "₹3.75 L for the course".
 */
export function feeBasis(t: Pick<ProgrammeTerms, "years" | "programme" | "exam">): "yearly" | "admission" | "year1" | null {
  const f = t.years[0]?.fee;
  if (!f) return null;
  const later = t.years.slice(1).map((y) => y.fee);
  // NEET MDS / SS: year 1's figure when a later year states another ("₹60,000 (Year 1)", then ₹10,000 a year), never "/yr".
  if (!f.atAdmission) return (OTHER_EXAM.has(t.programme) || !!t.exam) && later.some((g) => g && (g.inr !== f.inr || g.min !== f.min)) ? "year1" : "yearly";
  return later.length && later.every((g) => g && !g.atAdmission && g.inr === f.inr && g.min === f.min && g.kind === f.kind) ? "yearly" : "admission";
}
/**
 * The fee a year, the one every sort, comparison and "cheapest" reads: year 1's when it is a yearly figure (feeBasis);
 * else the later years' (an amount at admission, or a Year 1 figure that differs, is said beside it, never sorted as the
 * yearly fee); null when there is none (an amount at admission alone).
 */
export function yearlyFee(t: Pick<ProgrammeTerms, "years" | "programme" | "exam">): Figure | null {
  const f = t.years[0]?.fee;
  if (!f) return null;
  return feeBasis(t) === "yearly" ? f : (t.years.slice(1).find((y) => y.fee && !y.fee.atAdmission)?.fee ?? null);
}

/** "On MCC" after a college's own document (NEET PG, SS, MDS: MCC hosts it); INI-CET's are its own. */
const onBy = (t: Pick<ProgrammeTerms, "exam">) => (authorityOf(t.exam) === "MCC" ? " on MCC" : "");
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** NEET MDS and NEET SS programmes (their MCC institute profiles), where the cells' MDS / SS fixes apply. */
const OTHER_EXAM = new Set<string>(["MDS", "DM/MCh", "DrNB SS"]);
const PER = { yearly: "/yr", admission: " at admission (Year 1)", year1: " (Year 1)" } as const;
/** Why a ₹ range is a range, when the data says so (a fee or amount priced by specialty): the cell's hint. */
export const RANGE_HINT = VARIES;

function feeCell(t: ProgrammeTerms): StatCell {
  const c = { key: "fee", label: statLabel.fee, about: "fee" } as const;
  const f = t.years[0]?.fee;
  const u = unread(t, "FEE");
  if (!t.years.some((y) => y.fee)) {
    if (u) {
      const w = feeWords(u.text, t.website);
      const link: TipLine[] = w.href ? [{ text: w.href.replace(/^https?:\/\/|\/$/g, ""), href: w.href }] : [];
      return { ...words(c, [{ text: `${cap(profileOf(t.exam))} gives this fee in words only (no one figure for this course and seat type), so Seatora shows no figure. Its words:` }, asQuote(u), ...link, ...hostelLines(t)], w.label), ...(w.hint && { marker: w.hint }) };
    }
    return notPublished(c, t.notes.length ? t.notes.map((text) => ({ text, ...(t.notesSrc != null && { src: t.notesSrc }) })) : [{ text: NOT_IN_DATA }]);
  }
  const max = t.years.some((y) => y.fee?.kind === "maximum");
  const tip: TipLine[] = [
    ...(f?.kind === "maximum" ? [{ text: "NBEMS limit; hospital declared none." }, { text: `Up to ${inrFull(f.inr)} a year: ${NBEMS_MAX}.`, src: f.src }] : []),
    ...(f?.above ? [{ text: ABOVE_MAX, warn: true as const }] : []),
    ...yearLines(t, "fee", " a year"),
    ...(t.wholeCourseFee != null ? [{ text: `For the whole course: ${max ? "up to " : ""}${inrFull(t.wholeCourseFee)} (${yrs(t.durationYears)})${max ? " (NBEMS maximum)" : ""}` }] : []),
    ...(f?.min != null ? [{ text: "A range: the fee depends on the specialty (subject)." }] : []),
    // The amount at admission with no later year stated: MCC's form gives only that (never "one-time" or "yearly").
    ...(f?.atAdmission && t.years.slice(1).some((y) => !y.fee) ? [{ text: `${t.exam === "ini-cet" ? "The prospectus" : "MCC's form"} gives the amount paid at admission (Year 1); it does not state the later years' fees.` }] : []),
    ...(f?.declared != null ? [{ text: `GST removed: the college declared ${inrFull(f.declared)}.`, warn: true as const }] : []),
    ...hostelLines(t),
    ...figureNotes(t),
    ...(t.feeNote ? [{ text: t.feeNote }] : []),
    ...textLines(t, u),
  ];
  if (!f) return { ...notPublished(c, tip), tip: [{ text: "Year 1's fee is not published." }, ...tip] };
  // A year's fee says so, cards too: "₹1.71 L/yr", "₹15–25 L/yr"; an amount at admission only "₹5 L at admission (Year 1)"
  // (feeBasis); the NBEMS ceiling "Up to ₹1.25 L/yr" (cards "≤ ₹1.25 L/yr"), never the college's own. A range's marker
  // says why it is one; everything else a figure leaves out is in the (i).
  const basis = feeBasis(t)!;
  // An amount at admission or a Year 1 figure that differs, with a yearly figure after it: the yearly one is the fee,
  // the first year's said under it ("₹5 L at admission (Year 1)"), never the other way round.
  const y = basis === "yearly" ? f : yearlyFee(t);
  const g = y ?? f;
  const v = feeRange(g.min, g.inr);
  const per = y ? PER.yearly : PER[basis];
  const first = y && y !== f ? `${feeRange(f.min, f.inr)}${PER[basis]}` : null;
  const cell: StatCell = {
    ...c,
    short: (g.kind === "maximum" ? "≤ " : "") + v + per,
    full: (g.kind === "maximum" ? "Up to " : "") + v + per,
    marker: first ?? (g.min != null || g.varies ? VARIES : null), tone: null, tip,
  };
  // Fee bands are NEET PG's course types: another exam's figures have none (INI-CET's MD/MS too).
  const [low, high] = t.exam ? [] : (FEE_BANDS[t.programme as keyof typeof FEE_BANDS] ?? []);
  if (g.kind === "maximum" || !y || low == null) return cell;
  const band = g.above || g.inr >= high ? "high" : g.inr < low ? "low" : null;
  if (!band) return cell;
  const word = `${band === "high" ? "High" : "Low"} fee for ${t.programme}`;
  return { ...levelOf(cell, band === "high" ? "heavy" : "good", word), tip: [...tip, { text: `${word} (${feeBandText})` }] };
}

function stipendCell(t: ProgrammeTerms): StatCell {
  const c = { key: "stipend", label: statLabel.stipend, about: "stipend" } as const;
  const s = t.years[0]?.stipend;
  const u = unread(t, "STIPEND");
  if (!s) {
    if (u) return words(c, [{ text: "The stipend is published in words only:" }, asQuote(u)], NOT_PUBLISHED);
    return notPublished(c, [{ text: t.years.some((y) => y.stipend) ? "Year 1's stipend is not published." : NOT_IN_DATA }, ...(t.years.some((y) => y.stipend) ? yearLines(t, "stipend", " a month") : [])]);
  }
  const below = t.years.find((y) => y.stipend?.below)?.stipend;
  const tip: TipLine[] = [
    ...yearLines(t, "stipend", " a month"),
    ...(below ? [{ text: below.nbems ? `${BELOW_MIN} of ${inrFull(below.nbems.inr)} a month.` : `${BELOW_MIN}.`, warn: true as const, src: below.nbems?.src }] : []),
    // INI-CET: the entry pay plus NPA and allowances (its record's basis); every other exam's words as before.
    ...(t.exam === "ini-cet" ? (s.plus ? [{ text: `Plus ${s.plus === "NPA/DA" ? "NPA and DA (allowances)" : s.plus} on top of this pay, as the prospectus prints it.` }] : []) : s.plusDa ? [{ text: "Plus DA (dearness allowance), as the college declared." }] : []),
    ...(s.kind === "minimum" ? [{ text: NBEMS_MIN }] : s.kind === "nmc" ? [{ text: NMC }] : []),
  ];
  // Always a month, one money style: "₹35,000/mo", "₹1.05 L/mo", "≥ ₹43,000/mo" (full: "From ₹43,000/mo").
  const min = s.kind === "minimum";
  return levelOf({ ...c, short: `${min ? "≥ " : ""}${inrCard(s.inr)}/mo`, full: `${min ? "From " : ""}${inrFull(s.inr)}/mo`, marker: s.below ? "below NBEMS min" : t.exam === "ini-cet" && s.plus ? `+ ${s.plus}` : null, ...(s.below && { markerWarn: true as const }), tone: null, tip }, s.below ? "caution" : undefined, "below the NBEMS minimum");
}

/**
 * A DNB / DrNB seat whose hospital declared no bond to MCC, where NBEMS's own rule binds it: its accreditation bulletin
 * (2025, para 5.10: only a government hospital may run a service bond, and only one it declared to the counselling
 * authority before counselling) means none can be imposed this session. "No bond declared", with the rule in its (i), and
 * in the No bond filter. NEET PG: the checked record cites that rule ("can't be imposed"); NEET SS: every DrNB SS seat
 * whose record is "not declared" (MCC lists no bond document and the profile states none; not unread, not unclear, no
 * caveat). MCC's own bulletins (PG 2026, SS 2025, MDS 2026) and AIIMS's prospectus state no such rule, so an MD/MS, D.M.
 * / M.Ch., MDS or INI-CET seat with nothing declared stays "Not known".
 */
export const noneDeclared = (t: Pick<ProgrammeTerms, "programme" | "bond">) =>
  t.bond.status === "not_declared" && !t.bond.caveat && !t.bond.why &&
  ((isDnb(t as ProgrammeTerms) && /\bcan(?:'|’|no)t be imposed\b/i.test(t.bond.text ?? "")) || (t.programme === "DrNB SS" && !!t.bond.text));
/** The words for a noneDeclared bond, in every cell, card, filter and Fees tab. */
export const NONE_DECLARED = "No bond declared";
/** Why a noneDeclared bond is no bond: NBEMS's rule, as its (i) and the Fees tab say it. */
export const noneDeclaredWhy = (by: string) => `The hospital declared no bond to ${by}, and NBEMS lets a DNB / DrNB hospital impose only a bond it declared before counselling (NBEMS accreditation bulletin, para 5.10), so none can be imposed this session.`;
/** An unread bond document's record words as one line: why it isn't read ("a scanned image"), none when they only say "not read". */
export function unreadWhy(text: string | null): string | null {
  const m = /not read: (.+?); see the document/i.exec(text ?? "");
  return !m ? text : m[1].trim() === "not read" ? null : `Why it isn't read: ${m[1].trim()}.`;
}

/**
 * The bond in one of three plain states, the same words in every cell, card, (i), filter and Fees tab: "No bond" (a
 * document says none), a stated bond ("2 years", "Bond, years not stated"), or this: no document, one Seatora couldn't
 * read, a blank form, nothing declared (bondUnknownWhy says which, in the (i)).
 */
export const NOT_KNOWN = "Not known";
/** Why a bond is "Not known", in one plain sentence (the bond row's (i) and the Fees tab); null when it is known (no bond, or stated). */
export function bondUnknownWhy(t: Pick<ProgrammeTerms, "programme" | "bond" | "exam" | "unread">): string | null {
  const b = t.bond;
  if (b.status === "none" || b.status === "declared") return null;
  const by = authorityOf(t.exam);
  if (noneDeclared(t)) return null; // "No bond declared": known, by NBEMS's rule
  if (b.why === "unread") return `Its bond document on ${by} is a scan or a filled-in form Seatora couldn't read: read it there before you lock your choices.`;
  if (b.status === "other_course") return `The bond ${t.exam === "ini-cet" ? `in ${profileOf(t.exam)}` : "on the college's MCC profile"} is for other courses, not ${t.programme}.`;
  if (b.text) {
    if (b.caveat) return "Its document says no bond, but a state law's service may still apply.";
    if (b.why === "unclear" && t.exam === "ini-cet") return "The prospectus states no service bond after the course (the residency contract and its leaving penalty are not one).";
    if (b.why === "unclear") return /\bblank form\b/i.test(b.text) ? "The college's bond form is blank." : "Its bond document doesn't clearly state a bond.";
    return `No bond is declared to ${by}, and no document of the college's says “no bond”.`;
  }
  if (t.unread.some((u) => u.kind === "BOND")) return `Not verified yet: Seatora has the bond only in ${profileOf(t.exam)}'s words.`;
  return "Seatora has no bond record for this programme yet.";
}

/** A bond that is not known: "Not known" (bondUnknownWhy, the row's plain line, says why), and the records and documents behind it. */
function bondMissing(t: ProgrammeTerms, c: Pick<StatCell, "key" | "label" | "about">): StatCell {
  const b = t.bond;
  const doc: TipLine[] = b.doc != null ? [{ text: `The college's own bond document${onBy(t)}`, src: b.doc }] : [];
  const rules: TipLine[] = isDnb(t) ? [{ text: DNB_RULE, rules: true }] : [{ text: STATE_CAUTION }];
  const u = !b.text && b.status !== "other_course" ? unread(t, "BOND") : undefined;
  const tip: TipLine[] =
    b.why === "unread" ? [...(unreadWhy(b.text) ? [{ text: unreadWhy(b.text)!, src: b.src }] : []), ...doc]
    : b.status === "other_course" ? [{ text: `Not published for ${t.programme}.`, src: b.src }, ...rules]
    : b.text ? [{ text: b.text, src: b.src }, ...doc, ...(isDnb(t) ? [{ text: "NBEMS bond rules", rules: true as const }] : [])]
    : u ? [{ text: `The bond as ${profileOf(t.exam)} words it (no verified record yet):` }, asQuote(u)]
    : [{ text: NOT_CHECKED }, ...rules];
  // No record (or one for other courses): "Not known" for her, and still nothing published (exports leave it out).
  return { ...words(c, tip, NOT_KNOWN), ...(!b.text && !u && { missing: true as const }) };
}

/** "No bond": the basis, the record's words and what it is unsure of (a private status inferred from the name, a state rule beside it). */
function noBondTip(t: ProgrammeTerms): TipLine[] {
  const b = t.bond;
  return [
    { text: `No bond (${BASIS[b.basis ?? "document"]}).`, src: b.src, ...(b.basis === "nbems_rule" && { rules: true as const }) },
    ...(b.text ? [{ text: b.text, src: b.src }] : []),
    ...(b.caveat ? [{ text: b.basis === "nbems_rule" ? `Seatora's check: ${b.caveat}.` : `${b.caveat}.`, warn: true as const }] : []),
    ...(b.stateRule ? [{ text: `A state rule may apply: ${b.stateRule}`, warn: true as const }] : []),
  ];
}

function bondCell(t: ProgrammeTerms): StatCell {
  const b = t.bond;
  const c = { key: "bond", label: statLabel.bond, about: b.toComplete ? "bond to complete the course" : "service bond" } as const;
  if (b.status === "none") {
    const caveat = !!(b.caveat || b.stateRule);
    return levelOf({ ...c, short: "No bond", full: "No bond", marker: null, tone: null, tip: noBondTip(t) }, caveat ? undefined : "good", undefined);
  }
  // No bond declared, where NBEMS's rule lets none be imposed this session: as good as no bond, said as it is.
  if (noneDeclared(t)) return levelOf({ ...c, short: NONE_DECLARED, full: NONE_DECLARED, marker: null, tone: null, tip: [{ text: noneDeclaredWhy(authorityOf(t.exam)), rules: true }, { text: b.text!, src: b.src }, ...(b.doc != null ? [{ text: `The college's own bond document${onBy(t)}`, src: b.doc }] : [])] }, "good", undefined);
  if (b.status !== "declared") return bondMissing(t, c);
  // A stated bond: its years, or "Bond, years not stated" (never read as no answer).
  const full = b.years == null ? "Bond, years not stated" : b.yearsSum ? `${b.yearsSum} = ${yrs(b.years)}` : yrs(b.years);
  // A document's summary marking its years as the state's rule, with no rule record behind them (Rajasthan).
  const summaryYears = b.basis !== "state_rule" && !b.yearsFrom && !b.stateRule && STATE_YEARS.test(b.text ?? "");
  const long = b.years != null && b.years >= 3;
  return {
    ...c,
    level: long ? "strong" : "caution",
    levelWord: long ? "a bond of 3 years or more" : b.years == null ? "a bond, years not stated" : "a bond of 1 to 2 years",
    short: b.years == null ? "Bond" : `${b.years}Y`,
    full,
    marker: null,
    tone: "bond",
    tip: [
      { text: b.text ?? `Service bond: ${full}.`, src: b.src },
      ...(b.yearsText && !sameYears(b.yearsText, b.years) ? [{ text: `Years as written: ${b.yearsText}` }] : []),
      ...(b.basis === "state_rule" ? [{ text: "From the state's rule (its order is the source), not the college's own bond document.", warn: true as const }] : []),
      ...(b.yearsFrom ? [{ text: RULE_YEARS, warn: true as const, src: b.amounts.find((p) => p.rule)?.src }] : []),
      ...(summaryYears ? [{ text: SUMMARY_YEARS, warn: true as const }] : []),
      ...(b.basis !== "state_rule" && b.stateRule ? [{ text: `State rule as well: ${b.stateRule}` }] : []),
      ...(b.appliesTo ? [{ text: `Applies to: ${b.appliesTo}`, src: b.src }] : []),
      ...(b.doc != null ? [{ text: `The college's own bond document${onBy(t)}`, src: b.doc }] : []),
    ],
  };
}

/** A formula amount (server/terms.ts formulaAmount): the record's words it read, then how Seatora computed it or why not. */
const formulaLines = (a: Amount, src: number | null): TipLine[] =>
  a.formula ? [{ text: "The record's words:" }, ...a.formula.words.map((text) => ({ text, src, quote: true as const })), { text: a.formula.text, ...(a.formula.bound && { warn: true as const }) }] : [];
/**
 * The short phrase for an amount in words only (at most ~18 characters; the words are in the (i)): the formula's
 * ("Refund stipend", "Rest of course fee"), a state rule's ("No money penalty", "Per state rule"), else what the words say.
 */
function phrase(a: Amount, texts: (string | null | undefined)[]): string {
  if (a.formula?.label) return a.formula.label;
  const t = texts.filter(Boolean).join(" ");
  if (/^State rule/.test(t)) return /\bno money penalty\b/i.test(t) ? "No money penalty" : "Per state rule";
  if (/by subject|by specialt/i.test(t)) return VARIES;
  // No figure (none written, a blank left in the form, "as per policy"): one word for it everywhere.
  return NOT_PUBLISHED;
}

/** What a figure leaves out: "₹10,00,000 per year × 3 years, computed", "incl. ₹10,00,000 additional". */
function amountLines(a: Amount, years: number | null, src: number | null = null): TipLine[] {
  return [
    ...formulaLines(a, src),
    ...(a.perYear && years ? [{ text: `${inrFull(a.perYear)} per year × ${years} years, computed by Seatora.` }] : []),
    ...(a.extra ? [{ text: `Includes ${inrFull(a.extra)} owed on top (additional).` }] : []),
    ...(a.varies ? [{ text: "The amount varies by specialty: this is the range over the subjects (see the source for yours).", warn: true as const }] : []),
    ...(a.more ? [{ text: a.state === "words" ? "In words only (no ₹ figure)." : "Part of it is in words only (no ₹ figure)." }] : []),
  ];
}
// A computed formula's bound: "≤ ₹3.75 L" (at most), "≥ ₹18 L" (at least).
const BOUND = { upTo: "≤ ", atLeast: "≥ " } as const;
// A range (₹10 L plus a stipend received by the date of leaving: "₹10 L–₹38 L") says its own bounds. Conditions in
// words beside a figure: "₹10,000+" (cards "₹10k+"). No marker: the working and the words are in the (i).
// `exact` (the (i)): full Indian grouping, "up to".
const amountValue = (a: Amount, short: boolean, exact = false) => {
  const f = exact ? inrFull : short ? inrCard : inrL;
  const v = a.min != null && a.min !== a.max ? `${f(a.min)}–${f(a.max!)}` : f(a.max!);
  return `${a.perYear ? (exact ? "up to " : "≤ ") : a.formula?.bound && (a.min == null || a.min === a.max) ? BOUND[a.formula.bound] : ""}${v}${a.more && !exact ? "+" : ""}`;
};
/** A ₹ range priced by specialty says so beside it; any other range's reason is in its (i) (the record's words). */
const rangeHint = (a: Amount) => (a.varies && a.min != null && a.min !== a.max ? RANGE_HINT : null);
const partLines = (parts: TermPart[], src: number | null): TipLine[] => parts.map((p) => ({ text: p.text, src: p.src ?? src }));

function bondInrCell(t: ProgrammeTerms): StatCell {
  const c = { key: "bondInr", label: statLabel.bondInr, about: "bond amount" } as const;
  const b = t.bond;
  // Ink with a caveat (as the Bond cell's "No bond" beside it), green without: one colour per row.
  if (b.status === "none") return levelOf({ ...c, short: "None", full: "None", marker: null, tone: b.caveat || b.stateRule ? null : "muted", tip: [{ text: "No bond, so no bond amount." }, ...noBondTip(t)] }, b.caveat || b.stateRule ? undefined : "good", undefined);
  if (noneDeclared(t)) return levelOf({ ...c, short: "None", full: "None", marker: null, tone: "muted", tip: [{ text: "No bond declared, so no bond amount." }, { text: noneDeclaredWhy(authorityOf(t.exam)), rules: true }, { text: b.text!, src: b.src }] }, "good", undefined);
  if (b.status !== "declared") return bondMissing(t, c);
  const a = b.amount;
  const head: TipLine = { text: b.toComplete ? "What you pay if you leave before completing the course (bond penalty)." : "What you pay if you do not serve the bond (bond penalty)." };
  const parts = b.amounts.length > 1 || (b.amounts[0] && b.amounts[0].inr !== a.max) ? [{ text: "The bond record:" }, ...partLines(b.amounts, b.src)] : [];
  const other: TipLine[] = b.otherAmounts ? [{ text: "Figures for other courses or quotas are in the bond's own words (the college's Fees tab)." }] : [];
  // The state rule's amounts, as its years (the college's own document is older): cited to the rule.
  const rule = b.amounts.find((p) => p.rule);
  const ruleLine: TipLine[] = rule ? [{ text: "From the state's rule, as the bond years are, not the college's own bond document.", src: rule.src, warn: true }] : [];
  if (a.state === "figure" && a.max != null) {
    const high = a.max >= HIGH_PENALTY;
    return {
      ...c, short: amountValue(a, true), full: amountValue(a, false), marker: rangeHint(a), tone: "bond",
      level: high ? "heavy" : "caution", levelWord: high ? "₹25 L or more" : "a bond amount",
      tip: [head, { text: `${amountValue(a, false, true)} for this course.`, src: rule?.src ?? b.src }, ...ruleLine, ...amountLines(a, b.years, b.src), ...parts, ...other],
    };
  }
  const quote: TipLine[] = b.quote ? [{ text: b.quote, src: b.src, quote: true }] : [];
  if (a.state === "words")
    return words(c, [head, { text: "Declared without a ₹ figure for this course.", src: b.src }, ...partLines(b.amounts, b.src), ...quote, ...formulaLines(a, b.src), ...other], phrase(a, [b.text, b.quote]));
  return words(c, [head, { text: "Amount not published in the bond record.", src: b.src }, ...quote, ...other], NOT_PUBLISHED);
}

/** A penalty about leaving the seat or course (an "other" penalty of the record: a ban, a debarment). */
const LEAVING_WORDS = /\bleav(?:e|es|ing)\b|\bresign|\bdiscontinu|\bquit/i;
/** Such a rule's short phrase: "Barred next year" (a debarment from the next admission), else "Rule (see source)". */
const ruleWords = (text: string) => (/\bdebar|\bbarred\b|\bban(?:ned)?\b|not (?:be )?(?:allowed|eligible)/i.test(text) ? "Barred next year" : "Rule (see source)");

/** No leaving penalty, but a rule for leaving among the other penalties: its short phrase ("Barred next year"), else null. */
export function leavingRule(t: Pick<ProgrammeTerms, "bond">): string | null {
  const rule = !t.bond.leaving.length && t.bond.otherPenalties.find((p) => p.inr == null && LEAVING_WORDS.test(p.text));
  return rule ? ruleWords(rule.text) : null;
}

function leavingCell(t: ProgrammeTerms): StatCell {
  const c = { key: "leaving", label: statLabel.leaving, about: "leaving penalty" } as const;
  const b = t.bond;
  const a = b.leavingAmount;
  // INI-CET: AIIMS's round rules, each in its own words (never MCC's Round 2 forfeit).
  const forfeit: TipLine[] = t.roundRules
    ? [{ text: `Separate from it, ${authorityOf(t.exam)}'s round rules:` }, ...partLines(t.roundRules, b.src)]
    : t.resignForfeit
    ? [{ text: `Separate from it: ${authorityOf(t.exam)} lets the college keep ${inrFull(t.resignForfeit.inr)} if you resign or don't join from Round 2.`, src: t.resignForfeit.src }]
    : t.resignForfeitText
      ? [{ text: `Separate from it: ${authorityOf(t.exam)} Round 2 / mop-up forfeit: ${t.resignForfeitText.text}`, src: t.resignForfeitText.src }]
      : [];
  const other: TipLine[] = b.otherPenalties.length ? [{ text: "Other penalties:" }, ...partLines(b.otherPenalties, b.src)] : [];
  const head: TipLine = { text: "The college's or state's penalty for leaving the seat or course after joining." };
  if (!b.leaving.length) {
    // A PENALTY term without its record (an older import), as published; a record's forfeit in words is not this.
    const u = unread(t, "PENALTY");
    if (u) return words(c, [head, { text: `${cap(profileOf(t.exam))}'s words:` }, asQuote(u), ...forfeit], NOT_PUBLISHED);
    // No leaving penalty, but a rule for leaving among the other penalties (Saifai: barred from next year's admission): the rule, never "—".
    const rule = b.otherPenalties.find((p) => p.inr == null && LEAVING_WORDS.test(p.text));
    if (rule) return { ...words(c, [head, ...other, ...forfeit], ruleWords(rule.text)), tone: null };
    return notPublished(c, [head, { text: NOT_IN_DATA }, ...other, ...forfeit]);
  }
  const tip = [head, ...partLines(b.leaving, b.src), ...amountLines(a, null, b.leaving[0]?.src ?? b.src), ...other, ...forfeit];
  if (a.state !== "figure" || a.max == null) return words(c, tip, phrase(a, b.leaving.map((p) => p.text)));
  // Priced from a fee that is a range across courses (no fee of this course's own): the dearest course's, not this one's.
  const range = a.formula && t.years.find((y) => y.fee?.min != null)?.fee;
  // The range over the courses (the fee's own range, scaled), named for what it is: "Full course fee ≈ ₹18 L–₹1.65 Cr".
  if (range) {
    const lo = Math.round((a.max * range.min!) / range.inr);
    const what = (/figures: ([^:]+):/.exec(a.formula!.text)?.[1] ?? "Course fee").replace(/^Whole\b/, "Full");
    const v = `≈ ${inrCard(lo)}–${inrCard(a.max)}`;
    return levelOf({ ...c, short: v, full: `${what} ${v}`, marker: null, tone: null, tip: [head, { text: `It is priced from the course fee, and this course has no fee of its own here (${profileOf(t.exam)} gives ${feeRange(range.min!, range.inr)}/yr across courses), so it depends on your course: from about ${inrFull(lo)} (the cheapest course's) to ${inrFull(a.max)} (the dearest course's).`, warn: true }, ...tip.slice(1)] }, a.max >= HIGH_PENALTY ? "heavy" : undefined, "₹25 L or more");
  }
  return levelOf({ ...c, short: amountValue(a, true), full: amountValue(a, false), marker: rangeHint(a), tone: null, tip }, a.max >= HIGH_PENALTY ? "heavy" : undefined, "₹25 L or more");
}

/**
 * Year `year`'s fee or stipend for a table column ("Fee Y2"): the full figure ("₹1,58,000", "≤ ₹1,25,000" for the NBEMS
 * ceiling) with its marker, NOT_PUBLISHED when not published; null past the course (a 2-year course has no year 3: "—").
 */
export function yearValue(t: ProgrammeTerms, pick: "fee" | "stipend", year: number): { text: string; marker: string | null } | null {
  if (year > t.durationYears) return null;
  const f = t.years[year - 1]?.[pick];
  if (!f) return { text: NOT_PUBLISHED, marker: null };
  return { text: `${f.kind === "maximum" ? "≤ " : f.kind === "minimum" ? "≥ " : ""}${pick === "fee" ? feeRange(f.min, f.inr) : inrRange(f.min, f.inr, false)}`, marker: f.below ? "below NBEMS min" : null };
}

/**
 * One plain line for the bond row, from the same fields the cells read: "Leave after joining: ₹5 L. Skip the 2 years'
 * service: ₹40 L. The years are written more than one way (2 (2018 GO); attached bond form says 1): confirm with the
 * college." A conflict in the record (years written two ways) is said plainly, never resolved.
 */
export function bondPlain(t: ProgrammeTerms): string {
  const b = t.bond;
  const money = (a: Amount, words: (string | null | undefined)[]) => (a.state === "figure" && a.max != null ? amountValue(a, true) : a.state === "words" ? phrase(a, words).toLowerCase() : "amount not published");
  const rule = !b.leaving.length && b.otherPenalties.find((p) => p.inr == null && LEAVING_WORDS.test(p.text));
  const leave = b.leaving.length ? money(b.leavingAmount, b.leaving.map((p) => p.text)) : rule ? ruleWords(rule.text).toLowerCase() : "not published";
  const parts = [`Leave after joining: ${leave}.`];
  if (b.status === "declared") {
    parts.push(b.toComplete ? `Bond to complete the course: ${money(b.amount, [b.text, b.quote])}.` : `Skip ${b.years == null ? "the bond's" : `the ${yrs(b.years)}'`} service: ${money(b.amount, [b.text, b.quote])}.`);
    if (b.yearsText && !sameYears(b.yearsText, b.years)) parts.push(`The years are written more than one way (${b.yearsText}): confirm with the college.`);
    if (b.basis === "state_rule" || b.yearsFrom) parts.push("Years from the state's rule, not the college's own bond document: confirm with the college.");
  } else if (b.status === "none") parts.push(b.caveat || b.stateRule ? "No bond on record, with a caveat (below): confirm with the college." : "No bond: no service to serve, nothing to pay for one.");
  else if (noneDeclared(t)) parts.push("No bond declared, so none can be imposed this session (NBEMS rule).");
  else {
    const why = bondUnknownWhy(t)!;
    parts.push(`Bond not known. ${why}`);
  }
  return parts.join(" ");
}

const LEVELS: Level[] = ["good", "caution", "strong", "heavy"];

/** The plain cost line's parts, in its order (a card's one line: costLine). */
export const costKeys = ["fee", "stipend", "bond", "leaving"] as const;
export type CostKey = (typeof costKeys)[number];
const lc = (s: string) => s[0].toLowerCase() + s.slice(1);
/**
 * An option's cost in one plain line, from its cells (never a new reading), each part where the data has it: "3-year
 * fee ₹1.26 L · stipend ₹1.06 L/mo · bond 2 yr or ₹40 L · leaving: barred next year". The whole course's fee where
 * every year is published (else the fee a year); `level`: the part's strongest colour.
 */
export function costLine(t: ProgrammeTerms, cells: StatCell[] = statCells(t)): Partial<Record<CostKey, { text: string; level?: Level }>> {
  const at = (k: StatKey) => cells.find((c) => c.key === k)!;
  const [fee, stipend, bond, inr, leaving] = statKeys.map(at);
  const max = t.years.some((y) => y.fee?.kind === "maximum");
  const money = (c: StatCell) => c.tone !== "muted" && c.short.includes("₹");
  const strongest = (cs: StatCell[]) => LEVELS.findLast((l) => cs.some((c) => c.level === l));
  const bondText =
    bond.tone === "bond" ? `${bond.short === "Bond" ? lc(bond.full) : `bond ${bond.short.replace(/Y$/, " yr")}`}${money(inr) ? ` or ${inr.short}` : ""}` : bond.short === NOT_KNOWN ? "bond not known" : lc(bond.short);
  const out: Partial<Record<CostKey, { text: string; level?: Level }>> = {
    ...(t.wholeCourseFee != null ? { fee: { text: `${t.durationYears}-year fee ${max ? "≤ " : ""}${inrCard(t.wholeCourseFee)}`, level: fee.level } } : !fee.missing && { fee: { text: `fee ${fee.tone === "muted" ? lc(fee.short) : fee.short}`, level: fee.level } }),
    ...(!stipend.missing && { stipend: { text: `stipend ${stipend.tone === "muted" ? lc(stipend.short) : stipend.short}`, level: stipend.level } }),
    bond: { text: bondText, level: strongest([bond, ...(money(inr) ? [inr] : [])]) },
    ...(!leaving.missing && { leaving: { text: `leaving: ${money(leaving) ? leaving.short : lc(leaving.short)}`, level: leaving.level } }),
  };
  return out;
}

/**
 * "Be careful", from the cells' own values and colours (never a new reading): a bond or leaving penalty of ₹25 L or more,
 * a bond of 3 years or more, or a bond that is Not known (ask the college). Each reason in words; empty when none.
 */
export function beCareful(cells: StatCell[]): string[] {
  const at = (k: StatKey) => cells.find((c) => c.key === k)!;
  const [bond, inr, leaving] = [at("bond"), at("bondInr"), at("leaving")];
  return [
    bond.level === "strong" && `bond ${bond.full}`,
    inr.level === "heavy" && `bond penalty ${inr.short}`,
    leaving.level === "heavy" && `leaving penalty ${leaving.short}`,
    bond.short === NOT_KNOWN && "bond not known: ask the college",
  ].filter((x): x is string => !!x);
}

/** The five cells of one course's terms, in order: Fee, Stipend, Bond, Bond ₹, Leaving (the bond three lead with bondPlain). */
export function statCells(t: ProgrammeTerms): StatCell[] {
  const lead = bondPlain(t);
  return [feeCell(t), stipendCell(t), ...[bondCell(t), bondInrCell(t), leavingCell(t)].map((c) => ({ ...c, lead }))];
}
