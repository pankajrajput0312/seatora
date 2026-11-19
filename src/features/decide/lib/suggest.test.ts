import { describe, expect, it } from "vitest";
import type { Amount, Bond, Figure, ProgrammeTerms } from "../server/terms";
import type { GridCell, Latest, Reach } from "./reach";
import { suggestList, type SuggestRow } from "./suggest";
import { termFilters } from "./term-filters";
import type { Round } from "../types";

// Fixtures: the fields Suggest reads of an option row, for each exam's quirks (NEET PG's PwD seats, NEET SS's question
// groups, NEET MDS's dental courses, INI-CET's session years and Open Round, never-allotted seats with similar colleges).
const none: Amount = { state: "none", min: null, max: null, perYear: null, varies: false, more: false, extra: null };
const bond = (b: Partial<Bond> = {}): Bond => ({
  status: "not_declared", basis: null, stateRule: null, years: null, yearsSum: null, yearsText: null, amounts: [], otherAmounts: false, amount: none, leaving: [], leavingAmount: none,
  otherPenalties: [], appliesTo: null, text: null, quote: null, caveat: null, src: null, doc: null, ...b,
});
const fig = (inr: number): Figure => ({ inr, kind: "declared", src: 1 });
const terms = (fee: number | null, b: Partial<Bond> = { status: "none", basis: "document", years: 0 }): ProgrammeTerms => ({
  programme: "MD/MS", durationYears: 3, years: [{ year: 1, fee: fee == null ? null : fig(fee), stipend: null }], feeNote: null, wholeCourseFee: null, hostelFee: null, feeExtras: [],
  bond: bond(b), resignForfeit: null, unread: [], notes: [], sources: [],
});
type Cells = Record<number, Partial<Record<Round, number | [number, string]>>>;
const grid = (cells: Cells) =>
  Object.fromEntries(Object.entries(cells).map(([y, rs]) => [y, Object.fromEntries(Object.entries(rs).map(([r, v]) => [r, { closing: Array.isArray(v) ? v[0] : v, category: Array.isArray(v) ? v[1] : "Open", n: 1, provisional: false } as GridCell]))])) as SuggestRow["grid"];
let n = 0;
const row = (o: { course: string; reach: Reach; from?: [number, Round]; cells?: Cells; fee?: number | null; type?: "govt" | "private" | "deemed"; similar?: SuggestRow["similar"]; otherGroup?: true; id?: string }): SuggestRow => {
  const [degree, specialty] = o.course.split("~");
  return {
    id: o.id ?? `C${++n}~${o.course}~All India`,
    course: { degree, specialty, name: specialty, slug: o.course },
    reach: o.reach,
    ...(o.from && { reachFrom: { year: o.from[0], round: o.from[1] } }),
    grid: grid(o.cells ?? {}),
    ...(o.similar && { similar: o.similar }),
    fees: terms(o.fee === undefined ? 100000 : o.fee),
    hospital: o.type ? { type: { value: o.type, basis: "test" }, beds: null, mccProfileUrl: null } : null,
    ...(o.otherGroup && { otherGroup: true }),
  };
};
const ids = (xs: { row: SuggestRow }[]) => xs.map((x) => x.row.id);

describe("NEET PG (2024, 2025 past; 2026 R1 latest)", () => {
  const latest: Latest = { year: 2026, round: "R1" };
  const rank = 25000;
  const safe = row({ id: "safe", course: "DNB~ORTHOPAEDICS", reach: "reached-latest", from: [2026, "R1"], cells: { 2026: { R1: 31250 } } });
  const safeTight = row({ id: "safe-tight", course: "DNB~ORTHOPAEDICS", reach: "reached-both", from: [2024, "R1"], cells: { 2024: { R1: 26000 }, 2025: { R1: 25500 } } });
  const target = row({ id: "target", course: "DNB~ORTHOPAEDICS", reach: "reached-latest", from: [2026, "R1"] }); // no R1 cell: never Safe unsaid
  const later = row({ id: "later", course: "MS~ORTHOPAEDICS", reach: "reached-both", from: [2025, "R3"], cells: { 2024: { R2: 27000 }, 2025: { R1: 20000, R3: 26100 } } });
  const one = row({ id: "one", course: "MS~ORTHOPAEDICS", reach: "reached-one", from: [2025, "R1"], cells: { 2024: { R1: 21000 }, 2025: { R1: 25800 } } });
  const dream = row({ id: "dream", course: "MD~RADIODIAGNOSIS", reach: "within-10", cells: { 2025: { R1: 21000, R3: 23502 } } });
  const stray = row({ id: "stray", course: "MD~RADIODIAGNOSIS", reach: "stray-only", cells: { 2025: { R3: 20000, stray: 26100 } } });
  const closed = row({ id: "closed", course: "MD~RADIODIAGNOSIS", reach: "closed-before", cells: { 2025: { R1: 9000 } } });
  const noData = row({ id: "nodata", course: "MD~GENERALMEDICINE", reach: "no-data" });

  it("orders by her course preference, then Dream > Target > Safe, then the tightest closing; reasons give the closing it rests on", () => {
    const order = [["MD~RADIODIAGNOSIS"], ["MS~ORTHOPAEDICS", "DNB~ORTHOPAEDICS"]];
    const { items, left } = suggestList([safe, safeTight, target, later, one, dream, stray, closed, noData], { rank, latest, order });
    // Within a bucket the most sought first: its newest Round 1 closing (later's 2025 R1 20,000 before one's 25,800).
    expect(ids(items)).toEqual(["dream", "stray", "later", "one", "target", "safe-tight", "safe"]);
    expect(items.map((x) => x.bucket)).toEqual(["dream", "dream", "target", "target", "target", "safe", "safe"]);
    expect(items.map((x) => x.pref)).toEqual([0, 0, 1, 1, 1, 1, 1]); // Ortho MS and DNB are equal (one group)
    expect(left).toEqual({ closed: 1, noData: 1 });
    const why = Object.fromEntries(items.map((x) => [x.row.id, x.reason]));
    expect(why.dream).toBe("Dream: closed at 23,502 in 2025 R3, 6% before you");
    expect(why.stray).toBe("Dream: closed at 26,100 in 2025 Stray, 4% past you; your rank was reached only in a stray round");
    expect(why.safe).toBe("Safe: closed at 31,250 in 2026 R1, 25% past you; Round 1 reached your rank in 2026");
    expect(why["safe-tight"]).toBe("Safe: closed at 25,500 in 2025 R1, 2% past you; Round 1 reached your rank in 2024 and 2025");
    expect(why.later).toBe("Target: closed at 26,100 in 2025 R3, 4% past you; only a later round reached your rank (R1 closed at 20,000)");
    expect(why.one).toBe("Target: closed at 25,800 in 2025 R1, 3% past you; reached your rank in 2025, not in 2024");
  });

  it("no order: every course equal, so all Dreams first; a course her order doesn't name comes after her groups", () => {
    expect(ids(suggestList([safe, later, dream], { rank, latest }).items)).toEqual(["dream", "later", "safe"]);
    const named = suggestList([safe, later, dream], { rank, latest, order: [["MS~ORTHOPAEDICS"]] }).items;
    expect(named.map((x) => [x.row.id, x.pref])).toEqual([["later", 0], ["dream", 1], ["safe", 1]]);
    // A specialty in her order stands for every degree of it.
    expect(ids(suggestList([dream, safe, later], { rank, latest, order: [["ORTHOPAEDICS"], ["RADIODIAGNOSIS"]] }).items)).toEqual(["later", "safe", "dream"]);
  });

  it("says a closing within 1% of her rank as under 1%, and one at her rank as such", () => {
    const near = row({ id: "near", course: "MD~X", reach: "within-10", cells: { 2025: { R1: 24900 } } });
    const at = row({ id: "at", course: "MD~X", reach: "reached-latest", from: [2026, "R1"], cells: { 2026: { R1: 25000 } } });
    expect(suggestList([near, at], { rank, latest }).items.map((x) => x.reason)).toEqual([
      "Dream: closed at 24,900 in 2025 R1, under 1% before you",
      "Safe: closed at 25,000 in 2026 R1, at your rank; Round 1 reached your rank in 2026",
    ]);
  });

  it("PwD: the reason names the seat category its closing is on", () => {
    const pwd = row({ id: "pwd", course: "MD~PAEDIATRICS", reach: "reached-latest", from: [2026, "R1"], cells: { 2026: { R1: [61000, "OBC PwD"] } } });
    expect(suggestList([pwd], { rank, latest }).items[0].reason).toBe("Safe: closed at 61,000 (OBC PwD seat) in 2026 R1, 36,000 ranks past you; Round 1 reached your rank in 2026");
  });

  it("her caps leave options out, counted by the first cap that does; Include not published lists the unknown ones after the known", () => {
    const dear = row({ id: "dear", course: "DNB~ORTHOPAEDICS", reach: "reached-latest", from: [2026, "R1"], cells: { 2026: { R1: 30000 } }, fee: 2500000, type: "govt" });
    const blank = row({ id: "blank", course: "DNB~ORTHOPAEDICS", reach: "reached-latest", from: [2026, "R1"], cells: { 2026: { R1: 26000 } }, fee: null, type: "govt" });
    const pvt = row({ id: "pvt", course: "DNB~ORTHOPAEDICS", reach: "reached-latest", from: [2026, "R1"], cells: { 2026: { R1: 27000 } }, type: "private" });
    const caps = termFilters({ ctype: ["govt"] }, { maxFeeLakh: 10, maxBondYears: null });
    const govt = { ...safe, hospital: { type: { value: "govt" as const, basis: "t" }, beds: null, mccProfileUrl: null } };
    // A fee cap keeps an option with no published fee (term-filters: marked, not hidden), unless she hides those (nf=hide).
    expect(suggestList([govt, dear, blank, pvt], { rank, latest, caps }).left).toEqual({ fee: 1, type: 1 });
    expect(suggestList([govt, dear, blank, pvt], { rank, latest, caps: termFilters({ ctype: ["govt"], nf: "hide" }, { maxFeeLakh: 10, maxBondYears: null }) }).left).toEqual({ fee: 1, unknown: 1, type: 1 });
    const keep = termFilters({ nd: "keep", nf: "hide" }, { maxFeeLakh: 10, maxBondYears: null });
    const kept = suggestList([safe, blank, dear], { rank, latest, caps: keep }).items;
    expect(kept.map((x) => [x.row.id, !!x.unsure])).toEqual([["safe", false], ["blank", true]]);
    // Bond cap "No bond": a declared bond fails it (the "terms" count: bond, stipend, penalty caps).
    const bonded = { ...safe, id: "bonded", fees: terms(100000, { status: "declared", basis: "document", years: 2 }) };
    expect(suggestList([bonded], { rank, latest, caps: termFilters({}, { maxFeeLakh: null, maxBondYears: 0 }) }).left).toEqual({ terms: 1 });
  });

  it("government first, when she asks, within each bucket only", () => {
    const g = { ...safe, id: "g", hospital: { type: { value: "central" as const, basis: "t" }, beds: null, mccProfileUrl: null } };
    expect(ids(suggestList([safeTight, g, dream], { rank, latest }).items)).toEqual(["dream", "safe-tight", "g"]);
    expect(ids(suggestList([safeTight, g, dream], { rank, latest, govtFirst: true }).items)).toEqual(["dream", "g", "safe-tight"]);
  });

  it("never allotted: Dream when similar seats closed within 10% of her rank or past it, after the Dreams with closings of their own; else left out", () => {
    const sim = (max: number) => ({ type: "govt" as const, state: "Tamil Nadu", year: 2025, last: "R3" as Round, min: 799, max, colleges: 21 });
    const near = row({ id: "near", course: "MD~RADIODIAGNOSIS", reach: "new", similar: sim(23000) });
    const far = row({ id: "far", course: "MD~RADIODIAGNOSIS", reach: "new", similar: sim(4747) });
    const alone = row({ id: "alone", course: "MD~RADIODIAGNOSIS", reach: "new" });
    const { items, left } = suggestList([near, far, alone, dream], { rank, latest });
    expect(ids(items)).toEqual(["dream", "near"]);
    expect(items[1].reason).toBe("Dream: never allotted before; the same course at 21 other Govt colleges in Tamil Nadu closed 799–23,000 in 2025 R1 to R3, 8% before you at the deepest");
    expect(left).toEqual({ far: 2 });
  });

  it("is deterministic: the same rows in any order give the same list", () => {
    const xs = [safe, safeTight, target, later, one, dream, stray];
    const a = ids(suggestList(xs, { rank, latest }).items);
    expect(ids(suggestList([...xs].reverse(), { rank, latest }).items)).toEqual(a);
  });
});

describe("NEET SS (question groups; 2023, 2024 past, 2025 latest)", () => {
  const latest: Latest = { year: 2025, round: "R2", pastYears: [2023, 2024], exam: "neet-ss" };
  it("lists her question group's seats only: another group's are left out and counted", () => {
    const mine = row({ id: "mine", course: "DM~CARDIOLOGY", reach: "reached-latest", from: [2025, "R1"], cells: { 2025: { R1: 400 } } });
    const other = row({ id: "other", course: "MCh~NEUROSURGERY", reach: "no-data", otherGroup: true });
    const r = suggestList([mine, other], { rank: 300, latest });
    expect(ids(r.items)).toEqual(["mine"]);
    expect(r.left).toEqual({ otherGroup: 1 });
  });
});

describe("NEET MDS (Prosthodontics = Conservative > Periodontology, fee cap)", () => {
  const latest: Latest = { year: 2026, round: "R1", pastYears: [2024, 2025], exam: "neet-mds" };
  it("equal courses share a group; a cheaper Periodontology Safe seat still comes after them", () => {
    const pro = row({ id: "pro", course: "MDS~PROSTHODONTICS", reach: "within-10", cells: { 2025: { R2: 3300 } } });
    const con = row({ id: "con", course: "MDS~CONSERVATIVEDENTISTRY", reach: "reached-one", from: [2025, "R2"], cells: { 2025: { R2: 3600 } } });
    const consafe = row({ id: "con-safe", course: "MDS~CONSERVATIVEDENTISTRY", reach: "reached-latest", from: [2026, "R1"], cells: { 2026: { R1: 3900 } }, fee: 750000 });
    const peri = row({ id: "peri", course: "MDS~PERIODONTOLOGY", reach: "reached-latest", from: [2026, "R1"], cells: { 2026: { R1: 3700 } }, fee: 100000 });
    const dear = row({ id: "dear", course: "MDS~PROSTHODONTICS", reach: "reached-latest", from: [2026, "R1"], cells: { 2026: { R1: 3800 } }, fee: 900000 });
    const order = [["PROSTHODONTICS", "CONSERVATIVEDENTISTRY"], ["PERIODONTOLOGY"]];
    const r = suggestList([peri, consafe, con, pro, dear], { rank: 3500, latest, order, caps: termFilters({}, { maxFeeLakh: 8, maxBondYears: null }) });
    expect(ids(r.items)).toEqual(["pro", "con", "con-safe", "peri"]);
    expect(r.left).toEqual({ fee: 1 });
    expect(r.items[1].reason).toBe("Target: closed at 3,600 in 2025 R2, 3% past you; reached your rank in 2025, not in 2024; only a later round reached your rank");
  });
});

describe("INI-CET (session years, the Open Round)", () => {
  const latest: Latest = { year: 20267, round: "R3", pastYears: [20257, 20261], exam: "ini-cet" };
  it("names sessions and AIIMS's Open Round in the reasons", () => {
    const open = row({ id: "open", course: "MD~ANAESTHESIOLOGY", reach: "reached-latest", from: [20267, "R3"], cells: { 20267: { R1: 900, R3: 1700 } } });
    const r1 = row({ id: "r1", course: "MD~PATHOLOGY", reach: "reached-both", from: [20257, "R1"], cells: { 20257: { R1: 2100 }, 20261: { R1: 1800 } } });
    const items = suggestList([r1, open], { rank: 1500, latest }).items;
    expect(items.map((x) => x.reason)).toEqual([
      "Target: closed at 1,700 in Jul 2026 Open Round, 13% past you; only a later round reached your rank (R1 closed at 900)",
      "Safe: closed at 1,800 in Jan 2026 R1, 20% past you; Round 1 reached your rank in Jul 2025 and Jan 2026",
    ]);
  });
  it("an Open Round closing far past her rank never makes a seat read less sought: Round 1's closing orders them", () => {
    const deep = row({ id: "deep", course: "MD~PATHOLOGY", reach: "reached-latest", from: [20267, "R3"], cells: { 20267: { R1: 1100, R3: 40863 } } });
    const r2 = row({ id: "r2", course: "MD~PATHOLOGY", reach: "reached-latest", from: [20267, "R2"], cells: { 20267: { R1: 1300, R2: 1600 } } });
    const items = suggestList([r2, deep], { rank: 1500, latest }).items;
    expect(ids(items)).toEqual(["deep", "r2"]);
    expect(items[0].reason).toBe("Target: closed at 40,863 in Jul 2026 Open Round, 39,363 ranks past you; only a later round reached your rank (R1 closed at 1,100)");
  });
});
