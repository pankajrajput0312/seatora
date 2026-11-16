import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Reset links on a real database (local DATABASE_URL exported; skipped otherwise, as the other *.db tests).
const dbUrl = vi.hoisted(() => (process.env.DATABASE_URL ??= ""));

describe.skipIf(!dbUrl)("password reset links", async () => {
  const { db } = await import("@/lib/db");
  const { newResetToken, redeemResetToken, resetTokenUser, RESET_TTL_MS } = await import("./reset");
  const run = Date.now().toString(36);
  let userId = "";
  const make = async (now = new Date()) => {
    const t = newResetToken(userId, now);
    await db.$transaction(t.writes);
    return t.token;
  };
  beforeAll(async () => {
    userId = (await db.user.create({ data: { email: `reset-${run}@seatora.test`, name: "Reset test", passwordHash: "old", failedLogins: 7 } })).id;
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { id: userId } }); // cascades to sessions and links
  });

  it("stores only the hash; works once; signs every device out; clears the lockout", async () => {
    await db.session.create({ data: { id: `s-${run}`, userId, expiresAt: new Date(Date.now() + 86_400_000) } });
    const token = await make();
    expect(await db.passwordReset.count({ where: { id: token } })).toBe(0);
    expect(await resetTokenUser(token)).toMatchObject({ id: userId });
    expect(await redeemResetToken(token, "new-hash")).toMatchObject({ id: userId });
    expect(await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, failedLogins: true } })).toEqual({ passwordHash: "new-hash", failedLogins: 0 });
    expect(await db.session.count({ where: { userId } })).toBe(0);
    // Used: gone, whether looked at or redeemed again.
    expect(await resetTokenUser(token)).toBeNull();
    expect(await redeemResetToken(token, "again")).toBeNull();
  });

  it("expires after an hour (and an expired one is deleted when tried)", async () => {
    const t0 = new Date();
    const token = await make(t0);
    const late = new Date(t0.getTime() + RESET_TTL_MS + 1000);
    expect(await resetTokenUser(token, new Date(t0.getTime() + RESET_TTL_MS - 1000))).not.toBeNull();
    expect(await resetTokenUser(token, late)).toBeNull();
    expect(await redeemResetToken(token, "late", late)).toBeNull();
    expect(await db.passwordReset.count({ where: { userId } })).toBe(0);
    expect((await db.user.findUnique({ where: { id: userId } }))!.passwordHash).toBe("new-hash");
  });

  it("a newer link voids the older; two redeems at once: one wins", async () => {
    const older = await make();
    const newer = await make();
    expect(await resetTokenUser(older)).toBeNull();
    const r = await Promise.all([redeemResetToken(newer, "a"), redeemResetToken(newer, "b")]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });
});
