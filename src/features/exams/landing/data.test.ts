import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { setTestCatalog } from "@/features/decide/server/catalog";
import type { Category, Cutoff, DecideData, Round } from "@/features/decide/types";

// The public rank check on a synthetic in-memory catalog (no database): last year's (2025) Round 1 to 3 closings on the
// quotas anyone can take and the seats her category can take; stray rounds, restricted quotas and other years never count.
vi.stubEnv("DATABASE_URL", "");
let rankCheck: typeof import("./data").rankCheck;
let branchTabs: typeof import("./data").branchTabs;
let vsRank: typeof import("./data").vsRank;
beforeAll(async () => {
  ({ rankCheck, branchTabs, vsRank } = await import("./data"));
  setTestCatalog(data);
});
afterAll(() => setTestCatalog(null));

const [A, B, C] = ["RANKCHECKA#110001", "RANKCHECKB#400001", "RANKCHECKC#600001"];
const cut = (college: string, degree: string, year: number, round: Round, quota: string, category: Category, closing: number): Cutoff =>
  ({ college, degree, specialty: "ANAESTHESIOLOGY", year, round, quota, category, opening: 1, closing, n: 1, src: `${year}/${round}` });
const data: DecideData = {
  colleges: [A, B, C].map((key, i) => ({ key, slug: `rc-${i}`, name: `Institute ${"ABC"[i]}`, state: "Delhi", pincode: null, address: null, type: null, beds: null, established: null, website: null })),
  courses: [
    { degree: "MD", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "md-anaesthesiology" },
    { degree: "DNB", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "dnb-anaesthesiology" },
  ],
  sources: ([[2024, "R1"], [2025, "R1"], [2025, "R2"], [2025, "R3"], [2025, "stray"]] as const).map(([year, round]) => ({ key: `${year}/${round}`, url: `https://example.test/${year}-${round}.pdf`, year, round, provisional: false, name: `MCC ${year} ${round} result` })),
  cutoffs: [
    cut(A, "MD", 2025, "R1", "All India", "Open", 1000),
    cut(A, "MD", 2025, "R2", "All India", "Open", 1500), // took 1,200 in Round 2, not Round 1
    cut(A, "MD", 2025, "R1", "Deemed/Paid Seats", "Open", 1210), // A again, tighter: the one shown for A
    cut(B, "DNB", 2025, "R1", "DNB Quota", "Open", 1300),
    cut(C, "MD", 2025, "R1", "All India", "OBC", 1250), // an OBC seat: OBC only
    cut(C, "MD", 2025, "stray", "All India", "Open", 5000), // stray: never counts
    cut(B, "MD", 2025, "R1", "Non-Resident Indian", "Open", 9000), // restricted quota: never counts
    cut(C, "DNB", 2024, "R1", "DNB Quota", "Open", 9000), // another year
  ],
  terms: [],
  allotments: [],
};

it("counts the options that took the rank last year and shows the tightest at different institutes, each with the round that took it", async () => {
  const open = await rankCheck(1200, "Open");
  expect(open).toMatchObject({ year: "2025", n: 3 });
  expect(open.rows.map((r) => [r.college.name, r.quota, r.round, r.closing])).toEqual([
    ["Institute A", "Deemed/Paid Seats", "R1", 1210],
    ["Institute B", "DNB Quota", "R1", 1300],
  ]);
  expect(open.rows[0].source).toEqual({ name: "MCC 2025 R1 result", url: "https://example.test/2025-R1.pdf" });

  const obc = await rankCheck(1200, "OBC");
  expect(obc.n).toBe(4);
  expect(obc.rows.map((r) => [r.college.name, r.closing])).toEqual([["Institute A", 1210], ["Institute C", 1250], ["Institute B", 1300]]);

  // Institute A's All India seat took 1,400 only in Round 2; nothing took 5,000 outside the stray round.
  expect((await rankCheck(1400, "Open")).rows).toMatchObject([{ college: { name: "Institute A" }, quota: "All India", round: "R2", closing: 1500 }]);
  expect(await rankCheck(5000, "Open")).toMatchObject({ n: 0, rows: [] });
});

it("last rank by branch: per quota tab and seat category the highest rank, allotments summed, Open's lowest first; restricted quotas apart", () => {
  const row = (degree: string, name: string, quota: string, category: string, closing: number | null, n = 1) => ({ degree, name, slug: `${degree}-${name}`.toLowerCase(), quota, category, closing, n });
  const { tabs, restricted } = branchTabs([
    row("MD", "Anaesthesiology", "All India", "Open", 28979, 600),
    row("MD", "Anaesthesiology", "All India", "OBC", 34013, 300),
    row("MD", "Anaesthesiology", "All India", "OBC PwD", 90000),
    row("MD", "General Medicine", "All India", "Open", 6334, 500),
    row("Diploma", "Radiodiagnosis", "All India", "SC", 23520, 2), // no Open seat: last, after every Open one
    row("MD", "Anaesthesiology", "Deemed/Paid Seats", "Open", 158950, 236),
    row("MD", "Anaesthesiology", "Non-Resident Indian", "Open", 120000), // restricted: never in a tab
    row("MD", "Anaesthesiology", "Armed Forces Medical", "Open", 40000),
    row("MD", "Anaesthesiology", "Armed Forces Medical", "SC", 133207),
  ]);
  const [aiq, deemed, dnb] = tabs;
  expect(aiq.rows.map((r) => [r.course, r.last.Open, r.n])).toEqual([["MD General Medicine", 6334, 500], ["MD Anaesthesiology", 28979, 901], ["Diploma Radiodiagnosis", undefined, 2]]);
  expect(aiq.rows[1].last).toEqual({ Open: 28979, OBC: 34013, "OBC PwD": 90000 });
  expect([aiq.cats, aiq.pwd, deemed.cats, deemed.pwd]).toEqual([["Open", "OBC", "SC"], true, ["Open"], false]);
  expect(deemed.rows.map((r) => [r.course, r.last.Open])).toEqual([["MD Anaesthesiology", 158950]]);
  expect(dnb.rows).toEqual([]);
  // Restricted: the last rank on any of its seats, lowest first (as the tabs), not grouped by quota.
  expect(restricted.map((r) => [r.quota, r.course, r.max])).toEqual([["Non-Resident Indian", "MD Anaesthesiology", 120000], ["Armed Forces Medical", "MD Anaesthesiology", 133207]]);
});

it("her rank against the branches: reached first, closest to her rank first, then closed before it, closest first, then none on her seats", () => {
  const row = (course: string, last: Partial<Record<Category, number>>) => ({ course, slug: course, quota: "All India", last, n: 1 });
  const rows = [
    row("MD Anaesthesiology", { Open: 28979, OBC: 34013 }), // closed 8,271 before 42,284
    row("DNB Family Medicine", { Open: 41045, OBC: 38624 }), // Open, a seat she can take too, decides: closed 1,239 before
    row("NBEMS Diploma Anaesthesiology", { Open: 63323, OBC: 61995 }), // reached, by 21,039
    row("MD Psychiatry", { OBC: 42284 }), // reached at her very rank: closest
    row("Diploma Radiodiagnosis", { SC: 90000 }), // no Open or OBC allotment
    row("DNB Pathology", { "OBC PwD": 150000 }), // PwD seats only for a PwD candidate
  ];
  const r = vsRank(rows, 42284, "OBC", false);
  expect(r.map((x) => [x.course, x.reached, x.best?.last ?? null])).toEqual([
    ["MD Psychiatry", true, 42284],
    ["NBEMS Diploma Anaesthesiology", true, 63323],
    ["DNB Family Medicine", false, 41045],
    ["MD Anaesthesiology", false, 34013],
    ["Diploma Radiodiagnosis", false, null], // A–Z
    ["DNB Pathology", false, null],
  ]);
  expect(vsRank(rows, 42284, "OBC", true).find((x) => x.course === "DNB Pathology")).toMatchObject({ reached: true, best: { cat: "OBC PwD", last: 150000 } });
});
