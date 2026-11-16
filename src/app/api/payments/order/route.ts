import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/features/auth/lib/session";
import { PLANS, paymentsOn } from "@/features/payments/plans";
import { createOrder, RazorpayError } from "@/features/payments/razorpay";
import { hasPaid } from "@/features/payments/service";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";

// POST → a Razorpay order for the Season Pass: { orderId, amount, currency, keyId, email }. The plan and its amount are
// chosen here; the request body is ignored. Signed in only. See docs/PAYMENTS.md.
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, code: string, message: string) => Response.json({ ok: false, error: { code, message } }, { status, headers });

export async function POST() {
  if (!paymentsOn()) return fail(503, "payments_off", "Payments are not open yet.");
  const user = await getCurrentUser();
  if (!user) return fail(401, "unauthorized", "Sign in to buy the Season Pass.");
  if (!allow(`pay-order:${user.id}`, 10, 60_000)) return fail(429, "rate_limited", "Too many tries. Wait a minute and try again.");
  const plan = "season_pass" as const;
  if (await hasPaid(user.id, plan)) return fail(409, "already_paid", "Your Season Pass is already active.");

  const { amount, currency } = PLANS[plan];
  const id = randomUUID(); // the order's receipt (Razorpay allows 40 characters)
  try {
    const order = await createOrder(amount, currency, id, { plan, userId: user.id });
    await db.payment.create({ data: { id, userId: user.id, plan, amount, currency, razorpayOrderId: order.id } });
    return Response.json({ orderId: order.id, amount, currency, keyId: order.keyId, email: user.email }, { headers });
  } catch (e) {
    if (e instanceof RazorpayError && e.status === 401) {
      console.error("Razorpay rejected the API keys (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
      return fail(502, "payments_unavailable", "Payments are not set up");
    }
    console.error("Payment order failed:", e instanceof Error ? e.message : e);
    return fail(500, "error", "Couldn't start the payment. Try again.");
  }
}
