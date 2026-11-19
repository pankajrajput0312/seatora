import { z } from "zod";
import { formatInrShort } from "./format";
import { inrL } from "./stat-format";
import { parseSearchParams } from "./params";
import { asCategory, typeCategories, typeCategoryLabel, typesIn, type CollegeType, type TypeCategory } from "../components/institute/college-type";
import { BOND_YEAR_CHOICES, FEE_LAKH_CHOICES, type Profile } from "../profile";
import type { ProgrammeTerms } from "../server/terms";

// The ONE place for the fee, stipend, bond, leaving-penalty and college-type filters: their URL params (shared by
// Options, Seats, Allotments and Fees, page, CSV and JSON API), what they mean in ₹, and the test every list applies to
// a row's course terms (server/terms.ts ProgrammeTerms: the same figures the stat cells and the Fees page show).
//
// Unknown values (not declared, in words only, a bond whose status is unknown, years not stated) never pass a filter
// silently: a row whose filtered value is unknown is left out (and counted: `unknownTerms` on the lists) unless the
// "Include not declared" box is ticked (nd=keep). "No bond" (bondyrs=0) only ever lists a record that says no bond (one
// adding that a state law's service may apply is unknown, as its cells say: listed with nd=keep), and a type filter
// never lists a college with no type in the data, ticked or not: each page says how many it left out (untypedOnly). An NBEMS maximum fee or minimum stipend is not the
// college's figure: inside the cap it passes, outside it the figure is unknown (as a "+ DA" basic stipend under a floor).

export type TypeValue = CollegeType["value"];
/** The filter's values: the six shown types (an old link's stored type, ctype=esic, reads as its type). */
export const typeValues = typeCategories as unknown as [TypeCategory, ...TypeCategory[]];

/**
 * Page params (never a profile key: fee, bond…). Absent = her profile's cap where the page applies her profile
 * (Options, Fees), else no filter; "any" = no cap. `ctype`: repeated (ctype=govt&ctype=esic, what the form sends) or
 * comma-joined.
 */
export const termFilterShape = {
  /** College types (inferred from name and quota, not official), any of. */
  ctype: z.preprocess(
    (v) => {
      const xs = typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : Array.isArray(v) ? v : v;
      return Array.isArray(xs) ? [...new Set(xs.map((x) => asCategory(String(x)) ?? x))] : xs;
    },
    z.array(z.enum(typeValues)).optional(),
  ),
  /** Fee ₹ lakh a year (year 1) at most. */
  maxfee: z.union([z.literal("any"), z.coerce.number().positive().max(1000)]).optional(),
  /** Stipend ₹ a month (year 1) at least. */
  minstip: z.coerce.number().int().positive().max(1000000).optional(),
  /** Bond years at most; 0 = No bond. */
  bondyrs: z.union([z.literal("any"), z.coerce.number().int().min(0).max(20)]).optional(),
  /** Bond ₹ lakh at most (the course's highest bond figure; no bond = 0). */
  maxbond: z.coerce.number().positive().max(100000).optional(),
  /** Leaving penalty ₹ lakh at most (the course's highest). */
  maxleave: z.coerce.number().positive().max(100000).optional(),
  /** keep: rows whose filtered value is not declared pass the caps too ("Include not declared"); absent or hide: left out. */
  nd: z.enum(["keep", "hide"]).optional(),
};
/** List params of the shape (readParams `lists`); optional, `ctype` also reads a single comma-joined value. */
export const termFilterLists = ["ctype"] as const;
export const termParamsSchema = z.object(termFilterShape);
export type TermParams = z.infer<typeof termParamsSchema>;

/**
 * Caps in ₹ on one course's terms. `maxBondYears` 0 = No bond (a record says so, never an unknown one). `keepUnknown`:
 * a capped value that is not declared passes (default: it fails).
 */
export type TermFilters = {
  types?: TypeValue[];
  /** Colleges with no type in the data pass the type check too (never a URL param: what a page counts as "type not known", untypedOnly). */
  untyped?: boolean;
  maxFee?: number | null;
  minStipend?: number | null;
  maxBondYears?: number | null;
  maxBondInr?: number | null;
  maxLeavingInr?: number | null;
  keepUnknown?: boolean;
};

const lakh = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100000));

/** The params as ₹ filters. `profile`: her caps where the page applies her profile (an absent maxfee / bondyrs is hers). */
export function termFilters(f: TermParams, profile?: Pick<Profile, "maxFeeLakh" | "maxBondYears"> | null): TermFilters {
  return {
    types: f.ctype?.length ? f.ctype.flatMap(typesIn) : undefined,
    maxFee: f.maxfee === "any" ? null : lakh(f.maxfee ?? profile?.maxFeeLakh),
    minStipend: f.minstip ?? null,
    maxBondYears: f.bondyrs === "any" ? null : (f.bondyrs ?? profile?.maxBondYears ?? null),
    maxBondInr: lakh(f.maxbond),
    maxLeavingInr: lakh(f.maxleave),
    keepUnknown: f.nd === "keep",
  };
}

/** Pages: the term params of a URL, leniently (a bad one is dropped), and their filters (`profile`: as termFilters). */
export function readTermFilters(p: URLSearchParams, profile?: Pick<Profile, "maxFeeLakh" | "maxBondYears"> | null) {
  const params = parseSearchParams(termParamsSchema, p, termFilterLists);
  return { params, filters: termFilters(params, profile) };
}

/** Her profile's own caps (fee, bond years) as filters: what Options applies when the page sets none. */
export const profileTermFilters = (p: Pick<Profile, "maxFeeLakh" | "maxBondYears">): TermFilters => termFilters({}, p);

export const anyTermFilter = (f: TermFilters | null | undefined) =>
  !!f && (!!f.types?.length || !!f.untyped || [f.maxFee, f.minStipend, f.maxBondYears, f.maxBondInr, f.maxLeavingInr].some((v) => v != null));

/** Whether a college type (null: not in the data) fails the filters' type check: a type filter lists only its types (and with `untyped`, the colleges with none). */
export const typeFails = (type: TypeValue | null | undefined, f: TermFilters) => (!!f.types?.length || !!f.untyped) && (type == null ? !f.untyped : !f.types?.includes(type));

/**
 * The same filters, with a college type picked, turned to the colleges whose type is not known that pass every other
 * filter: what the type filter leaves out unsaid otherwise (each page lists with these and says how many). Null
 * without a type filter.
 */
export const untypedOnly = (f: TermFilters | null | undefined): TermFilters | null => (f?.types?.length ? { ...f, types: [], untyped: true } : null);

/** The number each sort, cap and CSV uses; null = not declared, or declared in words only. Ranges: the highest (cautious) figure. */
export const feeValue = {
  fee1: (t: ProgrammeTerms) => t.years[0]?.fee?.inr ?? null,
  feetotal: (t: ProgrammeTerms) => t.wholeCourseFee,
  stip1: (t: ProgrammeTerms) => t.years[0]?.stipend?.inr ?? null,
  /** 0 = no bond on record, null = not declared or not stated (or "no bond" where a state law's service may still apply). */
  bondyrs: (t: ProgrammeTerms) => t.bond.years,
  /** 0 = no bond on record (as bondyrs). */
  bond: (t: ProgrammeTerms) => (t.bond.status === "none" ? 0 : t.bond.status === "declared" ? t.bond.amount.max : null),
  leave: (t: ProgrammeTerms) => t.bond.leavingAmount.max,
};

/**
 * A computed amount (server/terms.ts formulaAmount) against a cap: an "at most" figure under the cap passes, over it is
 * unknown; an "at least" figure over the cap fails, under it is unknown. An exact computed figure is as a declared one.
 */
function bounded(v: number | null, a: ProgrammeTerms["bond"]["amount"] | null, cap: number | null | undefined): number | null {
  const b = a?.formula?.bound;
  if (v == null || cap == null || !b) return v;
  return (b === "upTo" ? v <= cap : v > cap) ? v : null;
}

/** pass; fail (a known value is outside a cap, "No bond" not on record, no or another type); unknown: passes but for a value not declared. */
export type TermVerdict = "pass" | "fail" | "unknown";

export function termVerdict(t: ProgrammeTerms, type: TypeValue | null | undefined, f: TermFilters): TermVerdict {
  if (typeFails(type, f)) return "fail";
  // "No bond": a record saying so passes, a declared bond fails; one not declared, not read or not clear (or a no-bond
  // record a state law's service may override) is unknown, so "Include not published" lists it, as every other cap.
  if (f.maxBondYears === 0 && t.bond.status === "declared") return "fail";
  const fee = t.years[0]?.fee;
  const s = t.years[0]?.stipend;
  // A stipend range (by subject): its lowest figure meets a floor; a fee range's highest a cap (feeValue). An NBEMS
  // maximum over the cap, or minimum under the floor, says nothing of the college's own figure: unknown. So too a basic
  // stipend "+ DA" under the floor, and a fee whose GST Seatora took off (`declared`) when the cap lies between the two.
  const feeUnsure = f.maxFee != null && !!fee && ((fee.kind === "maximum" && fee.inr > f.maxFee) || (fee.declared != null && fee.inr <= f.maxFee && f.maxFee < fee.declared));
  const stipUnsure = f.minStipend != null && !!s && (s.kind === "minimum" || !!s.plusDa) && s.inr < f.minStipend;
  const checks: [number | null | undefined, number | null, (v: number, cap: number) => boolean][] = [
    [f.maxFee, feeUnsure ? null : feeValue.fee1(t), (v, cap) => v <= cap],
    [f.minStipend, !s || stipUnsure ? null : (s.min ?? s.inr), (v, cap) => v >= cap],
    [f.maxBondYears, feeValue.bondyrs(t), (v, cap) => v <= cap],
    [f.maxBondInr, bounded(feeValue.bond(t), t.bond.status === "declared" ? t.bond.amount : null, f.maxBondInr), (v, cap) => v <= cap],
    [f.maxLeavingInr, bounded(feeValue.leave(t), t.bond.leavingAmount, f.maxLeavingInr), (v, cap) => v <= cap],
  ];
  let unknown = false;
  for (const [cap, v, ok] of checks) {
    if (cap == null) continue;
    if (v == null) unknown = true;
    else if (!ok(v, cap)) return "fail";
  }
  return unknown ? "unknown" : "pass";
}

/** Whether one course's terms (and its college's type) pass the filters: an unknown value only with `keepUnknown`. */
export function termsPass(t: ProgrammeTerms, type: TypeValue | null | undefined, f: TermFilters): boolean {
  const v = termVerdict(t, type, f);
  return v === "pass" || (v === "unknown" && !!f.keepUnknown);
}

/**
 * Rows by the filters: `kept` pass; `unknown` are left out only because a filtered value is not declared (what the
 * "Include not declared" box would add; empty when it is ticked). No filter: every row kept.
 */
export function splitByTerms<T>(rows: T[], f: TermFilters | null | undefined, terms: (x: T) => ProgrammeTerms, type: (x: T) => TypeValue | null | undefined) {
  if (!f || !anyTermFilter(f)) return { kept: rows, unknown: [] as T[] };
  const kept: T[] = [];
  const unknown: T[] = [];
  for (const x of rows) {
    const v = termVerdict(terms(x), type(x), f);
    if (v === "pass" || (v === "unknown" && f.keepUnknown)) kept.push(x);
    else if (v === "unknown") unknown.push(x);
  }
  return { kept, unknown };
}

/** The choices the filter controls offer (TermFilterControls), plus a current value that isn't one of them (withCurrent). */
export const termChoices = {
  maxfee: FEE_LAKH_CHOICES,
  minstip: [40000, 60000, 80000, 100000, 125000],
  bondyrs: BOND_YEAR_CHOICES,
  maxbond: [5, 10, 25, 50],
  maxleave: [1, 5, 10, 25],
};
export const withCurrent = (xs: number[], v: number | null | undefined) => (v != null && !xs.includes(v) ? [...xs, v].sort((a, b) => a - b) : xs);

const lakhText = (v: number) => formatInrShort(v * 100000);
/** Each value as one self-describing phrase (select options and chips). */
export const termValueLabel = {
  maxfee: (v: number) => `Fee up to ${lakhText(v)}/yr`,
  minstip: (v: number) => `Stipend at least ${formatInrShort(v)}/mo`,
  bondyrs: (v: number) => (v === 0 ? "No bond" : `Bond up to ${v} ${v === 1 ? "year" : "years"}`),
  maxbond: (v: number) => `Bond penalty up to ${lakhText(v)}`,
  maxleave: (v: number) => `Leaving penalty up to ${lakhText(v)}`,
};

/**
 * One chip per applied filter value (ActiveFilters: the page builds each href without `key`, or without that one
 * `value` of a list: one chip per college type). A cap that is her profile's has no chip.
 */
export function termChips(f: TermParams): { key: keyof TermParams; label: string; value?: string }[] {
  const out: { key: keyof TermParams; label: string; value?: string }[] = [];
  for (const t of f.ctype ?? []) out.push({ key: "ctype", label: typeCategoryLabel[t], value: t });
  for (const k of ["maxfee", "minstip", "bondyrs", "maxbond", "maxleave"] as const) {
    const v = f[k];
    if (typeof v === "number") out.push({ key: k, label: termValueLabel[k](v) });
  }
  if (f.nd === "keep") out.push({ key: "nd", label: "Including not published" });
  return out;
}

/** Whether a folded control (stipend, bond ₹, leaving, include not declared) is set: MoreFilters `open`. */
export const termMoreOpen = (f: TermParams) => f.minstip != null || f.maxbond != null || f.maxleave != null || f.nd === "keep";

/**
 * Compare's one-line "Lowest risk here": only from the bond and leaving penalties the rows show (feeValue: no bond = 0,
 * not published = unknown, never 0). The lowest bond penalty wins (ties named together), its leaving penalty said beside
 * it; with no bond figure anywhere, the lowest leaving penalty. All unknown, or all none, said plainly.
 */
export function lowestRisk(items: { name: string; t: ProgrammeTerms }[], byLeaving = false): string {
  const xs = items.map((x) => ({ ...x, bond: feeValue.bond(x.t), leave: feeValue.leave(x.t), years: feeValue.bondyrs(x.t) }));
  const money = (n: number) => inrL(n);
  const names = (ys: typeof xs) => ys.map((y) => y.name).join(" and ");
  // `byLeaving` (INI-CET: no bond penalty figure, a leaving penalty everywhere): the leaving penalty that exists decides,
  // each as its range (low and high: "₹3 L within six months, ₹5 L after"); a tie said as one, overlapping ranges as can't tell.
  if (byLeaving && xs.every((x) => x.bond == null) && xs.some((x) => x.leave != null)) {
    const none = xs.filter((x) => x.leave == null);
    if (none.length) return `Can't tell: ${names(none)} ${none.length === 1 ? "publishes" : "publish"} no leaving penalty figure, so there is no fair lowest.`;
    const lo = (x: (typeof xs)[number]) => x.t.bond.leavingAmount.min ?? x.leave!;
    const range = (x: (typeof xs)[number]) => (lo(x) === x.leave ? money(x.leave!) : `${money(lo(x))}–${money(x.leave!)}`);
    // The parts' own words (AIIMS: "₹3 L within six months of joining, ₹5 L after"), from the option's leaving rows: each
    // row "who, when[, more]" ("all, within six months of joining, plus that month's salary") as its amount and when.
    const steps = (x: (typeof xs)[number]) => x.t.bond.leaving.filter((p) => p.inr != null).map((p) => { const w = p.text.split(", "); return `${money(p.inr!)} ${(w[1] ?? w[0]).replace(/^leaving /, "")}`; });
    const words = (x: (typeof xs)[number]) => (steps(x).length > 1 ? steps(x).join(", ") : range(x));
    if (xs.every((x) => lo(x) === lo(xs[0]) && x.leave === xs[0].leave)) {
      if (xs.every((x) => words(x) === words(xs[0]))) return `Leaving penalty: all the same (${words(xs[0])}); none of these publishes a bond penalty figure.`;
      // The same lowest and highest, not the same steps (JIPMER's from depositing the originals): the steps not all have.
      const common = steps(xs[0]).filter((w) => xs.every((x) => steps(x).includes(w)));
      const more = xs.map((x) => ({ x, ws: steps(x).filter((w) => !common.includes(w)) })).filter((m) => m.ws.length);
      return `Leaving penalty: ${range(xs[0])} at each, not in the same steps (${more.map((m) => `${m.x.name} ${common.length ? "also has" : "has"} ${m.ws.join(", ")}`).join("; ")}); none of these publishes a bond penalty figure.`;
    }
    const best = xs.filter((x) => xs.every((y) => lo(x) <= lo(y) && x.leave! <= y.leave!));
    if (!best.length) return `Can't tell: their leaving penalties overlap (${xs.map((x) => `${x.name} ${range(x)}`).join("; ")}), so there is no fair lowest.`;
    return `Lowest leaving penalty here: ${names(best)} (${range(best[0])}); none of these publishes a bond penalty figure.`;
  }
  if (xs.every((x) => x.bond == null && x.leave == null))
    return xs.some((x) => x.years != null)
      ? "Can't tell: no bond penalty or leaving penalty figure is published for these (their bond years are in the table)."
      : "Can't tell: none of these publishes a bond or leaving penalty figure.";
  if (xs.every((x) => x.bond === 0 && x.leave == null)) return "No bond on record at any of these, and no leaving penalty published: nothing here to tell them apart.";
  // A winner only over figures for every option: one with no bond penalty figure is never beaten, nor beats.
  const missing = xs.filter((x) => x.bond == null);
  if (missing.length) return `Can't tell: ${names(missing)} ${missing.length === 1 ? "publishes" : "publish"} no bond penalty figure, so there is no fair lowest.`;
  const leaveText = (l: number | null) => (l == null ? "leaving penalty not published" : `leaving ${money(l)}`);
  const min = Math.min(...xs.map((x) => x.bond!));
  const best = xs.filter((x) => x.bond === min);
  const leaves = [...new Set(best.map((x) => x.leave))];
  return `Lowest risk here: ${names(best)} (${min === 0 ? "no bond" : `bond penalty ${money(min)}`}${leaves.length === 1 ? `, ${leaveText(leaves[0])}` : ""}), from the bond and leaving penalties shown.`;
}
