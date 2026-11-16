import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// redeemFreeCoupon on a real database, many at once (local DATABASE_URL exported; skipped otherwise, as the other *.db tests).
const dbUrl = vi.hoisted(() => (process.env.DATABASE_URL ??= ""));

describe.skipIf(!dbUrl)("redeemFreeCoupon under concurrency", async () => {
  const { db } = await import("@/lib/db");
  const { redeemFreeCoupon } = await import("./service");
  const { SEASON_PASS_UNTIL } = await import("./grant");
  const run = Date.now().toString(36).toUpperCase();
  const users: string[] = [];
  const coupons: string[] = [];
  beforeAll(async () => {
    for (let i = 0; i < 6; i++) users.push((await db.user.create({ data: { email: `coupon-${run}-${i}@seatora.test`, name: "Coupon test", passwordHash: "x" } })).id);
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: users } } }); // cascades to payments and redemptions
    await db.coupon.deleteMany({ where: { id: { in: coupons } } });
  });
  const coupon = async (maxUses: number | null) => {
    const c = await db.coupon.create({ data: { code: `T${run}${coupons.length}`.slice(0, 20), percentOff: 100, maxUses } });
    coupons.push(c.id);
    return c.id;
  };

  it("one buyer, ten requests at once: one redemption, one ₹0 paid row, one use, the pass till the season's end", async () => {
    const id = await coupon(null);
    const r = await Promise.all(Array.from({ length: 10 }, () => redeemFreeCoupon(users[0], id, 19900)));
    expect(r.filter((x) => x === "ok")).toHaveLength(1);
    expect(r.filter((x) => x !== "ok").every((x) => x === "redeemed")).toBe(true);
    expect((await db.coupon.findUniqueOrThrow({ where: { id } })).uses).toBe(1);
    expect(await db.payment.findMany({ where: { userId: users[0] }, select: { amount: true, discount: true, status: true, razorpayOrderId: true } })).toEqual([
      { amount: 0, discount: 19900, status: "paid", razorpayOrderId: null },
    ]);
    expect((await db.user.findUniqueOrThrow({ where: { id: users[0] } })).premiumUntil).toEqual(SEASON_PASS_UNTIL);
  });

  it("five buyers at once for two uses left of three: exactly two get it", async () => {
    const id = await coupon(3);
    await db.coupon.update({ where: { id }, data: { uses: 1 } });
    const r = await Promise.all(users.slice(1).map((u) => redeemFreeCoupon(u, id, 19900)));
    expect(r.filter((x) => x === "ok")).toHaveLength(2);
    expect(r.filter((x) => x === "used_up")).toHaveLength(3);
    expect((await db.coupon.findUniqueOrThrow({ where: { id } })).uses).toBe(3);
    expect(await db.couponRedemption.count({ where: { couponId: id } })).toBe(2);
  });
});
