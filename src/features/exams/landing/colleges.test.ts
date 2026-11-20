import { describe, expect, it, vi } from "vitest";
import { memoryCatalog } from "@/features/decide/server/catalog";
import type { RoundSeats } from "@/features/decide/components/institute/institute-data";
import type { Category, College, Cutoff, DecideData, Round, SeatList } from "@/features/decide/types";
import { db } from "@/lib/db";
import { bestOpen, branchView, collegeView, indexRows, residentsAt, stateSlug, type At } from "./colleges";
import { branchFaqs, branchWords, collegeFaqs, collegeWords, fitDescription, fitTitle } from "./college-words";

// The public college and branch pages' data on a synthetic in-memory catalog (no database): only the latest round's
// last ranks and last year's deepest reach the page (every other year and round is the planner's), the gated links go
// through sign-up, and residents are read as counts only.
vi.mock("@/lib/db", () => ({ db: { resident: { groupBy: vi.fn(), findMany: vi.fn() }, specialty: { findMany: vi.fn() } } }));

const [A, B] = ["COLLEGE A#110001", "COLLEGE B#400001"];
const college = (key: string, i: number, state: string): College => ({ key, slug: `college-${"ab"[i]}`, name: `College ${"AB"[i]}`, state, pincode: key.split("#")[1], address: null, type: null, beds: null, established: null, website: null });
const cut = (c: string, degree: string, specialty: string, year: number, round: Round, quota: string, category: Category, closing: number, n = 1): Cutoff =>
  ({ college: c, degree, specialty, year, round, quota, category, opening: 1, closing, n, src: `${year}/${round}` });
const data: DecideData = {
  colleges: [college(A, 0, "Delhi"), college(B, 1, "Maharashtra")],
  courses: [
    { degree: "MD", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "md-anaesthesiology" },
    { degree: "MD", specialty: "GENERALMEDICINE", name: "General Medicine", slug: "md-general-medicine" },
    { degree: "MD", specialty: "PAEDIATRICS", name: "Paediatrics", slug: "md-paediatrics" },
  ],
  sources: ([[2024, "R1"], [2025, "R1"], [2025, "R3"], [2025, "stray"], [2026, "R1"], [2026, "R2"]] as const).map(([year, round]) => ({ key: `${year}/${round}`, url: `https://mcc.example/${year}-${round}.pdf`, year, round, provisional: year === 2026 && round === "R2", name: `MCC ${year} ${round} result` })),
  cutoffs: [
    cut(A, "MD", "ANAESTHESIOLOGY", 2024, "R1", "All India", "Open", 55555), // another year: the planner's only
    cut(A, "MD", "ANAESTHESIOLOGY", 2025, "R1", "All India", "Open", 1000),
    cut(A, "MD", "ANAESTHESIOLOGY", 2025, "R3", "All India", "Open", 1800),
    cut(A, "MD", "ANAESTHESIOLOGY", 2025, "stray", "All India", "Open", 2500), // last year's deepest, any round
    cut(A, "MD", "ANAESTHESIOLOGY", 2026, "R1", "All India", "Open", 11111), // an earlier round of the year: the planner's only
    cut(A, "MD", "ANAESTHESIOLOGY", 2026, "R2", "All India", "Open", 1500, 4),
    cut(A, "MD", "ANAESTHESIOLOGY", 2026, "R2", "All India", "OBC", 2000, 2),
    cut(A, "MD", "ANAESTHESIOLOGY", 2026, "R2", "Non-Resident Indian", "Open", 30000),
    cut(A, "MD", "GENERALMEDICINE", 2025, "R1", "All India", "Open", 300), // none in the round: a row with last year's deepest
    cut(B, "MD", "ANAESTHESIOLOGY", 2026, "R2", "All India", "Open", 900),
    cut(B, "MD", "ANAESTHESIOLOGY", 2026, "R2", "Deemed/Paid Seats", "Open", 150000),
    cut(B, "MD", "GENERALMEDICINE", 2026, "R2", "DNB Quota", "Open", 50),
  ],
  terms: [],
  allotments: [],
};
const cat = memoryCatalog(data);
const at: At = { year: 2026, round: "R2", provisional: true, prevYear: 2025, source: data.sources[5], prevSources: data.sources.slice(1, 4) };
const list = (kind: SeatList["kind"]): SeatList => ({ key: `mcc/2026/R2_${kind}.pdf`, name: `R2 ${kind}`, url: `https://mcc.example/R2_${kind}.pdf`, year: 2026, round: "R2", kind, publishedAt: null, seats: 0 });
const row = (l: SeatList, specialty: string, category: string, seats: number) => ({ list: l.key, college: data.colleges[0], course: null, degree: "MD", specialty, quota: "All India", category, seats, cs: null });
const [clear, virtual] = [list("clear"), list("virtual")];
const seats: RoundSeats = [
  { list: clear, rows: [row(clear, "ANAESTHESIOLOGY", "Open", 2), row(clear, "ANAESTHESIOLOGY", "OBC", 1)] },
  { list: virtual, rows: [row(virtual, "ANAESTHESIOLOGY", "Open", 5), row(virtual, "PAEDIATRICS", "Open", 1)] }, // Paediatrics: seats, no allotment yet
];

describe("a college's page", () => {
  const v = collegeView(cat, data.colleges[0], cat.mem!.cutoffs, seats, at);

  it("shows the round's last rank per course, quota and category, last year's deepest Open closing and clear vacancy seats", () => {
    const aiq = v.d.tabs.find((t) => t.key === "aiq")!;
    expect(aiq.rows.map((r) => [r.course, r.last, r.prev, r.seats, r.n])).toEqual([
      ["MD Anaesthesiology", { Open: 1500, OBC: 2000 }, 2500, 3, 6],
      ["MD General Medicine", {}, 300, null, 0], // no allotment in the round: — there, last year's deepest beside it
      ["MD Paediatrics", {}, undefined, null, 0], // only in the newest seat lists (virtual vacancy, not the clear one)
    ]);
    expect(v.d.restricted.map((r) => [r.quota, r.course, r.max])).toEqual([["Non-Resident Indian", "MD Anaesthesiology", 30000]]);
    expect(v.lists).toEqual([
      { name: "Clear vacancy list", url: clear.url, year: 2026, round: "R2", seats: 3 },
      { name: "Virtual vacancy list", url: virtual.url, year: 2026, round: "R2", seats: 6 },
    ]);
    expect([v.courses, v.quotas, v.d.provisional, v.d.round]).toEqual([3, ["All India"], true, "R2"]);
  });

  it("gates the rest: no other year's or round's figure, every planner link through sign-up", () => {
    const json = JSON.stringify(v);
    expect(json).not.toContain("55555"); // 2024
    expect(json).not.toContain("11111"); // 2026 Round 1
    expect(json).not.toContain("150000"); // another college's
    expect(v.gated.length).toBeGreaterThan(4);
    for (const g of v.gated) expect(g.href).toMatch(/^\/signup\?next=%2Fdecide%2F/);
    expect(v.gated.map((g) => decodeURIComponent(g.href.split("next=")[1]))).toContain("/decide/institutes/college-a?tab=residents");
  });

  it("asks only questions its figures answer, and fits its title and description", () => {
    const faqs = collegeFaqs({ ...v, residents: null });
    expect(faqs.map((f) => f.q)).toEqual([
      "What was the MD Anaesthesiology cutoff at College A in NEET PG 2026 Round 2?",
      "How many seats did MCC's NEET PG 2026 Round 2 seat lists show at College A?",
      "Does this page cover College A's state quota seats?",
    ]);
    expect(faqs[0].a).toBe(
      "In MCC's provisional NEET PG 2026 Round 2 result, the last rank given MD Anaesthesiology at College A on All India Open seats was AIR 1,500 (OBC AIR 2,000). In 2025, its deepest Open closing was AIR 2,500. Round 2 counts only new allotments (Fresh Allotted and Upgraded). History, not a prediction.",
    );
    expect(faqs[1].a).toBe("3 seats in the clear vacancy list and 6 seats in the virtual vacancy list at College A, in MCC's NEET PG 2026 Round 2 seat lists as published. The lists overlap, so they are never added together.");
    const withResidents = collegeFaqs({ ...v, residents: { years: [2024, 2025], courses: [{ course: "MD Anaesthesiology", slug: "md-anaesthesiology", byYear: [3, 4] }], byYear: [3, 4], total: 7 } });
    expect(withResidents.find((f) => f.q === "How many residents are at College A?")?.a).toBe(
      "MCC's admitted-candidates lists have 7 at College A in 1 course: 3 in 2024 and 4 in 2025. Signed-in members see their names; this page shows counts only.",
    );
    const w = collegeWords({ ...v, residents: null });
    expect([w.title, w.absolute, w.h1]).toEqual(["College A: NEET PG 2026 Cutoff", false, "College A: NEET PG 2026 Cutoff"]);
    expect(w.description.length).toBeLessThanOrEqual(155);
  });
});

describe("residents on a public page", () => {
  it("are counted, never read: a group-by per course and year, no row, so no name", async () => {
    vi.mocked(db.resident.groupBy).mockResolvedValue([
      { specialtyId: "s1", year: 2025, _count: { _all: 4 } },
      { specialtyId: "s1", year: 2024, _count: { _all: 3 } },
      { specialtyId: "s2", year: 2025, _count: { _all: 9 } },
    ] as never);
    vi.mocked(db.specialty.findMany).mockResolvedValue([{ id: "s1", degree: "MD", name: "Anaesthesiology", slug: "md-anaesthesiology" }, { id: "s2", degree: "MS", name: "General Surgery", slug: "ms-general-surgery" }] as never);
    expect(await residentsAt(A)).toEqual({
      years: [2024, 2025],
      courses: [{ course: "MS General Surgery", slug: "ms-general-surgery", byYear: [0, 9] }, { course: "MD Anaesthesiology", slug: "md-anaesthesiology", byYear: [3, 4] }],
      byYear: [3, 13],
      total: 16,
    });
    expect(vi.mocked(db.resident.groupBy).mock.calls[0][0]).toEqual({ by: ["specialtyId", "year"], where: { hidden: false, college: { key: A } }, _count: { _all: true } });
    expect(db.resident.findMany).not.toHaveBeenCalled();
    vi.mocked(db.resident.groupBy).mockResolvedValue([] as never);
    expect(await residentsAt(B)).toBeNull();
  });
});

describe("a branch's page", () => {
  const course = data.courses[0];
  const v = branchView(cat, course, cat.mem!.cutoffs, at);

  it("lists every college's last rank in the round, with its state and last year's deepest, restricted quotas apart", () => {
    expect(v.d.tabs.map((t) => [t.key, t.rows.map((r) => [r.course, r.sub, r.last.Open, r.prev])])).toEqual([
      ["aiq", [["College B", "Maharashtra", 900, undefined], ["College A", "Delhi", 1500, 2500]]],
      ["deemed", [["College B", "Maharashtra", 150000, undefined]]],
      ["dnb", []],
    ]);
    expect(v.d.restricted.map((r) => [r.course, r.quota, r.max])).toEqual([["College A", "Non-Resident Indian", 30000]]);
    expect(v.colleges).toBe(2);
    expect(v.prevDeepest).toEqual({ college: "College A", closing: 2500, round: "stray" });
    expect(JSON.stringify(v)).not.toContain("11111");
    expect(v.gated).toBe("/signup?next=%2Fdecide%2Flast-ranks%3Fcourse%3Dmd-anaesthesiology");
  });

  it("answers from the table: the tightest and deepest Open last rank per quota", () => {
    const faqs = branchFaqs(v);
    expect(faqs[0]).toEqual({
      q: "What was the NEET PG 2026 MD Anaesthesiology cutoff in Round 2?",
      a: "On All India Open seats in MCC's provisional NEET PG 2026 Round 2 result, MD Anaesthesiology closed from AIR 900 at College B to AIR 1,500 at College A, across 2 colleges. Round 2 counts only new allotments (Fresh Allotted and Upgraded). History, not a prediction.",
    });
    expect(faqs[1].a).toContain("closed at AIR 1,50,000 at College B.");
    expect(faqs.map((f) => f.q).at(-1)).toBe("Does this include state quota MD Anaesthesiology cutoffs?");
    const w = branchWords(v);
    expect([w.h1, w.title.length <= 50 || (w.absolute && w.title.length <= 60), w.description.length <= 155]).toEqual(["NEET PG 2026 MD Anaesthesiology Cutoff: College-wise Last Rank", true, true]);
  });
});

it("the index: each college's most competitive Open last rank (All India first), a unique label per name", () => {
  const round = cat.mem!.cutoffs.filter((c) => c.year === 2026 && c.round === "R2");
  expect([...bestOpen(round)].map(([k, c]) => [k, c.quota, c.closing])).toEqual([[A, "All India", 1500], [B, "All India", 900]]);
  const twin = memoryCatalog({ ...data, colleges: [...data.colleges, { ...data.colleges[0], key: "COLLEGE A#560001", slug: "college-a-2", pincode: "560001" }] });
  const rows = indexRows(twin, round, new Map());
  expect(rows.map((r) => [r.label, r.best?.closing ?? null, r.courses, r.type.label])).toEqual([
    ["College B", 900, 2, "Type not known"],
    ["College A (110001)", 1500, 2, "Type not known"],
    ["College A (560001)", null, 0, "Type not known"],
  ]);
  expect(stateSlug("Jammu and Kashmir")).toBe("jammu-and-kashmir");
  expect(stateSlug("Andaman & Nicobar Islands")).toBe("andaman-and-nicobar-islands");
});

it("titles fit 50 characters with the brand, else 60 alone; descriptions 155", () => {
  expect(fitTitle(["Short title"])).toEqual({ title: "Short title", absolute: false });
  expect(fitTitle(["x".repeat(55)])).toEqual({ title: "x".repeat(55), absolute: true });
  const cut = (name: string) => fitTitle([`NEET PG Cutoff: ${name}`]);
  expect(cut("Associated Hospital Govt. Medical College, Doda City")).toEqual({ title: "NEET PG Cutoff: Associated Hospital Govt.…ollege, Doda City", absolute: true });
  expect(cut("Associated Hospital Govt. Medical College, Doda").title).toBe("NEET PG Cutoff: Associated Hospital Govt.…cal College, Doda");
  expect(cut("x".repeat(80)).title.length).toBe(60);
  const long = "A Very Long Institute Name ".repeat(6).trim();
  const d = fitDescription((s) => [`${s}: NEET PG 2026 last rank for 12 courses. State quota not covered.`], long);
  expect(d.length).toBeLessThanOrEqual(155);
  expect(d.endsWith("State quota not covered.")).toBe(true);
});
