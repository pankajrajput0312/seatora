import { beforeEach, describe, expect, it, vi } from "vitest";

// The account copies per exam: NEET PG's row json as before (no extra read for a member), another exam's only for
// staff, under its key, never overwriting the others.
const { rows, user, table } = vi.hoisted(() => {
  const rows = new Map<string, { json: unknown; updatedAt: Date }>();
  const table = {
    findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => (rows.has(where.userId) ? { userId: where.userId, ...rows.get(where.userId)! } : null)),
    create: vi.fn(async ({ data }: { data: { userId: string; json: unknown; updatedAt: Date } }) => void rows.set(data.userId, { json: data.json, updatedAt: data.updatedAt })),
    updateMany: vi.fn(async ({ where, data }: { where: { userId: string; updatedAt: Date }; data: { json: unknown; updatedAt: Date } }) => {
      const r = rows.get(where.userId);
      if (!r || r.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
      rows.set(where.userId, data);
      return { count: 1 };
    }),
  };
  return { rows, table, user: { current: null as null | { id: string; role: string } } };
});
vi.mock("@/lib/db", () => ({ db: { userProfile: table, userChoices: table } }));
vi.mock("@/features/auth/lib/session", () => ({ getCurrentUser: async () => user.current }));
vi.mock("@/features/plans/usage", () => ({ planCap: async () => 10 }));

import { loadSynced, saveSynced } from "./sync-actions";

const profile = (rank: number) => ({ rank, category: "Open", pwd: false, specialties: [], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null });
beforeEach(() => {
  rows.clear();
  vi.clearAllMocks();
});

describe("saveSynced / loadSynced per exam", () => {
  it("a member's NEET PG profile: the row json is the profile, saved with no extra read", async () => {
    user.current = { id: "m", role: "USER" };
    expect(await saveSynced("profile", profile(42284), null)).toMatchObject({ ok: true });
    expect(rows.get("m")!.json).toEqual(profile(42284));
    expect(table.findUnique).not.toHaveBeenCalled();
    expect((await loadSynced())?.profile?.value).toEqual(profile(42284));
  });

  it("a member can't read or write another exam's", async () => {
    user.current = { id: "m", role: "USER" };
    expect(await saveSynced("profile", profile(5), null, "neet-mds")).toBeNull();
    expect(await loadSynced("neet-ss")).toBeNull();
    expect(await saveSynced("profile", profile(5), null, "ini-cet")).toBeNull();
    expect(await loadSynced("ini-cet")).toBeNull();
    expect(rows.size).toBe(0);
  });

  it("staff: each exam under its key, NEET PG's top level untouched, and the other way round", async () => {
    user.current = { id: "o", role: "OWNER" };
    const pg = await saveSynced("profile", profile(42284), null);
    expect(pg).toMatchObject({ ok: true });
    const at = (pg as { at: number }).at;
    expect(await saveSynced("profile", profile(900), at, "neet-mds")).toMatchObject({ ok: true });
    expect(rows.get("o")!.json).toEqual({ ...profile(42284), "neet-mds": profile(900) });
    const s = await loadSynced("neet-mds");
    expect(s?.profile?.value).toEqual(profile(900));
    expect((await loadSynced())?.profile?.value).toEqual(profile(42284));
    // A NEET PG save keeps the MDS copy.
    expect(await saveSynced("profile", profile(1), s!.profile!.at)).toMatchObject({ ok: true });
    expect(rows.get("o")!.json).toEqual({ ...profile(1), "neet-mds": profile(900) });
  });

  it("staff's first copy of an exam on an existing row: a conflict, then a merge on the row's time", async () => {
    user.current = { id: "o", role: "ADMIN" };
    const pg = (await saveSynced("profile", profile(7), null)) as { at: number };
    const first = await saveSynced("profile", profile(8), null, "neet-ss");
    expect(first).toEqual({ ok: false, server: { value: null, at: pg.at } });
    expect(await saveSynced("profile", profile(8), pg.at, "neet-ss")).toMatchObject({ ok: true });
    expect(rows.get("o")!.json).toEqual({ ...profile(7), "neet-ss": profile(8) });
  });
});
