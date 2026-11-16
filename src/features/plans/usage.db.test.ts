import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// checkAndCount on a real database (local DATABASE_URL exported; skipped otherwise, as the other *.db tests).
const dbUrl = vi.hoisted(() => (process.env.DATABASE_URL ??= ""));

describe.skipIf(!dbUrl)("checkAndCount", async () => {
  const { db } = await import("@/lib/db");
  const { checkAndCount, usageToday } = await import("./usage");
  const email = `plans-${Date.now()}@seatora.test`;
  let userId = "";
  beforeAll(async () => {
    userId = (await db.user.create({ data: { email, name: "Plans test", passwordHash: "x" } })).id;
  });
  afterAll(async () => {
    await db.$executeRaw`DELETE FROM "UsageDaily" WHERE "userId" = ${userId}`;
    await db.$executeRaw`DELETE FROM "UsageDistinct" WHERE "userId" = ${userId}`;
    await db.user.delete({ where: { id: userId } });
  });
  const day1 = new Date("2030-01-01T10:00:00Z");
  const day2 = new Date("2030-01-01T18:30:00Z"); // 00:00 IST on 2 Jan

  it("counts up to the Free limit, then refuses without counting; the next IST day starts again", async () => {
    const r = [];
    for (let i = 0; i < 11; i++) r.push(await checkAndCount(userId, "residents", undefined, { now: day1 }));
    expect(r.map((x) => x.allowed)).toEqual([...Array(10).fill(true), false]);
    expect([r[10].used, r[10].limit, r[10].resetAt.toISOString()]).toEqual([10, 10, "2030-01-01T18:30:00.000Z"]);
    expect((await checkAndCount(userId, "residents", undefined, { now: day2 })).used).toBe(1);
  });

  it("distinct keys: the same institute again is free; a new one past the limit is refused", async () => {
    for (let i = 0; i < 10; i++) expect((await checkAndCount(userId, "institutes", `c${i}`, { now: day1 })).allowed).toBe(true);
    expect((await checkAndCount(userId, "institutes", "c3", { now: day1 })).allowed).toBe(true);
    const over = await checkAndCount(userId, "institutes", "c10", { now: day1 });
    expect([over.allowed, over.used]).toEqual([false, 10]);
    expect((await usageToday(userId, day1)).institutes).toBe(10);
    // Premium: unlimited institutes.
    expect((await checkAndCount(userId, "institutes", "c11", { now: day1, account: { role: "PREMIUM", premiumUntil: null } })).allowed).toBe(true);
  });
});
