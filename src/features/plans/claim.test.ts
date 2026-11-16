import { beforeEach, describe, expect, it, vi } from "vitest";

// The free upgrade on an in-memory User table with updateMany's WHERE (premiumUntil null or earlier than the end).
type U = { id: string; premiumUntil: Date | null };
const m = vi.hoisted(() => ({ users: [] as U[] }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      updateMany: async ({ where, data }: { where: { id: string; OR: [unknown, { premiumUntil: { lt: Date } }] }; data: { premiumUntil: Date } }) => {
        const hit = m.users.filter((u) => u.id === where.id && (u.premiumUntil === null || u.premiumUntil < where.OR[1].premiumUntil.lt));
        hit.forEach((u) => (u.premiumUntil = data.premiumUntil));
        return { count: hit.length };
      },
    },
    funnelEvent: { create: async () => ({}) },
  },
}));
const { claimFreePass } = await import("./claim");

const END = new Date("2026-11-20T18:29:59Z"); // 2026-11-20T23:59:59+05:30
const before = new Date("2026-11-18T06:00:00Z");
const after = new Date("2026-11-21T06:00:00Z");
beforeEach(() => {
  vi.stubEnv("FREE_FOR_ALL_UNTIL", "2026-11-20T23:59:59+05:30");
  m.users = [{ id: "u1", premiumUntil: null }];
});

describe("claimFreePass", () => {
  it("sets premiumUntil to the end of the free period, and again changes nothing", async () => {
    expect(await claimFreePass("u1", before)).toBe(true);
    expect(m.users[0].premiumUntil).toEqual(END);
    expect(await claimFreePass("u1", before)).toBe(true);
    expect(m.users[0].premiumUntil).toEqual(END);
  });

  it("never shortens a later (paid) premiumUntil; lifts an earlier one", async () => {
    const paid = new Date("2027-03-31T18:29:59Z");
    m.users = [{ id: "u1", premiumUntil: paid }, { id: "u2", premiumUntil: new Date("2026-11-19T00:00:00Z") }];
    await claimFreePass("u1", before);
    await claimFreePass("u2", before);
    expect(m.users.map((u) => u.premiumUntil)).toEqual([paid, END]);
  });

  it("is refused once the free period is over (or without one)", async () => {
    expect(await claimFreePass("u1", after)).toBe(false);
    vi.stubEnv("FREE_FOR_ALL_UNTIL", "");
    expect(await claimFreePass("u1", before)).toBe(false);
    expect(m.users[0].premiumUntil).toBeNull();
  });
});
