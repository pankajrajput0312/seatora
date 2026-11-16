import "server-only";
import { recordEarning } from "@/features/referrals/service";
import { db } from "@/lib/db";
import { grantPlan } from "./grant";
import type { Plan } from "./plans";

/**
 * Marks the order paid, grants its plan and (with a referrer) records the referrer's earning, once and together: the
 * conditional update lets only the first of verify and the webhook through (Postgres re-checks the WHERE under the row
 * lock), so a repeat is a no-op. A failed order can still be paid (Checkout lets her retry on the same order).
 */
export async function markPaid(razorpayOrderId: string, razorpayPaymentId: string) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { razorpayOrderId, status: { not: "paid" } },
      data: { status: "paid", razorpayPaymentId, paidAt: new Date() },
    });
    if (count !== 1) return;
    const p = await tx.payment.findUnique({ where: { razorpayOrderId }, select: { id: true, userId: true, plan: true, amount: true, referrerId: true } });
    if (!p) return;
    await grantPlan(p.userId, p.plan as Plan, tx);
    await recordEarning(tx, p);
  });
}

export async function markFailed(razorpayOrderId: string) {
  await db.payment.updateMany({ where: { razorpayOrderId, status: "created" }, data: { status: "failed" } });
}

export async function hasPaid(userId: string, plan: Plan = "season_pass") {
  return !!(await db.payment.findFirst({ where: { userId, plan, status: "paid" }, select: { id: true } }));
}
