import { formatINR } from "@/features/cutoffs/lib/format";
import type { Amount, Figure, ProgrammeTerms, TermPart } from "../server/terms";

// The stat cells (Fee | Stipend | Bond | Bond ₹ | Leaving, components/stat-cells.tsx) as plain data, from one course's
// ProgrammeTerms (service courseTerms: that course and quota's fee-table record, its specialty's bond figure).
// Each cell: a short value (cards), a full value (tables), a tiny marker, and the exact words behind its (i) with
// source numbers (ProgrammeTerms.sources n). Missing is "—", never 0 and never "no bond".

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
/** A card's ₹: "₹10k" for whole thousands under ₹1 L, else inrL. */
export const inrCard = (inr: number) => (inr > 0 && inr < 1e5 && inr % 1e3 === 0 ? `₹${inr / 1e3}k` : inrL(inr));
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
   * Tiny warning beside the value, only two: "below NBEMS min" (stipend), "state law may apply" (bond not published).
   * Everything else a value leaves out is said in its (i), never in the cell.
   */
  marker: string | null;
  /** The value is a link (a fee "On college website ↗"). */
  href?: string;
  /** bond: a bond applies (orange); muted: "—", "Not published", a short reason ("Refund stipend", "Not stated"); warn: the marker is a warning. */
  tone: "bond" | "muted" | null;
  markerWarn?: true;
  /** "—": not in the data (screen readers hear it). */
  missing?: true;
  tip: TipLine[];
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
 * of the college's own) and a sum paid at admission get no band.
 */
const FEE_BANDS = { "MD/MS": [1e5, 5e5], Diploma: [1e5, 5e5], DNB: [125000, 125001], "NBEMS Diploma": [125000, 125001] } as const;
export const feeBandText = "MD/MS and Diploma: low under ₹1 L a year, high from ₹5 L. DNB and NBEMS Diploma: low under the NBEMS maximum of ₹1.25 L, high above it.";
const levelOf = (c: StatCell, level: Level | undefined, word: string | undefined): StatCell => (level ? { ...c, level, levelWord: word } : c);

export const NOT_IN_DATA = "Not published.";
const NOT_CHECKED = "Not checked yet: Seatora has no bond record for this programme.";
const DNB_RULE = "NBEMS rule: private DNB hospitals may not take any bond or deposit; government hospitals may apply a state service bond only if they declared it to MCC before counselling.";
const STATE_CAUTION = "Government colleges may still have a state service bond: check the state's PG rules.";
const NBEMS_MAX = "the most NBEMS lets a DNB hospital charge (no GST, paid to the hospital), not the college's own fee";
const NBEMS_MIN = "NBEMS minimum: the hospital must pay at least this; the actual pay may be higher.";
const ABOVE_MAX = "Above the NBEMS maximum: the hospital declared more than NBEMS lets a DNB hospital charge.";
const BELOW_MIN = "Below the NBEMS minimum: the college declared less than NBEMS's minimum stipend";
const SUMMARY_YEARS = "The years are the state's rule as Seatora's summary gives them; the college's own document does not state them.";
const RULE_YEARS = "Years from the state's rule (its order is the source), not the college's own document.";
const MAY_APPLY = "The college's own document says no bond, but a state law's service may apply, so Seatora counts it as unknown.";
/** A document's bond whose years its summary marks as the state's rule ("Service bond: 2 years (state rule) · …"). */
const STATE_YEARS = /^Service bond: [^·;]*\(state rule\)/;
const NMC = "NMC stipend list: one PG figure, not split by year; allowances such as DA may be extra.";
const BASIS = { document: "the college's own document", state_rule: "state rule", nbems_rule: "NBEMS rule" } as const;

const isDnb = (t: ProgrammeTerms) => t.programme === "DNB" || t.programme === "NBEMS Diploma";
const yrs = (n: number) => `${n} ${n === 1 ? "year" : "years"}`;
const sameYears = (text: string, n: number | null) => n != null && text.replace(/\s*years?\.?$/i, "").trim() === String(n);
const dash = (c: Pick<StatCell, "key" | "label" | "about">, tip: TipLine[]): StatCell => ({ ...c, short: "—", full: "—", marker: null, tone: "muted", missing: true, tip });
const words = (c: Pick<StatCell, "key" | "label" | "about">, tip: TipLine[], label: string): StatCell => ({ ...c, short: label, full: label, marker: null, tone: "muted", tip });
const unread = (t: ProgrammeTerms, kind: ProgrammeTerms["unread"][number]["kind"]) => t.unread.find((u) => u.kind === kind);
const asQuote = (u: { text: string; src: number }): TipLine => ({ text: u.text, src: u.src, quote: true });

/** The year lines of a fee or stipend: "Year 2: ₹12,000", "Year 1: up to ₹1,25,000" (NBEMS maximum), "Year 3: not stated". */
const yearLines = (t: ProgrammeTerms, pick: "fee" | "stipend", unit: string): TipLine[] =>
  t.years.map((y) => {
    const f: Figure | null = y[pick];
    const bound = f?.kind === "maximum" ? "up to " : f?.kind === "minimum" ? "at least " : "";
    const declared = f?.declared != null ? ` (declared ${inrFull(f.declared)}; see below)` : "";
    return f ? { text: `Year ${y.year}: ${bound}${inrRange(f.min, f.inr, false)}${f.atAdmission ? " paid at admission" : unit}${declared}`, src: f.src } : { text: `Year ${y.year}: not stated` };
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
    { text: "Read from the MCC profile's own fee words for these seats: the figure, its year and the seat type are stated there. Their exact words:" },
    ...quotes.map(([text, src]) => ({ text, src, quote: true as const })),
    ...t.feeExtras.map((x) => ({ text: `${x.label}: ${inrFull(x.f.inr)}${x.label === "Annual fee" ? " a year" : ""} (as the profile states it).`, src: x.f.src })),
    ...(u ? [{ text: "The profile's whole fee text:" }, asQuote(u)] : []),
  ];
}

/**
 * A fee in words only, as a short reason: "Varies by subject" (words saying it depends on the subject), "On college
 * website ↗" (words pointing to the college's site: the link is the words' own address, else the college's MCC
 * website), a ₹ range the words give, else "Not stated". The words are in the (i).
 */
function feeWords(text: string, website: string | null | undefined): { label: string; href?: string } {
  const url = websiteUrl(text.match(/\b(?:https?:\/\/|www\.)[^\s,;()<>"']+[^\s,;()<>"'.]/i)?.[0]);
  // A ₹ range in the words ("100000 to 4000000 depending upon the specialty", "Rs.3,00,000/- to Rs.48,00,000/-"): shown
  // as the range, never US$ (an NRI line).
  const r = text.replace(/US\$[^|]*/gi, "").match(/(\d[\d,]{4,})\s*(?:\/-)?\s*(?:to|-|–)\s*(?:rs\.?|₹|inr)?\s*(\d[\d,]{4,})/i);
  if (r) {
    const [lo, hi] = [r[1], r[2]].map((x) => Number(x.replace(/,/g, "")));
    if (lo >= 10000 && hi > lo) return { label: `${inrShort(lo)}–${inrShort(hi).replace("₹", "")}/yr`, ...(url && { href: url }) };
  }
  if (/\b(?:by|per|depend\w* on)\b[^.|]{0,20}?\b(?:subject|speciality|specialty|branch|discipline)|(?:subject|speciality|specialty|branch|course)[- ]?wise|var(?:y|ies)|differ/i.test(text))
    return { label: "Varies by subject", ...(url && { href: url }) };
  const href = url ?? (/website|web ?site|\bsite\b|portal|online/i.test(text) ? websiteUrl(website) : null);
  return href ? { label: "On college website ↗", href } : { label: "Not stated" };
}

function feeCell(t: ProgrammeTerms): StatCell {
  const c = { key: "fee", label: statLabel.fee, about: "fee" } as const;
  const f = t.years[0]?.fee;
  const u = unread(t, "FEE");
  if (!t.years.some((y) => y.fee)) {
    if (u) {
      const w = feeWords(u.text, t.website);
      const link: TipLine[] = w.href ? [{ text: w.href.replace(/^https?:\/\/|\/$/g, ""), href: w.href }] : [];
      return { ...words(c, [{ text: "The MCC profile gives this fee in words only (no one figure for this course and seat type), so Seatora shows no figure. Its words:" }, asQuote(u), ...link, ...hostelLines(t)], w.label), ...(w.href && { href: w.href }) };
    }
    return dash(c, t.notes.length ? t.notes.map((text) => ({ text, ...(t.notesSrc != null && { src: t.notesSrc }) })) : [{ text: NOT_IN_DATA }]);
  }
  const max = t.years.some((y) => y.fee?.kind === "maximum");
  const tip: TipLine[] = [
    ...(f?.kind === "maximum" ? [{ text: "NBEMS limit; hospital declared none." }, { text: `Up to ${inrFull(f.inr)} a year: ${NBEMS_MAX}.`, src: f.src }] : []),
    ...(f?.above ? [{ text: ABOVE_MAX, warn: true as const }] : []),
    ...yearLines(t, "fee", " a year"),
    ...(t.wholeCourseFee != null ? [{ text: `Whole course: ${max ? "up to " : ""}${inrFull(t.wholeCourseFee)} total (${t.durationYears} yrs)${max ? " (NBEMS maximum)" : ""}` }] : []),
    ...(f?.min != null ? [{ text: "A range: the fee depends on the subject." }] : []),
    ...(f?.atAdmission ? [{ text: "Paid at admission, not a yearly fee." }] : []),
    ...(f?.declared != null ? [{ text: `GST removed: the college declared ${inrFull(f.declared)}.`, warn: true as const }] : []),
    ...hostelLines(t),
    ...figureNotes(t),
    ...(t.feeNote ? [{ text: t.feeNote }] : []),
    ...textLines(t, u),
  ];
  if (!f) return { ...dash(c, tip), tip: [{ text: "Year 1's fee is not stated." }, ...tip] };
  // "₹1.71 L/yr", "₹15–25 L/yr", a sum paid at admission "₹5 L at admission" (cards too); the NBEMS ceiling "Up to ₹1.25 L" (cards
  // "≤ ₹1.25 L"), never the college's own. No marker: what a figure leaves out is in the (i).
  const v = feeRange(f.min, f.inr);
  const cell: StatCell = {
    ...c,
    short: (f.kind === "maximum" ? "≤ " : "") + v + (f.atAdmission ? " at admission" : ""),
    full: f.kind === "maximum" ? `Up to ${v}` : f.atAdmission ? `${v} at admission` : `${v}/yr`,
    marker: null, tone: null, tip,
  };
  const [low, high] = FEE_BANDS[t.programme as keyof typeof FEE_BANDS] ?? [];
  if (f.kind === "maximum" || f.atAdmission || low == null) return cell;
  const band = f.above || f.inr >= high ? "high" : f.inr < low ? "low" : null;
  if (!band) return cell;
  const word = `${band === "high" ? "High" : "Low"} fee for ${t.programme}`;
  return { ...levelOf(cell, band === "high" ? "heavy" : "good", word), tip: [...tip, { text: `${word} (${feeBandText})` }] };
}

function stipendCell(t: ProgrammeTerms): StatCell {
  const c = { key: "stipend", label: statLabel.stipend, about: "stipend" } as const;
  const s = t.years[0]?.stipend;
  const u = unread(t, "STIPEND");
  if (!s) {
    if (u) return words(c, [{ text: "The stipend is published in words only:" }, asQuote(u)], "Not stated");
    return dash(c, [{ text: t.years.some((y) => y.stipend) ? "Year 1's stipend is not stated." : NOT_IN_DATA }, ...(t.years.some((y) => y.stipend) ? yearLines(t, "stipend", " a month") : [])]);
  }
  const below = t.years.find((y) => y.stipend?.below)?.stipend;
  const tip: TipLine[] = [
    ...yearLines(t, "stipend", " a month"),
    ...(below ? [{ text: below.nbems ? `${BELOW_MIN} of ${inrFull(below.nbems.inr)} a month.` : `${BELOW_MIN}.`, warn: true as const, src: below.nbems?.src }] : []),
    ...(s.plusDa ? [{ text: "Plus DA (dearness allowance), as the college declared." }] : []),
    ...(s.kind === "minimum" ? [{ text: NBEMS_MIN }] : s.kind === "nmc" ? [{ text: NMC }] : []),
  ];
  const min = s.kind === "minimum";
  return levelOf({ ...c, short: min ? `≥ ${inrCard(s.inr)}` : inrShort(s.inr), full: min ? `From ${inrFull(s.inr)}` : inrFull(s.inr), marker: s.below ? "below NBEMS min" : null, ...(s.below && { markerWarn: true as const }), tone: null, tip }, s.below ? "caution" : undefined, "below the NBEMS minimum");
}

/** A bond that is not declared: why ("Not published": the record's words; "—": no record, or a record for other courses). */
function bondMissing(t: ProgrammeTerms, c: Pick<StatCell, "key" | "label" | "about">): StatCell {
  const b = t.bond;
  const doc: TipLine[] = b.doc != null ? [{ text: "The college's own bond document on MCC", src: b.doc }] : [];
  const rules: TipLine[] = isDnb(t) ? [{ text: DNB_RULE, rules: true }] : [{ text: STATE_CAUTION }];
  if (b.status === "other_course") return dash(c, [{ text: `Not published for ${t.programme}: the bond on the college's MCC profile is for other courses.`, src: b.src }, ...rules]);
  if (b.text) {
    // A no-bond document where a state law's service may apply (`caveat`): the Bond cell marks it.
    const law = b.caveat && c.key === "bond";
    return {
      ...c, short: "Not published", full: "Not published", marker: law ? "state law may apply" : null, ...(law && { markerWarn: true as const }), tone: "muted",
      tip: [...(b.caveat ? [{ text: MAY_APPLY, warn: true as const }] : []), { text: b.text, src: b.src }, ...doc, ...(isDnb(t) ? rules.map((r) => ({ ...r, text: "NBEMS bond rules" })) : [])],
    };
  }
  const u = unread(t, "BOND");
  if (u) return words(c, [{ text: "The bond as the MCC profile words it (no verified record yet):" }, asQuote(u)], "Not verified");
  return dash(c, [{ text: NOT_CHECKED }, ...rules]);
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
  const c = { key: "bond", label: statLabel.bond, about: "service bond" } as const;
  const b = t.bond;
  if (b.status === "none") {
    const caveat = !!(b.caveat || b.stateRule);
    return levelOf({ ...c, short: "No bond", full: "No bond", marker: null, tone: null, tip: noBondTip(t) }, caveat ? undefined : "good", undefined);
  }
  if (b.status !== "declared") return bondMissing(t, c);
  const full = b.years == null ? "Years not stated" : b.yearsSum ? `${b.yearsSum} = ${yrs(b.years)}` : yrs(b.years);
  // A document's summary marking its years as the state's rule, with no rule record behind them (Rajasthan).
  const summaryYears = b.basis !== "state_rule" && !b.yearsFrom && !b.stateRule && STATE_YEARS.test(b.text ?? "");
  const long = b.years != null && b.years >= 3;
  return {
    ...c,
    level: long ? "strong" : "caution",
    levelWord: long ? "a bond of 3 years or more" : b.years == null ? "a bond, years not stated" : "a bond of 1 to 2 years",
    short: b.years == null ? "Yes" : `${b.years}Y`,
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
      ...(b.doc != null ? [{ text: "The college's own bond document on MCC", src: b.doc }] : []),
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
  if (/by subject|by specialt/i.test(t)) return "Varies by subject";
  if (/left blank|_{3,}/i.test(t)) return "Amount left blank";
  if (/as per (?:the )?policy|as applicable/i.test(t)) return "As per college policy";
  return /no (?:fixed )?amount|amount not (?:stated|specified)/i.test(t) ? "No amount stated" : "Not stated";
}

/** What a figure leaves out: "₹10,00,000 per year × 3 years, computed", "incl. ₹10,00,000 additional". */
function amountLines(a: Amount, years: number | null, src: number | null = null): TipLine[] {
  return [
    ...formulaLines(a, src),
    ...(a.perYear && years ? [{ text: `${inrFull(a.perYear)} per year × ${years} years, computed by Seatora.` }] : []),
    ...(a.extra ? [{ text: `Includes ${inrFull(a.extra)} owed on top (additional).` }] : []),
    ...(a.varies ? [{ text: "The amount varies by specialty: this is the range over the subjects.", warn: true as const }] : []),
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
const partLines = (parts: TermPart[], src: number | null): TipLine[] => parts.map((p) => ({ text: p.text, src: p.src ?? src }));

function bondInrCell(t: ProgrammeTerms): StatCell {
  const c = { key: "bondInr", label: statLabel.bondInr, about: "bond amount" } as const;
  const b = t.bond;
  if (b.status === "none") return levelOf({ ...c, short: "None", full: "None", marker: null, tone: "muted", tip: [{ text: "No bond, so no bond amount." }, ...noBondTip(t)] }, b.caveat || b.stateRule ? undefined : "good", undefined);
  if (b.status !== "declared") return bondMissing(t, c);
  const a = b.amount;
  const head: TipLine = { text: "What you pay if you do not serve the bond (bond penalty)." };
  const parts = b.amounts.length > 1 || (b.amounts[0] && b.amounts[0].inr !== a.max) ? [{ text: "The bond record:" }, ...partLines(b.amounts, b.src)] : [];
  const other: TipLine[] = b.otherAmounts ? [{ text: "Figures for other courses or quotas are in the bond's own words (the college's Fees tab)." }] : [];
  // The state rule's amounts, as its years (the college's own document is older): cited to the rule.
  const rule = b.amounts.find((p) => p.rule);
  const ruleLine: TipLine[] = rule ? [{ text: "From the state's rule, as the bond years are, not the college's own bond document.", src: rule.src, warn: true }] : [];
  if (a.state === "figure" && a.max != null) {
    const high = a.max >= HIGH_PENALTY;
    return {
      ...c, short: amountValue(a, true), full: amountValue(a, false), marker: null, tone: "bond",
      level: high ? "heavy" : "caution", levelWord: high ? "₹25 L or more" : "a bond amount",
      tip: [head, { text: `${amountValue(a, false, true)} for this course.`, src: rule?.src ?? b.src }, ...ruleLine, ...amountLines(a, b.years, b.src), ...parts, ...other],
    };
  }
  const quote: TipLine[] = b.quote ? [{ text: b.quote, src: b.src, quote: true }] : [];
  if (a.state === "words")
    return words(c, [head, { text: "Declared without a ₹ figure for this course.", src: b.src }, ...partLines(b.amounts, b.src), ...quote, ...formulaLines(a, b.src), ...other], phrase(a, [b.text, b.quote]));
  return dash(c, [head, { text: "Amount not stated in the bond record.", src: b.src }, ...quote, ...other]);
}

function leavingCell(t: ProgrammeTerms): StatCell {
  const c = { key: "leaving", label: statLabel.leaving, about: "leaving penalty" } as const;
  const b = t.bond;
  const a = b.leavingAmount;
  const forfeit: TipLine[] = t.resignForfeit
    ? [{ text: `Separate from it: MCC lets the college keep ${inrFull(t.resignForfeit.inr)} if you resign or don't join from Round 2.`, src: t.resignForfeit.src }]
    : t.resignForfeitText
      ? [{ text: `Separate from it: MCC Round 2 / mop-up forfeit: ${t.resignForfeitText.text}`, src: t.resignForfeitText.src }]
      : [];
  const other: TipLine[] = b.otherPenalties.length ? [{ text: "Other penalties:" }, ...partLines(b.otherPenalties, b.src)] : [];
  const head: TipLine = { text: "The college's or state's penalty for leaving the seat or course after joining." };
  if (!b.leaving.length) {
    // A PENALTY term without its record (an older import), as published; a record's forfeit in words is not this.
    const u = unread(t, "PENALTY");
    if (u) return words(c, [head, { text: "The MCC profile's words:" }, asQuote(u), ...forfeit], "Not stated");
    return dash(c, [head, { text: NOT_IN_DATA }, ...other, ...forfeit]);
  }
  const tip = [head, ...partLines(b.leaving, b.src), ...amountLines(a, null, b.leaving[0]?.src ?? b.src), ...other, ...forfeit];
  if (a.state !== "figure" || a.max == null) return words(c, tip, phrase(a, b.leaving.map((p) => p.text)));
  return levelOf({ ...c, short: amountValue(a, true), full: amountValue(a, false), marker: null, tone: null, tip }, a.max >= HIGH_PENALTY ? "heavy" : undefined, "₹25 L or more");
}

/**
 * Year `year`'s fee or stipend for a table column ("Fee Y2"): the full figure ("₹1,58,000", "≤ ₹1,25,000" for the NBEMS
 * ceiling) with its marker, "—" when not stated; null past the course (a 2-year course has no year 3).
 */
export function yearValue(t: ProgrammeTerms, pick: "fee" | "stipend", year: number): { text: string; marker: string | null } | null {
  if (year > t.durationYears) return null;
  const f = t.years[year - 1]?.[pick];
  if (!f) return { text: "—", marker: null };
  return { text: `${f.kind === "maximum" ? "≤ " : f.kind === "minimum" ? "≥ " : ""}${pick === "fee" ? feeRange(f.min, f.inr) : inrRange(f.min, f.inr, false)}`, marker: f.below ? "below NBEMS min" : null };
}

/** The five cells of one course's terms, in order: Fee, Stipend, Bond, Bond ₹, Leaving. */
export const statCells = (t: ProgrammeTerms): StatCell[] => [feeCell(t), stipendCell(t), bondCell(t), bondInrCell(t), leavingCell(t)];
