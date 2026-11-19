import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { setTestCatalog } from "@/features/decide/server/catalog";
import type { Category, Cutoff, DecideData, Round } from "@/features/decide/types";

// The public rank check on a synthetic in-memory catalog (no database): last year's (2025) Round 1 to 3 closings on the
// quotas anyone can take and the seats her category can take; stray rounds, restricted quotas and other years never count.
vi.stubEnv("DATABASE_URL", "");
let rankCheck: typeof import("./data").rankCheck;
beforeAll(async () => {
  ({ rankCheck } = await import("./data"));
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
