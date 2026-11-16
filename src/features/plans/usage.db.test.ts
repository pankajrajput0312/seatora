import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// checkAndCount on a real database (local DATABASE_URL exported; skipped otherwise, as the other *.db tests).
const dbUrl = vi.hoisted(() => (process.env.DATABASE_URL ??= ""));

describe.skipIf(!dbUrl)("checkAndCount", async () => {
  const { db } = await import("@/lib/db");
  const { checkAndCount, usageToday } = await import("./usage");
  const email = `plans-${Date.now()}@seatora.test`;
  let userId = "";
  let userB = "";
  const aid = `T${Date.now()}`.padEnd(22, "x");
  const subjects = () => [userId, userB, `aid:${aid}`, `aid:${aid.replace("T", "U")}`];
  beforeAll(async () => {
    userId = (await db.user.create({ data: { email, name: "Plans test", passwordHash: "x" } })).id;
    userB = (await db.user.create({ data: { email: `b-${email}`, name: "Plans test B", passwordHash: "x" } })).id;
  });
  afterAll(async () => {
    await db.$executeRaw`DELETE FROM "UsageDaily" WHERE "userId" = ANY(${subjects()})`;
    await db.$executeRaw`DELETE FROM "UsageDistinct" WHERE "userId" = ANY(${subjects()})`;
    await db.user.deleteMany({ where: { id: { in: [userId, userB] } } });
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

  it("Free accounts on one device share its daily allowance; Premium, claimed, staff and the free period never meet it", async () => {
    const day = new Date("2030-02-01T10:00:00Z");
    const free = { role: "FREE", premiumUntil: null } as const;
    const use = (who: string, opts: Parameters<typeof checkAndCount>[3] = {}) => checkAndCount(who, "residents", undefined, { now: day, aid, account: free, ...opts });
    for (let i = 0; i < 6; i++) expect((await use(userId)).allowed).toBe(true);
    for (let i = 0; i < 4; i++) expect((await use(userB)).allowed).toBe(true);
    // B has used 4 of her own 10, but the device has used 10: refused as the device, and not counted on her.
    const r = await use(userB);
    expect([r.allowed, r.device, r.used, r.limit]).toEqual([false, true, 10, 10]);
    expect((await usageToday(userB, day)).residents).toBe(4);
    expect((await usageToday(`aid:${aid}`, day)).residents).toBe(10);
    // Not on the Free plan: no device count.
    expect((await use(userB, { account: { role: "FREE", premiumUntil: new Date("2031-01-01") } })).allowed).toBe(true); // paid or claimed
    expect((await use(userB, { account: { role: "PREMIUM", premiumUntil: null } })).allowed).toBe(true);
    expect((await use(userB, { account: { role: "ADMIN", premiumUntil: null } })).allowed).toBe(true);
    vi.stubEnv("FREE_FOR_ALL_UNTIL", "2030-02-20T23:59:59+05:30");
    expect((await use(userB)).allowed).toBe(true);
    vi.unstubAllEnvs();
    // B on another device: her own allowance (8 used) and that device's.
    const other = await use(userB, { aid: aid.replace("T", "U") });
    expect([other.allowed, other.device]).toEqual([true, undefined]);

    // Institutes (distinct): the device's 10 are shared too; one the device has already opened today is free.
    const inst = (who: string, key: string) => checkAndCount(who, "institutes", key, { now: day, aid, account: free });
    for (let i = 0; i < 10; i++) expect((await inst(i < 5 ? userId : userB, `k${i}`)).allowed).toBe(true);
    expect(await inst(userB, "k10")).toMatchObject({ allowed: false, device: true });
    expect((await inst(userB, "k2")).allowed).toBe(true); // A opened it on this device today
  });
});
