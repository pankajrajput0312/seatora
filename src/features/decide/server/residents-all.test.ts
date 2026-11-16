import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESIDENTS_PAGE_SIZE, residentsQuery } from "../residents-search";
import { listResidentsAll, RESIDENTS_MAX_PAGE, ResidentsDenied } from "./residents-all";

// Gates, read budget and paging of the search across institutes, on a mocked database (no names: one made-up row).
const m = vi.hoisted(() => ({
  hasSiteAccess: vi.fn(),
  getCurrentUser: vi.fn(),
  allow: vi.fn(),
  reads: vi.fn(),
  plan: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  sources: vi.fn(),
  colleges: vi.fn(),
}));
vi.mock("@/features/auth/lib/session", () => ({ hasSiteAccess: m.hasSiteAccess, getCurrentUser: m.getCurrentUser }));
vi.mock("@/lib/rate-limit", () => ({ allow: m.allow }));
vi.mock("@/features/plans/usage", () => ({ checkAndCount: m.plan }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: m.reads, resident: { count: m.count, findMany: m.findMany }, college: { findMany: m.colleges }, dataSource: { findMany: m.sources } } }));

const row = {
  id: "r1",
  name: "Test Person",
  year: 2025,
  list: "up to Round 3",
  sourceKey: "mcc/2025/admitted_upto_R3.pdf",
  quota: "All India",
  round: "R2",
  specialty: { degree: "MD", code: "PAEDIATRICS", name: "Paediatrics", slug: "md-paediatrics" },
  college: { slug: "x-college", name: "X College", state: "Kerala" },
};

const list = (q: Record<string, unknown> = {}) => listResidentsAll(residentsQuery.parse(q));
const denied = (q: Record<string, unknown> = {}) => list(q).then(() => null, (e: ResidentsDenied) => e.code);
const where = () => m.findMany.mock.lastCall![0].where;

const LIMIT = 10;
let readsToday = 0;
beforeEach(() => {
  vi.clearAllMocks();
  readsToday = 0;
  m.plan.mockImplementation(async () => ({ allowed: ++readsToday <= LIMIT, used: Math.min(readsToday, LIMIT), limit: LIMIT, resetAt: new Date() }));
  m.hasSiteAccess.mockResolvedValue(true);
  m.getCurrentUser.mockResolvedValue({ id: "u1", email: "x@seatora.test", name: "X" });
  m.allow.mockReturnValue(true);
  m.count.mockResolvedValue(120);
  m.findMany.mockResolvedValue([row]);
  m.colleges.mockResolvedValue([{ id: "c1" }]);
  m.sources.mockResolvedValue([{ key: row.sourceKey, name: "MCC admitted candidates list (up to Round 3)", url: null, counsellingYear: 2025 }]);
});

describe("gates and budget", () => {
  it("locked without names access, rate_limited once the IP budget is spent; nothing read", async () => {
    m.hasSiteAccess.mockResolvedValueOnce(false);
    expect(await denied()).toBe("locked");
    expect(m.allow).not.toHaveBeenCalled(); // no budget spent on a refused read
    m.allow.mockReturnValueOnce(false);
    expect(await denied()).toBe("rate_limited");
    expect(m.plan).not.toHaveBeenCalled();
    expect(m.count).not.toHaveBeenCalled();
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it("spends one read per call, per IP and per account per day; past the plan's daily reads plan_limit from any IP", async () => {
    await list();
    expect(m.allow.mock.calls).toEqual([["residents:203.0.113.9", 300, 3_600_000]]);
    expect(m.plan).toHaveBeenCalledTimes(1);
    expect(m.plan.mock.lastCall!.slice(0, 2)).toEqual(["u1", "residents"]); // the account's count, in the database
    readsToday = LIMIT - 1;
    expect(await denied()).toBeNull(); // the cap-th read
    expect(await denied()).toBe("plan_limit");
    m.getCurrentUser.mockResolvedValueOnce(null);
    expect(await denied()).toBe("rate_limited");
  });
});

// A search token: in the resident's name, or one of the colleges whose name or address has it (looked up first: c1).
const anyOf = (t: object) => ({ OR: [{ name: t }, { collegeId: { in: ["c1"] } }] });

describe("query", () => {
  it("filters: name tokens, colleges, state, courses, year, quota; never hidden, never by rank", async () => {
    await list({ q: " aB  cD ", college: ["x-college", "y-college"], state: ["Kerala"], course: ["md-paediatrics", "ms-obg"], year: [2025], quota: "All India", rankFrom: 10, hasRank: "1" });
    expect(where()).toEqual({
      hidden: false,
      year: { in: [2025] },
      quota: "All India",
      college: { slug: { in: ["x-college", "y-college"] }, state: { in: ["Kerala"] } },
      specialty: { slug: { in: ["md-paediatrics", "ms-obg"] } },
      AND: ["ab", "cd"].map((t) => anyOf({ contains: t, mode: "insensitive" })),
    });
    expect(m.count.mock.calls.map((c) => c[0].where)).toEqual([where()]);
    expect(m.colleges.mock.calls.map((c) => c[0].where)).toEqual(["ab", "cd"].map((t) => ({ OR: [{ name: { contains: t, mode: "insensitive" } }, { address: { contains: t, mode: "insensitive" } }] })));
    expect(m.findMany.mock.lastCall![0].select).not.toHaveProperty("rank");
    expect(m.findMany.mock.lastCall![0].select).not.toHaveProperty("rankBasis");
    await list({ q: "50%_a\\" }); // LIKE wildcards are matched literally
    expect(where().AND).toEqual([anyOf({ contains: "50\\%\\_a\\\\", mode: "insensitive" })]);
    // A short name: the word as typed, or the official words it stands for (KEM: Seth Gordhandas Sunderdas).
    await list({ q: "KEM" });
    const w = (t: string) => anyOf({ contains: t, mode: "insensitive" });
    expect(where().AND).toEqual([{ OR: [{ AND: [w("kem")] }, { AND: [w("gordhandas"), w("sunderdas")] }] }]);
    await list();
    expect([where().college, where().specialty, where().AND]).toEqual([undefined, undefined, []]);
    await list({ state: ["Kerala"] });
    expect(where().college).toEqual({ slug: undefined, state: { in: ["Kerala"] } });
  });

  it("the minority quotas: shown as one Minority; either label (or Minority) filters both", async () => {
    m.findMany.mockResolvedValueOnce([{ ...row, quota: "Muslim Minority" }, { ...row, id: "r2", quota: "Jain Minority" }, { ...row, id: "r3", quota: null }]);
    expect((await list()).rows.map((r) => r.quota)).toEqual(["Minority", "Minority", null]);
    for (const quota of ["Minority", "Muslim Minority", "Jain Minority"]) {
      await list({ quota });
      expect(where().quota, quota).toEqual({ in: ["Muslim Minority", "Jain Minority"] });
    }
  });

  it("sorts by year newest first, then college and name, by default; else name or college; never rank; id last", async () => {
    const order = async (sort?: string) => (await list({ sort }), m.findMany.mock.lastCall![0].orderBy);
    expect(await order()).toEqual([{ year: "desc" }, { college: { name: "asc" } }, { collegeId: "asc" }, { name: "asc" }, { id: "asc" }]);
    expect((await order("name"))[0]).toEqual({ name: "asc" });
    expect((await order("college"))[0]).toEqual({ college: { name: "asc" } });
  });

  it(`pages of ${RESIDENTS_PAGE_SIZE}; none read past page ${RESIDENTS_MAX_PAGE}`, async () => {
    const r = await list({ page: 3 });
    expect(m.findMany.mock.lastCall![0]).toMatchObject({ skip: 2 * RESIDENTS_PAGE_SIZE, take: RESIDENTS_PAGE_SIZE });
    expect(r).toMatchObject({ total: 120, page: 3, pageSize: RESIDENTS_PAGE_SIZE });
    expect(r).not.toHaveProperty("withRank");
    expect(r.rows[0]).toEqual({ ...row, specialty: undefined, course: { degree: "MD", specialty: "PAEDIATRICS", name: "Paediatrics", slug: "md-paediatrics" } });
    expect(m.sources.mock.lastCall![0].where).toEqual({ key: { in: [row.sourceKey] } });
    expect(r.sources).toEqual([{ key: row.sourceKey, name: "MCC admitted candidates list (up to Round 3)", url: null, year: 2025 }]);
    m.findMany.mockClear();
    const deep = await list({ page: RESIDENTS_MAX_PAGE + 1 });
    expect([deep.rows, deep.total]).toEqual([[], 120]);
    expect(m.findMany).not.toHaveBeenCalled();
  });
});
