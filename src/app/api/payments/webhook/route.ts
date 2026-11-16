import { isValidWebhookSignature } from "@/features/payments/razorpay";
import { markFailed, markPaid } from "@/features/payments/service";

// Razorpay webhooks (dashboard setup: docs/PAYMENTS.md): payment.captured and order.paid mark the order paid (for a
// buyer who closed the tab before verify ran), payment.failed marks it failed. Signed with RAZORPAY_WEBHOOK_SECRET.
// Orders that aren't ours, and other events, get a 200 so Razorpay doesn't retry them.
export const dynamic = "force-dynamic";

type Entity = { id?: string; order_id?: string };
type Event = { event?: string; payload?: { payment?: { entity?: Entity }; order?: { entity?: Entity } } };

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
  return new Response("ok");
}
