import { expect, it, vi } from "vitest";

// The public residents pages' data, on a mocked database: counts only. Even a row carrying a resident's name, rank or
// quota (it can't: the SQL never selects one) gives none of them back; hidden residents are filtered in the SQL.
const sql: string[] = [];
const leak = { name: "LEAKED NAME", rank: 1234, quota: "All India", round: "R1", category: "OBC" };
const row = (slug: string, state: string | null, course: string, year: number, n: number) => ({ slug, hospital: `Hospital ${slug}`, state, degree: course.split(" ")[0], course, year, n, ...leak });
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: async (s: TemplateStringsArray) => {
      sql.push(s.join("?"));
      return s.join("").includes(`"DataSource"`)
        ? [{ year: 2025, label: "up to Round 3", doc: "MCC admitted candidates list (up to Round 3)", url: "https://example.test/2025.pdf", added: new Date("2026-11-15T00:00:00Z"), ...leak }]
        : [
            row("a", "Jammu and Kashmir", "MD General Medicine", 2025, 3),
            row("a", "Jammu and Kashmir", "MD General Medicine", 2024, 2),
            row("a", "Jammu and Kashmir", "MS General Surgery", 2025, 1),
            row("b", "Delhi", "MD General Medicine", 2024, 9),
            row("c", "Delhi", "DNB General Medicine", 2025, 1),
          ];
    },
  },
}));
const { residentsData, residentsWords, stateSlug } = await import("./residents");

it("public residents data: counts by state, hospital, course and year; no name, rank, quota, round or category, and never a hidden resident", async () => {
  const r = (await residentsData())!;
  expect(r).toMatchObject({ total: 16, years: [2025, 2024], courses: 3, updated: new Date("2026-11-15T00:00:00Z") });
  expect(r.states).toEqual([
    { state: "Delhi", slug: "delhi", hospitals: 2, residents: 10 },
    { state: "Jammu and Kashmir", slug: "jammu-and-kashmir", hospitals: 1, residents: 6 },
  ]);
  expect(r.hospitals.map((h) => [h.slug, h.byYear, h.total])).toEqual([["b", [0, 9], 9], ["a", [4, 2], 6], ["c", [1, 0], 1]]);
  expect(r.hospitals[1].courses).toEqual([{ course: "MD General Medicine", n: 5 }, { course: "MS General Surgery", n: 1 }]);

  const keys = new Set<string>();
  JSON.stringify(r, (k, v) => (keys.add(k), v));
  for (const k of ["name", "rank", "quota", "round", "category"]) expect(keys, k).not.toContain(k);
  expect(JSON.stringify(r)).not.toMatch(/LEAKED|1234|OBC/);
  // Every read of Resident skips hidden rows and selects no resident's name, rank, quota or round.
  expect(sql).toHaveLength(2);
  for (const q of sql) {
    expect(q).toMatch(/WHERE NOT (r\.)?hidden/);
    expect(q).not.toMatch(/\br\.(name|rank|quota|round)\b|"rank(Basis)?"|\bcategory\b/);
  }
});

it("titles fit ~60 characters with \" · Seatora\" and descriptions 155, for the longest state and the biggest counts", async () => {
  const r = (await residentsData())!;
  const big = { ...r, total: 999_999, hospitals: Array(9_999).fill(r.hospitals[0]), years: [2025, 2023] };
  const state = { state: "Andaman and Nicobar Islands", slug: stateSlug("Andaman and Nicobar Islands"), hospitals: 999, residents: 99_999 };
  for (const w of [residentsWords(big), residentsWords(big, state), residentsWords(big, { ...state, state: "Goa" })]) {
    expect(w.title.length + " · Seatora".length, w.title).toBeLessThanOrEqual(60);
    expect(w.description.length, w.description).toBeLessThanOrEqual(155);
  }
});
