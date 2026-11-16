import { describe, expect, it } from "vitest";
import type { Amount, Bond, Figure, ProgrammeTerms } from "../server/terms";
import { anyTermFilter, lowestRisk, readTermFilters, splitByTerms, termChips, termFilters, termMoreOpen, termParamsSchema, termsPass, termVerdict } from "./term-filters";

const none: Amount = { state: "none", min: null, max: null, perYear: null, varies: false, more: false, extra: null };
const amt = (max: number, min = max): Amount => ({ ...none, state: "figure", min, max });
const fig = (inr: number, more: Partial<Figure> = {}): Figure => ({ inr, kind: "declared", src: 1, ...more });
const bond = (b: Partial<Bond>): Bond => ({
  status: "not_declared", basis: null, stateRule: null, years: null, yearsSum: null, yearsText: null, amounts: [], otherAmounts: false, amount: none, leaving: [], leavingAmount: none,
  otherPenalties: [], appliesTo: null, text: null, quote: null, caveat: null, src: null, doc: null, ...b,
});
const terms = (fee: Figure | null, stipend: Figure | null, b: Partial<Bond> = {}): ProgrammeTerms => ({
  programme: "MD/MS", durationYears: 3, years: [{ year: 1, fee, stipend }, { year: 2, fee: null, stipend: null }, { year: 3, fee: null, stipend: null }],
  feeNote: null, wholeCourseFee: null, hostelFee: null, feeExtras: [], bond: bond(b), resignForfeit: null, unread: [], notes: [], sources: [],
});

// A government college with a declared ₹2 L fee, ₹1 L stipend, a 1-year ₹20 L bond and a ₹5 L leaving penalty.
const known = terms(fig(200000), fig(100000), { status: "declared", basis: "document", years: 1, amount: amt(2000000), leavingAmount: amt(500000) });
const noBond = terms(fig(50000), fig(80000), { status: "none", basis: "document", years: 0 });
const blank = terms(null, null);

describe("params", () => {
  it("parse leniently: lakh and ₹ values, any, repeated or comma-joined types; a bad value is dropped, the rest kept", () => {
    const p = new URLSearchParams("ctype=govt,esic&ctype=deemed&maxfee=5&minstip=80000&bondyrs=0&maxbond=10&maxleave=2.5&nd=keep");
    const { params, filters } = readTermFilters(p);
    // An old link's stored type (esic) reads as its shown type (Govt); the filter compares every stored type in it.
    expect(params).toEqual({ ctype: ["govt", "deemed"], maxfee: 5, minstip: 80000, bondyrs: 0, maxbond: 10, maxleave: 2.5, nd: "keep" });
    expect(filters).toEqual({ types: ["govt", "municipal", "central", "esic", "railway", "deemed"], maxFee: 500000, minStipend: 80000, maxBondYears: 0, maxBondInr: 1000000, maxLeavingInr: 250000, keepUnknown: true });
    expect(readTermFilters(new URLSearchParams("ctype=govt&ctype=castle&maxfee=-1&bondyrs=2")).params).toEqual({ bondyrs: 2 });
    expect(readTermFilters(new URLSearchParams("")).filters).toEqual({ types: undefined, maxFee: null, minStipend: null, maxBondYears: null, maxBondInr: null, maxLeavingInr: null, keepUnknown: false });
  });

  it("strictly (the API): a bad value is an error", () => {
    expect(termParamsSchema.safeParse({ ctype: "govt,castle" }).success).toBe(false);
    expect(termParamsSchema.safeParse({ minstip: "lots" }).success).toBe(false);
    expect(termParamsSchema.safeParse({ ctype: ["govt"], maxfee: "any", bondyrs: "any" }).success).toBe(true);
  });

  it("her profile's caps apply when the page leaves them absent; any clears them; the rest are never hers", () => {
    const caps = { maxFeeLakh: 10, maxBondYears: 2 };
    expect(termFilters({}, caps)).toMatchObject({ maxFee: 1000000, maxBondYears: 2 });
    expect(termFilters({ maxfee: "any", bondyrs: "any" }, caps)).toMatchObject({ maxFee: null, maxBondYears: null });
    expect(termFilters({ maxfee: 5, bondyrs: 0 }, caps)).toMatchObject({ maxFee: 500000, maxBondYears: 0 });
    expect(anyTermFilter(termFilters({}))).toBe(false);
    expect(anyTermFilter(termFilters({ ctype: ["govt"] }))).toBe(true);
    expect(anyTermFilter(termFilters({ nd: "keep" }))).toBe(false);
  });

  it("chips name each applied value; termMoreOpen opens the fold for a folded one", () => {
    expect(termChips({ ctype: ["govt", "public_sector"], maxfee: 5, bondyrs: 0, nd: "keep" }).map((c) => c.label)).toEqual(["Govt", "Public Sector", "Fee up to ₹5 L/yr", "No bond", "Including not published"]);
    expect(termChips({ maxfee: "any" })).toEqual([]);
    expect(termMoreOpen({ maxfee: 5 })).toBe(false);
    expect(termMoreOpen({ maxleave: 5 })).toBe(true);
  });
});

describe("filters", () => {
  it("college type: any of the ticked; a college with no type never passes", () => {
    expect(termVerdict(known, "govt", { types: ["govt", "esic"] })).toBe("pass");
    expect(termVerdict(known, "private", { types: ["govt"] })).toBe("fail");
    expect(termsPass(known, null, { types: ["govt"], keepUnknown: true })).toBe(false);
  });

  it("fee per year: year 1 at most; a range by its highest; an NBEMS maximum passes under the cap, is unknown over it", () => {
    expect(termVerdict(known, null, { maxFee: 200000 })).toBe("pass");
    expect(termVerdict(known, null, { maxFee: 199999 })).toBe("fail");
    expect(termVerdict(terms(fig(500000, { min: 100000 }), null), null, { maxFee: 300000 })).toBe("fail");
    const ceiling = terms(fig(125000, { kind: "maximum" }), null);
    expect(termVerdict(ceiling, null, { maxFee: 200000 })).toBe("pass");
    // The most NBEMS allows is not her fee: it may be lower. Left out unless "Include not declared".
    expect(termVerdict(ceiling, null, { maxFee: 100000 })).toBe("unknown");
    expect(termsPass(ceiling, null, { maxFee: 100000, keepUnknown: true })).toBe(true);
    // Seatora took the GST off a declared ₹1,47,500: a cap between the two is unknown; under both a fail, over both a pass.
    const gst = terms(fig(125000, { declared: 147500 }), null);
    expect(termVerdict(gst, null, { maxFee: 130000 })).toBe("unknown");
    expect(termVerdict(gst, null, { maxFee: 120000 })).toBe("fail");
    expect(termVerdict(gst, null, { maxFee: 150000 })).toBe("pass");
  });

  it("stipend per month: year 1 at least; a range by its lowest; an NBEMS minimum passes over the floor, is unknown under it", () => {
    expect(termVerdict(known, null, { minStipend: 100000 })).toBe("pass");
    expect(termVerdict(known, null, { minStipend: 100001 })).toBe("fail");
    expect(termVerdict(terms(null, fig(120000, { min: 60000 })), null, { minStipend: 80000 })).toBe("fail");
    const floor = terms(null, fig(43000, { kind: "minimum" }));
    expect(termVerdict(floor, null, { minStipend: 40000 })).toBe("pass");
    expect(termVerdict(floor, null, { minStipend: 60000 })).toBe("unknown");
    // A declared figure under the floor is known: it fails.
    expect(termVerdict(terms(null, fig(35000, { below: true })), null, { minStipend: 40000 })).toBe("fail");
    // A basic stipend "+ DA" under the floor: the pay with DA may meet it, so unknown; over it, it passes.
    const da = terms(null, fig(55200, { plusDa: true }));
    expect(termVerdict(da, null, { minStipend: 60000 })).toBe("unknown");
    expect(termVerdict(da, null, { minStipend: 40000 })).toBe("pass");
  });

  it("bond years at most; No bond (0) only where a record says no bond", () => {
    expect(termVerdict(known, null, { maxBondYears: 1 })).toBe("pass");
    expect(termVerdict(known, null, { maxBondYears: 0 })).toBe("fail");
    expect(termVerdict(noBond, null, { maxBondYears: 0 })).toBe("pass");
    expect(termVerdict(noBond, null, { maxBondYears: 3 })).toBe("pass");
  });

  it("bond ₹ at most: the course's highest figure; no bond on record is ₹0", () => {
    expect(termVerdict(known, null, { maxBondInr: 2000000 })).toBe("pass");
    expect(termVerdict(known, null, { maxBondInr: 1000000 })).toBe("fail");
    expect(termVerdict(noBond, null, { maxBondInr: 100000 })).toBe("pass");
  });

  it("a computed amount: an exact one as a figure; 'at most' passes under the cap, else unknown; 'at least' fails over it, else unknown", () => {
    const f = (bound: "upTo" | "atLeast" | null): Amount => ({ ...amt(1500000), formula: { text: "Computed", bound, words: [] } });
    const t = (bound: "upTo" | "atLeast" | null) => terms(null, null, { status: "declared", basis: "document", years: 1, amount: f(bound), leavingAmount: f(bound) });
    expect([2e6, 1e6].map((cap) => termVerdict(t(null), null, { maxBondInr: cap, maxLeavingInr: cap }))).toEqual(["pass", "fail"]);
    expect([2e6, 1e6].map((cap) => termVerdict(t("upTo"), null, { maxLeavingInr: cap }))).toEqual(["pass", "unknown"]);
    expect([2e6, 1e6].map((cap) => termVerdict(t("atLeast"), null, { maxBondInr: cap }))).toEqual(["unknown", "fail"]);
  });

  it("leaving penalty ₹ at most", () => {
    expect(termVerdict(known, null, { maxLeavingInr: 500000 })).toBe("pass");
    expect(termVerdict(known, null, { maxLeavingInr: 100000 })).toBe("fail");
  });

  it("every filter together; a known failure beats an unknown value", () => {
    const all = { types: ["govt" as const], maxFee: 300000, minStipend: 90000, maxBondYears: 2, maxBondInr: 2500000, maxLeavingInr: 500000 };
    expect(termVerdict(known, "govt", all)).toBe("pass");
    expect(termVerdict(terms(fig(900000), null), "govt", all)).toBe("fail");
  });
});

describe("unknown values", () => {
  it("never pass a cap silently: left out unless keepUnknown", () => {
    for (const f of [{ maxFee: 500000 }, { minStipend: 50000 }, { maxBondYears: 2 }, { maxBondInr: 1000000 }, { maxLeavingInr: 1000000 }]) {
      expect(termVerdict(blank, null, f)).toBe("unknown");
      expect(termsPass(blank, null, f)).toBe(false);
      expect(termsPass(blank, null, { ...f, keepUnknown: true })).toBe(true);
    }
  });

  it("a fee in words only, a bond declared without years or ₹, and an unknown bond status are unknown", () => {
    const words = terms(null, null, { status: "declared", basis: "document", years: null, amount: { ...none, state: "words" } });
    expect(termVerdict(words, null, { maxBondYears: 3 })).toBe("unknown");
    expect(termVerdict(words, null, { maxBondInr: 5000000 })).toBe("unknown");
    expect(termVerdict(terms(null, null, { status: "not_declared", text: "Not clear" }), null, { maxBondYears: 1 })).toBe("unknown");
    // No bond, but a state law's service may still apply (server/terms.ts: not_declared with its caveat): years and ₹ not known.
    const caveat = terms(null, null, { status: "not_declared", years: null, text: "No bond; Karnataka law: 1 yr service may apply", caveat: "Karnataka law: 1 yr service may apply" });
    expect(termVerdict(caveat, null, { maxBondInr: 100000 })).toBe("unknown");
  });

  it("No bond never lists an unknown bond, ticked or not; a no-bond record where a state law may apply is unknown", () => {
    expect(termVerdict(blank, null, { maxBondYears: 0 })).toBe("fail");
    expect(termsPass(blank, null, { maxBondYears: 0, keepUnknown: true })).toBe(false);
    const caveat = terms(null, null, { status: "not_declared", years: null, text: "No bond; Karnataka law: 1 yr service may apply", caveat: "Karnataka law: 1 yr service may apply" });
    expect(termVerdict(caveat, null, { maxBondYears: 0 })).toBe("unknown");
    expect(termVerdict(caveat, null, { maxBondYears: 1 })).toBe("unknown");
    expect(termsPass(caveat, null, { maxBondYears: 0 })).toBe(false);
    expect(termsPass(caveat, null, { maxBondYears: 0, keepUnknown: true })).toBe(true);
  });

  it("splitByTerms keeps the passing rows and counts the ones left out only for an unknown value", () => {
    const rows = [known, noBond, blank, terms(fig(900000), null)];
    const s = splitByTerms(rows, { maxFee: 300000 }, (t) => t, () => null);
    expect(s.kept).toEqual([known, noBond]);
    expect(s.unknown).toEqual([blank]);
    expect(splitByTerms(rows, { maxFee: 300000, keepUnknown: true }, (t) => t, () => null)).toEqual({ kept: [known, noBond, blank], unknown: [] });
    expect(splitByTerms(rows, {}, (t) => t, () => null).kept).toBe(rows);
  });
});

describe("lowestRisk (Compare)", () => {
  it("only from the bond and leaving penalties shown: the lowest bond wins; unknown never counts as 0", () => {
    expect(lowestRisk([{ name: "A", t: known }, { name: "B", t: noBond }, { name: "C", t: blank }])).toBe(
      "Lowest risk here: B (no bond, leaving penalty not published), from the bond and leaving penalties shown. 1 with no bond figure not counted.",
    );
    expect(lowestRisk([{ name: "A", t: known }])).toBe("Lowest risk here: A (bond penalty ₹20 L, leaving ₹5 L), from the bond and leaving penalties shown.");
  });
  it("all unknown, or all none: said plainly", () => {
    expect(lowestRisk([{ name: "A", t: blank }, { name: "B", t: blank }])).toBe("Can't tell: none of these publishes a bond or leaving penalty figure.");
    expect(lowestRisk([{ name: "A", t: noBond }, { name: "B", t: noBond }])).toBe("No bond on record at any of these, and no leaving penalty published: nothing here to tell them apart.");
  });
});
