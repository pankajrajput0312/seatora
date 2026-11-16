import { isValidWebhookSignature } from "@/features/payments/razorpay";
import { markFailed, markPaid } from "@/features/payments/service";
import { voidRefundedEarning } from "@/features/referrals/service";

// Razorpay webhooks (dashboard setup: docs/PAYMENTS.md): payment.captured and order.paid mark the order paid (for a
// buyer who closed the tab before verify ran), payment.failed marks it failed, refund.processed / payment.refunded void
// its referral earning if still pending (docs/REFERRALS.md). Signed with RAZORPAY_WEBHOOK_SECRET.
// Orders that aren't ours, and other events, get a 200 so Razorpay doesn't retry them.
export const dynamic = "force-dynamic";

type Entity = { id?: string; order_id?: string; payment_id?: string };
type Event = { event?: string; payload?: { payment?: { entity?: Entity }; order?: { entity?: Entity }; refund?: { entity?: Entity } } };

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook secret not set", { status: 503 });
  const raw = await req.text();
  if (!isValidWebhookSignature(raw, req.headers.get("x-razorpay-signature") ?? "", secret)) return new Response("Bad signature", { status: 400 });

  let e: Event;
  try {
    e = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const payment = e.payload?.payment?.entity;
  const orderId = payment?.order_id ?? e.payload?.order?.entity?.id;
  if (orderId && payment?.id && (e.event === "payment.captured" || e.event === "order.paid")) await markPaid(orderId, payment.id);
  else if (orderId && e.event === "payment.failed") await markFailed(orderId);
  else if (e.event === "refund.processed" || e.event === "payment.refunded") {
    const refund = e.payload?.refund?.entity;
    const paymentId = refund?.payment_id ?? payment?.id;
    if (paymentId) await voidRefundedEarning(paymentId, refund?.id);
  }
  return new Response("ok");
}
