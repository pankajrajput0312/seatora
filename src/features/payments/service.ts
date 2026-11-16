import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { track } from "@/features/funnel/service";
import { freeNow } from "@/features/plans/plans";
import { quote, recordEarning, type Quote } from "@/features/referrals/service";
import { db } from "@/lib/db";
import { couponCodeSchema, couponError, couponPrice } from "./coupons";
import { grantPlan } from "./grant";
import { PLANS, type Plan } from "./plans";

/**
 * Marks the order paid, grants its plan and (with a referrer) records the referrer's earning, once and together: the
 * conditional update lets only the first of verify and the webhook through (Postgres re-checks the WHERE under the row
 * lock), so a repeat is a no-op. A failed order can still be paid (Checkout lets her retry on the same order).
 * A coupon order counts the coupon's use and records her redemption here. The one that marks it records payment_paid
 * (docs/FUNNEL.md).
 */
export async function markPaid(razorpayOrderId: string, razorpayPaymentId: string) {
  const p = await db.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { razorpayOrderId, status: { not: "paid" } },
      data: { status: "paid", razorpayPaymentId, paidAt: new Date() },
    });
    if (count !== 1) return null;
    const p = await tx.payment.findUnique({ where: { razorpayOrderId }, select: { id: true, userId: true, plan: true, amount: true, referrerId: true, couponId: true } });
    if (!p) return null;
    await grantPlan(p.userId, p.plan as Plan, tx);
    await recordEarning(tx, p);
    if (p.couponId) {
      // ponytail: counted when paid (she has paid), so orders open at once can take a coupon past maxUses; check it at order time only.
      await tx.coupon.update({ where: { id: p.couponId }, data: { uses: { increment: 1 } } });
      await tx.couponRedemption.createMany({ data: [{ couponId: p.couponId, userId: p.userId, paymentId: p.id }], skipDuplicates: true });
    }
    return p;
  });
  if (p) await track("payment_paid", { userId: p.userId, meta: { amount: p.amount, referred: !!p.referrerId, coupon: !!p.couponId } });
}

/** The webhook's payment.failed: a created order becomes failed (a paid one never), with a payment_failed event. */
export async function markFailed(razorpayOrderId: string) {
  const { count } = await db.payment.updateMany({ where: { razorpayOrderId, status: "created" }, data: { status: "failed" } });
  const p = count ? await db.payment.findUnique({ where: { razorpayOrderId }, select: { userId: true } }) : null;
  if (p) await track("payment_failed", { userId: p.userId, aid: null });
}

export async function hasPaid(userId: string, plan: Plan = "season_pass") {
  return !!(await db.payment.findFirst({ where: { userId, plan, status: "paid" }, select: { id: true } }));
}

export type Price = Quote & { couponId: string | null; coupon: string | null };

/**
 * Her Season Pass price with `code` (paise): a coupon first (it replaces any referral discount, and earns no referrer),
 * else the referral quote (referrals/service). `error` says why a given code gave nothing. `buyerId` null: display only.
 */
export async function priceFor(buyerId: string | null, code?: string | null, now = new Date()): Promise<Price> {
  const parsed = couponCodeSchema.safeParse(code);
  const c = parsed.success ? await db.coupon.findUnique({ where: { code: parsed.data } }) : null;
  if (!c) return { ...(await quote(buyerId, code)), couponId: null, coupon: null };
  const listAmount = PLANS.season_pass.amount;
  const [buyer, redeemed, paid] = buyerId
    ? await Promise.all([
        db.user.findUnique({ where: { id: buyerId }, select: { email: true } }),
        db.couponRedemption.findUnique({ where: { couponId_userId: { couponId: c.id, userId: buyerId } }, select: { id: true } }),
        db.payment.findFirst({ where: { userId: buyerId, status: "paid" }, select: { id: true } }),
      ])
    : [null, null, null];
  const error = couponError(c, buyer && { email: buyer.email, redeemed: !!redeemed, paid: !!paid }, now, freeNow(now));
  const amount = error ? listAmount : couponPrice(listAmount, c.percentOff);
  return { listAmount, amount, discount: listAmount - amount, referrerId: null, inviter: null, couponId: error ? null : c.id, coupon: c.code, error };
}

/**
 * A 100% coupon: in one transaction, take one use (only while uses < maxUses: Postgres re-checks it under the row lock),
 * record her redemption and a paid ₹0 Payment, and grant the Season Pass (grantPlan: till SEASON_PASS_UNTIL, also during
 * the free period). "used_up" when the last use went to someone else, "redeemed" when she has it already (the unique
 * couponId+userId rolls everything back), so a repeat or a race grants and counts once. Then a payment_paid event
 * (amount 0, coupon), as for a paid order.
 */
export async function redeemFreeCoupon(userId: string, couponId: string, listAmount: number): Promise<"ok" | "used_up" | "redeemed"> {
  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.coupon.updateMany({
        where: { id: couponId, OR: [{ maxUses: null }, { uses: { lt: tx.coupon.fields.maxUses } }] },
        data: { uses: { increment: 1 } },
      });
      if (count !== 1) throw new CouponTaken();
      const id = randomUUID();
      const { currency } = PLANS.season_pass;
      await tx.payment.create({ data: { id, userId, plan: "season_pass", amount: 0, listAmount, discount: listAmount, couponId, currency, status: "paid", paidAt: new Date() } });
      await tx.couponRedemption.create({ data: { couponId, userId, paymentId: id } });
      await grantPlan(userId, "season_pass", tx);
      console.info(JSON.stringify({ event: "coupon_redeemed", userId, couponId }));
    });
  } catch (e) {
    if (e instanceof CouponTaken) return "used_up";
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "redeemed";
    throw e;
  }
  await track("payment_paid", { userId, meta: { amount: 0, referred: false, coupon: true } });
  return "ok";
}
class CouponTaken extends Error {}

/** /decide/admin: every coupon, newest first, with who redeemed it. */
export async function couponAdmin() {
  return db.coupon.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { redemptions: { orderBy: { createdAt: "asc" }, select: { id: true, createdAt: true, user: { select: { email: true } } } } },
  });
}
