import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/lib/session";
import { PLANS, paymentsOn } from "@/features/payments/plans";
import { createOrder, RazorpayError } from "@/features/payments/razorpay";
import { track } from "@/features/funnel/service";
import { hasPaid, priceFor, redeemFreeCoupon } from "@/features/payments/service";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";

// POST { code? } (a coupon or a referral code) → a Razorpay order for the Season Pass: { orderId, amount, listAmount,
// discount, inviter, coupon, currency, keyId, email }; or, for a 100% coupon, the pass at once with no Razorpay call:
// { ok: true, free: true, coupon }. The plan and its amount are chosen here (PLANS, less the coupon's or the referral's
// discount: payments/service priceFor); nothing else in the body is read. Signed in only. See docs/PAYMENTS.md and
// docs/REFERRALS.md.
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, code: string, message: string) => Response.json({ ok: false, error: { code, message } }, { status, headers });
const bodySchema = z.object({ code: z.string().max(20).optional() });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "unauthorized", "Sign in to buy the Season Pass.");
  if (!allow(`pay-order:${user.id}`, 10, 60_000)) return fail(429, "rate_limited", "Too many tries. Wait a minute and try again.");
  const body = bodySchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!body.success) return fail(400, "invalid", "Invalid request.");
  const plan = "season_pass" as const;
  if (await hasPaid(user.id, plan)) return fail(409, "already_paid", "Your Season Pass is already active.");

  const code = body.data.code?.trim() || null;
  const { amount, listAmount, discount, referrerId, inviter, couponId, coupon, error } = await priceFor(user.id, code);
  if (error) return fail(400, coupon ? "invalid_coupon" : "invalid_referral", error);
  if (couponId && amount === 0) {
    // A 100% coupon needs no Razorpay, so it works while payments are off too.
    const r = await redeemFreeCoupon(user.id, couponId, listAmount);
    if (r === "used_up") return fail(400, "invalid_coupon", "This coupon has been used up.");
    if (r === "redeemed") return fail(409, "already_paid", "You've already used this coupon.");
    return Response.json({ ok: true, free: true, coupon }, { headers });
  }
  if (!paymentsOn()) return fail(503, "payments_off", "Payments are not open yet.");
  const { currency } = PLANS[plan];
  const id = randomUUID(); // the order's receipt (Razorpay allows 40 characters)
  try {
    const order = await createOrder(amount, currency, id, { plan, userId: user.id, ...(referrerId && { referrerId }), ...(coupon && { coupon }) });
    await db.payment.create({ data: { id, userId: user.id, plan, amount, listAmount, discount, referrerId, couponId, currency, razorpayOrderId: order.id } });
    await track("checkout_opened", { userId: user.id, meta: { amount, referred: !!referrerId, coupon: !!couponId } });
    return Response.json({ orderId: order.id, amount, listAmount, discount, inviter, coupon, currency, keyId: order.keyId, email: user.email, contact: user.phone }, { headers });
  } catch (e) {
    if (e instanceof RazorpayError && e.status === 401) {
      console.error("Razorpay rejected the API keys (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
      return fail(502, "payments_unavailable", "Payments are not set up");
    }
    console.error("Payment order failed:", e instanceof Error ? e.message : e);
    return fail(500, "error", "Couldn't start the payment. Try again.");
  }
}
