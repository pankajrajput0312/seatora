import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { allotmentsQuerySchema, compareQuerySchema, cutoffsQuerySchema, handle, optionsQuerySchema, parseOptionalProfile, parseProfile, parseQuery, rankScanQuerySchema, sourcesFor } from "./api";

const access = vi.hoisted(() => ({ ok: true }));
vi.mock("@/features/auth/lib/session", () => ({ canUseDecide: async () => access.ok }));

const qs = (s: string) => new URLSearchParams(s);

describe("query schemas", () => {
  it("applies defaults and reads lists repeated or comma-separated", () => {
    const r = parseQuery(optionsQuerySchema, qs("reach=within-10,reached-one&reach=no-data&showClosed=1"), ["reach"]);
    expect(r.success && r.data).toEqual({ page: 1, pageSize: 50, reach: ["within-10", "reached-one", "no-data"], showClosed: true, prov: true });
  });
  it("options: view, seats and closed left to the view unless given; older hasSeats values keep their meaning", () => {
    const data = (s: string) => {
      const r = parseQuery(optionsQuerySchema, qs(s));
      return r.success ? { view: r.data.view, hasSeats: r.data.hasSeats, showClosed: r.data.showClosed } : null;
    };
    expect(data("")).toEqual({ view: undefined, hasSeats: undefined, showClosed: undefined });
    expect(data("view=all&hasSeats=1&showClosed=0")).toEqual({ view: "all", hasSeats: "clear", showClosed: false });
    expect(["hasSeats=0", "hasSeats=false", "hasSeats=all"].map((s) => data(s)?.hasSeats)).toEqual([false, false, false]);
    expect(["hasSeats=any", "hasSeats=virtual", "hasSeats=true"].map((s) => data(s)?.hasSeats)).toEqual(["any", "virtual", "clear"]);
    expect(data("view=r2")).toBeNull();
  });
  it("treats empty values as absent", () => {
    const r = parseQuery(allotmentsQuerySchema, qs("year=&round=&from=30,000&to=50000"));
    expect(r.success && r.data).toMatchObject({ from: 30000, to: 50000, page: 1 });
    expect(r.success && r.data.year).toBeUndefined();
  });
  it("rejects bad values with a path", () => {
    const bad = (schema: Parameters<typeof parseQuery>[0], s: string, lists?: string[]) => {
      const r = parseQuery(schema, qs(s), lists);
      return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    };
    expect(bad(allotmentsQuerySchema, "pageSize=500")).toEqual(["pageSize"]);
    expect(bad(allotmentsQuerySchema, "from=50000&to=30000")).toEqual(["from"]);
    expect(bad(allotmentsQuerySchema, "round=R9&category=GEN")).toEqual(["round", "category"]);
    expect(bad(optionsQuerySchema, "reach=maybe", ["reach"])).toEqual(["reach.0"]);
    expect(bad(cutoffsQuerySchema, "specialty=anaesthesia")).toEqual(["specialty"]);
    expect(bad(compareQuerySchema, "ids=a,b,c,d,e", ["ids"])).toEqual(["ids"]);
  });
  it("compare counts a repeated id once before the limit of 4; rank-scan takes 42,284", () => {
    const r = parseQuery(compareQuerySchema, qs("ids=a&ids=a&ids=a&ids=a&ids=a,b"), ["ids"]);
    expect(r.success && r.data.ids).toEqual(["a", "b"]);
    const s = parseQuery(rankScanQuerySchema, qs("rank=42,284"));
    expect(s.success && s.data).toEqual({ rank: 42284, window: 500 }); // no year: the route takes the newest one in the data
  });
});

describe("handle", () => {
  const code = async (r: Response) => [r.status, ((await r.json()) as { error?: { code: string } }).error?.code];
  it("answers 503 data_unavailable when Postgres can't be reached, 500 for anything else", async () => {
    const down = new Prisma.PrismaClientInitializationError("Can't reach database server at localhost:5432", "6.0.0");
    const timeout = new Prisma.PrismaClientKnownRequestError("Timed out fetching a new connection", { code: "P2024", clientVersion: "6.0.0" });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await handle(async () => { throw down; });
    expect(await code(r)).toEqual([503, "data_unavailable"]);
    expect(r.headers.get("Retry-After")).toBe("60");
    expect(await code(await handle(async () => { throw timeout; }))).toEqual([503, "data_unavailable"]);
    expect(await code(await handle(async () => { throw new Error("bug"); }))).toEqual([500, "internal_error"]);
    quiet.mockRestore();
  });
  it("answers 401 without a live session, before the handler runs", async () => {
    access.ok = false;
    const fn = vi.fn(async () => Response.json({}));
    expect(await code(await handle(fn))).toEqual([401, "unauthorized"]);
    expect(fn).not.toHaveBeenCalled();
    access.ok = true;
  });
});

describe("profile params", () => {
  it("parses the same keys as the Decide URL, strictly", () => {
    const r = parseProfile(qs("rank=42,284&cat=OBC&sp=ANAESTHESIOLOGY,FAMILYMEDICINE&fee=5"));
    expect(r.success && r.data).toEqual({
      rank: 42284, category: "OBC", pwd: false, specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: [], quotas: [], states: [], maxFeeLakh: 5, maxBondYears: null,
    });
    expect(parseProfile(qs("rank=42284&fee=abc")).success).toBe(false);
    expect(parseProfile(qs("cat=OBC")).success).toBe(false);
    // The Decide URL's category words: GEN / UR / General are Open, a -PwD suffix is PwD; anything else fails.
    expect(parseProfile(qs("rank=42284&cat=GEN")).data).toMatchObject({ category: "Open", pwd: false });
    expect(parseProfile(qs("rank=42284&cat=UR-PwD")).data).toMatchObject({ category: "Open", pwd: true });
    expect(parseProfile(qs("rank=42284&cat=XYZ")).success).toBe(false);
  });
  it("reads pwd as 1/true/yes or 0/false/no, rejects anything else; cat in any case", () => {
    for (const v of ["1", "true", "yes", "TRUE"]) expect(parseProfile(qs(`rank=1&pwd=${v}`)).data?.pwd).toBe(true);
    for (const v of ["0", "false", "no", ""]) expect(parseProfile(qs(`rank=1&pwd=${v}`)).data?.pwd).toBe(false);
    expect(parseProfile(qs("rank=1&pwd=maybe")).success).toBe(false);
    expect(parseProfile(qs("rank=1&cat=obc")).data?.category).toBe("OBC");
  });
  it("optional profile: no rank → null", () => {
    expect(parseOptionalProfile(qs("cat=OBC"))).toMatchObject({ success: true, data: null });
    expect(parseOptionalProfile(qs("rank=0")).success).toBe(false);
  });
});

it("lists only the result PDFs a block uses, with the provisional flag", () => {
  const src = [
    { key: "a", url: "u1", year: 2025, round: "R1" as const, provisional: false, name: "2025 R1" },
    { key: "b", url: "u2", year: 2026, round: "R1" as const, provisional: true, name: "2026 R1" },
  ];
  expect(sourcesFor(src, [{ year: 2026, round: "R1" }])).toEqual([{ key: "b", name: "2026 R1", url: "u2", year: 2026, round: "R1", provisional: true }]);
  expect(sourcesFor(src)).toHaveLength(2);
});
