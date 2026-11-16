import "server-only";
import { db } from "@/lib/db";
import { grantPlan } from "./grant";
import type { Plan } from "./plans";

/**
 * Marks the order paid and grants its plan, once: the conditional update lets only the first of verify and the webhook
 * through (Postgres re-checks the WHERE under the row lock), so a repeat is a no-op. A failed order can still be paid
 * (Checkout lets her retry on the same order).
 */
export async function markPaid(razorpayOrderId: string, razorpayPaymentId: string) {
  const { count } = await db.payment.updateMany({
    where: { razorpayOrderId, status: { not: "paid" } },
    data: { status: "paid", razorpayPaymentId, paidAt: new Date() },
  });
  if (count !== 1) return;
  const p = await db.payment.findUnique({ where: { razorpayOrderId }, select: { userId: true, plan: true } });
  if (p) await grantPlan(p.userId, p.plan as Plan);
}

export async function markFailed(razorpayOrderId: string) {
  await db.payment.updateMany({ where: { razorpayOrderId, status: "created" }, data: { status: "failed" } });
}

export async function hasPaid(userId: string, plan: Plan = "season_pass") {
  return !!(await db.payment.findFirst({ where: { userId, plan, status: "paid" }, select: { id: true } }));
}
