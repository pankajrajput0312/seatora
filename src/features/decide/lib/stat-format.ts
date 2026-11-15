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

/** "₹35 L–₹50 L", or one figure when min is absent or the same. */
export const inrRange = (min: number | null | undefined, max: number, short = true) => {
  const f = short ? inrShort : inrFull;
  return min != null && min !== max ? `${f(min)}–${f(max)}` : f(max);
};

export type StatKey = "fee" | "stipend" | "bond" | "bondInr" | "leaving";
/** Column labels, in cell order (a table's headers). */
export const statLabel: Record<StatKey, string> = { fee: "Fee", stipend: "Stipend", bond: "Bond", bondInr: "Bond ₹", leaving: "Leaving" };
export const statKeys = Object.keys(statLabel) as StatKey[];
/** One line behind a cell's (i): exact words, the source number it cites. `rules`: cite the NBEMS bond rules. */
export type TipLine = { text: string; src?: number | null; warn?: true; quote?: true; rules?: true };
export type StatCell = {
  key: StatKey;
  /** Column / cell label: "Fee". */
  label: string;
  /** The (i) button's name after "About": "fee". */
  about: string;
  short: string;
  full: string;
  /** Tiny text beside the value: "max", "min", "state rule", "by specialty"… */
  marker: string | null;
  /** bond: a bond applies (orange); muted: "—", "Not declared", "See text"; warn: the marker is a caveat. */
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

export const NOT_IN_DATA = "Not in Seatora's MCC data yet.";
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
const words = (c: Pick<StatCell, "key" | "label" | "about">, tip: TipLine[], label = "See text"): StatCell => ({ ...c, short: label, full: label, marker: null, tone: "muted", tip });
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

function feeCell(t: ProgrammeTerms): StatCell {
  const c = { key: "fee", label: statLabel.fee, about: "fee" } as const;
  const f = t.years[0]?.fee;
  const u = unread(t, "FEE");
  if (!t.years.some((y) => y.fee)) {
    if (u) return words(c, [{ text: "The MCC profile gives this fee in words only (no one figure for this course and seat type), so Seatora shows no figure. Its words:" }, asQuote(u), ...hostelLines(t)], "In words");
    return dash(c, t.notes.length ? t.notes.map((text) => ({ text, ...(t.notesSrc != null && { src: t.notesSrc }) })) : [{ text: NOT_IN_DATA }]);
  }
  const max = t.years.some((y) => y.fee?.kind === "maximum");
  const tip: TipLine[] = [
    ...(f?.kind === "maximum" ? [{ text: `Up to ${inrFull(f.inr)} a year: ${NBEMS_MAX}.`, src: f.src }] : []),
    ...(f?.above ? [{ text: ABOVE_MAX, warn: true as const }] : []),
    ...yearLines(t, "fee", " a year"),
    ...(t.wholeCourseFee != null ? [{ text: `Whole course: ${max ? "up to " : ""}${inrFull(t.wholeCourseFee)} total (${t.durationYears} yrs)${max ? " (NBEMS maximum)" : ""}` }] : []),
    ...(f?.min != null ? [{ text: "A range: the fee depends on the subject." }] : []),
    ...hostelLines(t),
    ...figureNotes(t),
    ...(t.feeNote ? [{ text: t.feeNote }] : []),
    ...textLines(t, u),
  ];
  if (!f) return { ...dash(c, tip), tip: [{ text: "Year 1's fee is not stated." }, ...tip] };
  const own = [f.atAdmission && "at admission", f.declared != null && "GST removed", f.fromText && "see text"].filter(Boolean).join(" · ") || null;
  const marker = f.above ? ["above NBEMS max", f.fromText && "see text"].filter(Boolean).join(" · ") : f.kind === "maximum" ? "NBEMS max" : own;
  const warn = f.above || f.declared != null;
  // "₹1,71,462/yr" (a sum paid at admission has its marker instead); the NBEMS ceiling "≤ ₹1,25,000/yr", never the college's own.
  const bound = f.kind === "maximum" ? "≤ " : "";
  const unit = f.atAdmission ? "" : "/yr";
  const cell: StatCell = {
    ...c,
    short: bound + (f.min != null ? inrRange(f.min, f.inr) : inrApprox(f.inr)),
    full: `${bound}${inrRange(f.min, f.inr, false)}${unit}`,
    marker, ...(warn && { markerWarn: true as const }), tone: null, tip,
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
    if (u) return words(c, [{ text: "The stipend as published:" }, asQuote(u)]);
    return dash(c, [{ text: t.years.some((y) => y.stipend) ? "Year 1's stipend is not stated." : NOT_IN_DATA }, ...(t.years.some((y) => y.stipend) ? yearLines(t, "stipend", " a month") : [])]);
  }
  const below = t.years.find((y) => y.stipend?.below)?.stipend;
  const tip: TipLine[] = [
    ...yearLines(t, "stipend", " a month"),
    ...(below ? [{ text: below.nbems ? `${BELOW_MIN} of ${inrFull(below.nbems.inr)} a month.` : `${BELOW_MIN}.`, warn: true as const, src: below.nbems?.src }] : []),
    ...(s.plusDa ? [{ text: "Plus DA (dearness allowance), as the college declared." }] : []),
    ...(s.kind === "minimum" ? [{ text: NBEMS_MIN }] : s.kind === "nmc" ? [{ text: NMC }] : []),
  ];
  const marker = s.below ? "below NBEMS min" : s.kind === "minimum" ? "min" : s.kind === "nmc" ? "NMC list" : s.plusDa ? "+ DA" : null;
  return levelOf({ ...c, short: inrShort(s.inr), full: inrFull(s.inr), marker, ...(s.below && { markerWarn: true as const }), tone: null, tip }, s.below ? "caution" : undefined, "below the NBEMS minimum");
}

/** A bond that is not declared: why ("Not declared": the record's words; "—": no record, or a record for other courses). */
function bondMissing(t: ProgrammeTerms, c: Pick<StatCell, "key" | "label" | "about">): StatCell {
  const b = t.bond;
  const doc: TipLine[] = b.doc != null ? [{ text: "The college's own bond document on MCC", src: b.doc }] : [];
  const rules: TipLine[] = isDnb(t) ? [{ text: DNB_RULE, rules: true }] : [{ text: STATE_CAUTION }];
  if (b.status === "other_course") return dash(c, [{ text: `Not declared for ${t.programme}: the bond on the college's MCC profile is for other courses.`, src: b.src }, ...rules]);
  if (b.text) {
    // A no-bond document where a state law's service may apply (`caveat`): the Bond cell marks it.
    const law = b.caveat && c.key === "bond";
    return {
      ...c, short: "Not declared", full: "Not declared", marker: law ? "state law may apply" : null, ...(law && { markerWarn: true as const }), tone: "muted",
      tip: [...(b.caveat ? [{ text: MAY_APPLY, warn: true as const }] : []), { text: b.text, src: b.src }, ...doc, ...(isDnb(t) ? rules.map((r) => ({ ...r, text: "NBEMS bond rules" })) : [])],
    };
  }
  const u = unread(t, "BOND");
  if (u) return words(c, [{ text: "The bond as published (no verified record yet):" }, asQuote(u)]);
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
    const marker = caveat ? "caveat" : b.basis === "nbems_rule" ? "NBEMS rule" : null;
    return levelOf({ ...c, short: "No bond", full: "No bond", marker, ...(caveat && { markerWarn: true as const }), tone: null, tip: noBondTip(t) }, caveat ? undefined : "good", undefined);
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
    marker: b.basis === "state_rule" || b.yearsFrom || summaryYears ? "state rule" : b.stateRule ? "+ state rule" : null,
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

/** What a figure leaves out: "₹10,00,000 per year × 3 years, computed", "incl. ₹10,00,000 additional". */
function amountLines(a: Amount, years: number | null): TipLine[] {
  return [
    ...(a.perYear && years ? [{ text: `${inrFull(a.perYear)} per year × ${years} years, computed by Seatora.` }] : []),
    ...(a.extra ? [{ text: `Includes ${inrFull(a.extra)} owed on top (additional).` }] : []),
    ...(a.varies ? [{ text: "The amount varies by specialty: this is the range over the subjects.", warn: true as const }] : []),
    ...(a.more ? [{ text: a.state === "words" ? "In words only (no ₹ figure)." : "Part of it is in words only (no ₹ figure)." }] : []),
  ];
}
const amountValue = (a: Amount, short: boolean) => `${a.perYear ? "up to " : ""}${inrRange(a.min, a.max!, short)}`;
const amountMarker = (a: Amount) => (a.varies ? "by specialty" : a.perYear ? "computed" : a.extra ? "incl. additional" : a.more ? "+ words" : null);
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
      ...c, short: amountValue(a, true), full: amountValue(a, false), marker: amountMarker(a) ?? (rule ? "state rule" : null), tone: "bond",
      level: high ? "heavy" : "caution", levelWord: high ? "₹25 L or more" : "a bond amount",
      tip: [head, { text: `${amountValue(a, false)} for this course.`, src: rule?.src ?? b.src }, ...ruleLine, ...amountLines(a, b.years), ...parts, ...other],
    };
  }
  const quote: TipLine[] = b.quote ? [{ text: b.quote, src: b.src, quote: true }] : [];
  if (a.state === "words") return words(c, [head, { text: "Declared without a ₹ figure for this course.", src: b.src }, ...partLines(b.amounts, b.src), ...quote, ...other]);
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
    if (u) return words(c, [head, { text: "As published:" }, asQuote(u), ...forfeit]);
    return dash(c, [head, { text: NOT_IN_DATA }, ...other, ...forfeit]);
  }
  const tip = [head, ...partLines(b.leaving, b.src), ...amountLines(a, null), ...other, ...forfeit];
  if (a.state !== "figure" || a.max == null) return words(c, tip);
  return levelOf({ ...c, short: amountValue(a, true), full: amountValue(a, false), marker: amountMarker(a), tone: null, tip }, a.max >= HIGH_PENALTY ? "heavy" : undefined, "₹25 L or more");
}

/**
 * Year `year`'s fee or stipend for a table column ("Fee Y2"): the full figure ("₹1,58,000", "≤ ₹1,25,000" for the NBEMS
 * ceiling) with its marker, "—" when not stated; null past the course (a 2-year course has no year 3).
 */
export function yearValue(t: ProgrammeTerms, pick: "fee" | "stipend", year: number): { text: string; marker: string | null } | null {
  if (year > t.durationYears) return null;
  const f = t.years[year - 1]?.[pick];
  if (!f) return { text: "—", marker: null };
  const marker = f.kind === "maximum" ? "NBEMS max" : f.kind === "minimum" ? "min" : f.atAdmission ? "at admission" : f.fromText ? "see text" : f.above ? "above NBEMS max" : null;
  return { text: `${f.kind === "maximum" ? "≤ " : ""}${inrRange(f.min, f.inr, false)}`, marker };
}

/** The five cells of one course's terms, in order: Fee, Stipend, Bond, Bond ₹, Leaving. */
export const statCells = (t: ProgrammeTerms): StatCell[] => [feeCell(t), stipendCell(t), bondCell(t), bondInrCell(t), leavingCell(t)];
