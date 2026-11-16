import "server-only";
import { track } from "@/features/funnel/service";
import { recordEarning } from "@/features/referrals/service";
import { db } from "@/lib/db";
import { grantPlan } from "./grant";
import type { Plan } from "./plans";

/**
 * Marks the order paid, grants its plan and (with a referrer) records the referrer's earning, once and together: the
 * conditional update lets only the first of verify and the webhook through (Postgres re-checks the WHERE under the row
 * lock), so a repeat is a no-op. A failed order can still be paid (Checkout lets her retry on the same order).
 * The one that marks it records payment_paid (docs/FUNNEL.md).
 */
export async function markPaid(razorpayOrderId: string, razorpayPaymentId: string) {
  const p = await db.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { razorpayOrderId, status: { not: "paid" } },
      data: { status: "paid", razorpayPaymentId, paidAt: new Date() },
    });
    if (count !== 1) return null;
    const p = await tx.payment.findUnique({ where: { razorpayOrderId }, select: { id: true, userId: true, plan: true, amount: true, referrerId: true } });
    if (!p) return null;
    await grantPlan(p.userId, p.plan as Plan, tx);
    await recordEarning(tx, p);
    return p;
  });
  if (p) await track("payment_paid", { userId: p.userId, meta: { amount: p.amount, referred: !!p.referrerId } });
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
