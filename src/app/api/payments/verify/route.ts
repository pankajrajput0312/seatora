import { z } from "zod";
import { getCurrentUser } from "@/features/auth/lib/session";
import { isValidPaymentSignature } from "@/features/payments/razorpay";
import { markPaid } from "@/features/payments/service";
import { db } from "@/lib/db";

// POST Checkout's success response { razorpay_order_id, razorpay_payment_id, razorpay_signature } → the Payment is paid.
// Signed in, and the order must be hers. A bad signature changes nothing. Repeats are no-ops (markPaid).
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const fail = (status: number, code: string, message: string) => Response.json({ ok: false, error: { code, message } }, { status, headers });

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "unauthorized", "Sign in again to confirm your payment.");
  const body = verifySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "invalid", "Missing payment details.");
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body.data;

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return fail(502, "payments_unavailable", "Payments are not set up");
  if (!isValidPaymentSignature(orderId, paymentId, signature, secret)) return fail(400, "bad_signature", "The payment could not be verified.");

  const payment = await db.payment.findUnique({ where: { razorpayOrderId: orderId }, select: { userId: true } });
  if (payment?.userId !== user.id) return fail(404, "not_found", "Payment not found.");

  await markPaid(orderId, paymentId);
  return Response.json({ ok: true }, { headers });
}
