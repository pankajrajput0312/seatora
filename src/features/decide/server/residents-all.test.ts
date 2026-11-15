import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESIDENTS_PAGE_SIZE, residentsQuery } from "../residents-search";
import { RESIDENTS_READS_PER_DAY } from "./residents";
import { listResidentsAll, RESIDENTS_MAX_PAGE, ResidentsDenied } from "./residents-all";

// Gates, read budget and paging of the search across institutes, on a mocked database (no names: one made-up row).
const m = vi.hoisted(() => ({
  hasSiteAccess: vi.fn(),
  getCurrentUser: vi.fn(),
  allow: vi.fn(),
  reads: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  sources: vi.fn(),
}));
vi.mock("@/features/auth/lib/session", () => ({ hasSiteAccess: m.hasSiteAccess, getCurrentUser: m.getCurrentUser }));
vi.mock("@/lib/rate-limit", () => ({ allow: m.allow }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }) }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: m.reads, resident: { count: m.count, findMany: m.findMany }, dataSource: { findMany: m.sources } } }));

const row = {
  id: "r1",
  name: "Test Person",
  year: 2025,
  list: "up to Round 3",
  sourceKey: "mcc/2025/admitted_upto_R3.pdf",
  rank: 1234,
  rankBasis: "nbems/2025/merit_list_AIQ50.pdf",
  quota: "All India",
  round: "R2",
  specialty: { degree: "MD", code: "PAEDIATRICS", name: "Paediatrics", slug: "md-paediatrics" },
  college: { slug: "x-college", name: "X College", state: "Kerala" },
};

const list = (q: Record<string, unknown> = {}) => listResidentsAll(residentsQuery.parse(q));
const denied = (q: Record<string, unknown> = {}) => list(q).then(() => null, (e: ResidentsDenied) => e.code);
const where = () => m.findMany.mock.lastCall![0].where;

let readsToday = 0;
beforeEach(() => {
  vi.clearAllMocks();
  readsToday = 0;
  m.hasSiteAccess.mockResolvedValue(true);
  m.getCurrentUser.mockResolvedValue({ id: "u1", email: "x@seatora.test", name: "X" });
  m.allow.mockReturnValue(true);
  m.reads.mockImplementation(async () => [{ count: ++readsToday }]);
  m.count.mockResolvedValue(120);
  m.findMany.mockResolvedValue([row]);
  m.sources.mockResolvedValue([{ key: row.sourceKey, name: "MCC admitted candidates list (up to Round 3)", url: null, counsellingYear: 2025 }]);
});

describe("gates and budget", () => {
  it("locked without names access, rate_limited once the IP budget is spent; nothing read", async () => {
    m.hasSiteAccess.mockResolvedValueOnce(false);
    expect(await denied()).toBe("locked");
    expect(m.allow).not.toHaveBeenCalled(); // no budget spent on a refused read
    m.allow.mockReturnValueOnce(false);
    expect(await denied()).toBe("rate_limited");
    expect(m.reads).not.toHaveBeenCalled();
    expect(m.count).not.toHaveBeenCalled();
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("spends one read per call, per IP and per account per day; past the daily cap rate_limited from any IP", async () => {
    await list();
    expect(m.allow.mock.calls).toEqual([["residents:203.0.113.9", 300, 3_600_000]]);
    expect(m.reads).toHaveBeenCalledTimes(1);
    expect(m.reads.mock.lastCall!.slice(1)).toEqual(["u1"]); // the account's row, counted in the database
    readsToday = RESIDENTS_READS_PER_DAY - 1;
    expect(await denied()).toBeNull(); // the cap-th read
    expect(await denied()).toBe("rate_limited");
    m.getCurrentUser.mockResolvedValueOnce(null);
    expect(await denied()).toBe("rate_limited");
  });
});

describe("query", () => {
  it("filters: name tokens, college, state, courses, year, rank range, quota, hasRank; never hidden", async () => {
    await list({ q: " aB  cD ", college: "x-college", state: "Kerala", course: ["md-paediatrics", "ms-obg"], year: 2025, rankFrom: 10, rankTo: 20, quota: "All India", hasRank: "1" });
    expect(where()).toEqual({
      hidden: false,
      year: 2025,
      quota: "All India",
      rank: { gte: 10, lte: 20, not: null },
      college: { slug: "x-college", state: "Kerala" },
      specialty: { slug: { in: ["md-paediatrics", "ms-obg"] } },
      AND: [{ name: { contains: "aB", mode: "insensitive" } }, { name: { contains: "cD", mode: "insensitive" } }],
    });
    // withRank: the same filters plus a rank
    expect(m.count.mock.calls.map((c) => c[0].where)).toEqual([where(), { AND: [where(), { rank: { not: null } }] }]);
    await list({ q: "50%_a\\" }); // LIKE wildcards are matched literally
    expect(where().AND).toEqual([{ name: { contains: "50\\%\\_a\\\\", mode: "insensitive" } }]);
  });

  it("hasRank 0/false = without a rank, 1/true = with one, absent = both", async () => {
    for (const [v, rank] of [["0", { equals: null }], ["false", { equals: null }], ["1", { not: null }], ["true", { not: null }]] as const) {
      await list({ hasRank: v });
      expect(where().rank, v).toEqual(rank);
    }
    await list();
    expect([where().rank, where().college, where().specialty, where().AND]).toEqual([{}, undefined, undefined, []]);
  });

  it("the minority quotas: shown as one Minority; either label (or Minority) filters both", async () => {
    m.findMany.mockResolvedValueOnce([{ ...row, quota: "Muslim Minority" }, { ...row, id: "r2", quota: "Jain Minority" }, { ...row, id: "r3", quota: null }]);
    expect((await list()).rows.map((r) => r.quota)).toEqual(["Minority", "Minority", null]);
    for (const quota of ["Minority", "Muslim Minority", "Jain Minority"]) {
      await list({ quota });
      expect(where().quota, quota).toEqual({ in: ["Muslim Minority", "Jain Minority"] });
    }
  });

  it("sorts by rank (nulls last) by default, else name, year newest first or college; id last", async () => {
    const order = async (sort?: string) => (await list({ sort }), m.findMany.mock.lastCall![0].orderBy);
    expect(await order()).toEqual([{ rank: { sort: "asc", nulls: "last" } }, { name: "asc" }, { id: "asc" }]);
    expect((await order("name"))[0]).toEqual({ name: "asc" });
    expect((await order("year"))[0]).toEqual({ year: "desc" });
    expect((await order("college"))[0]).toEqual({ college: { name: "asc" } });
  });

  it(`pages of ${RESIDENTS_PAGE_SIZE}; none read past page ${RESIDENTS_MAX_PAGE}`, async () => {
    const r = await list({ page: 3 });
    expect(m.findMany.mock.lastCall![0]).toMatchObject({ skip: 2 * RESIDENTS_PAGE_SIZE, take: RESIDENTS_PAGE_SIZE });
    expect(r).toMatchObject({ total: 120, withRank: 120, page: 3, pageSize: RESIDENTS_PAGE_SIZE });
    expect(r.rows[0]).toEqual({ ...row, specialty: undefined, course: { degree: "MD", specialty: "PAEDIATRICS", name: "Paediatrics", slug: "md-paediatrics" } });
    expect(m.sources.mock.lastCall![0].where).toEqual({ key: { in: [row.sourceKey, row.rankBasis] } });
    expect(r.sources).toEqual([{ key: row.sourceKey, name: "MCC admitted candidates list (up to Round 3)", url: null, year: 2025 }]);
    m.findMany.mockClear();
    const deep = await list({ page: RESIDENTS_MAX_PAGE + 1 });
    expect([deep.rows, deep.total]).toEqual([[], 120]);
    expect(m.findMany).not.toHaveBeenCalled();
  });
});
