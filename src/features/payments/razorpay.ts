import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay's Orders REST API and its two signatures, with fetch and node:crypto (no SDK). Keys: RAZORPAY_KEY_ID and
// RAZORPAY_KEY_SECRET; webhooks: RAZORPAY_WEBHOOK_SECRET. See docs/PAYMENTS.md.

export class RazorpayError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Creates an order; throws RazorpayError (status 401 when the keys are missing or wrong). */
export async function createOrder(amount: number, currency: string, receipt: string, notes: Record<string, string>) {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new RazorpayError(401, "Razorpay keys are not set");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency, receipt, notes }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; error?: { description?: string } } | null;
  if (!res.ok || !body?.id) throw new RazorpayError(res.status, body?.error?.description ?? `Razorpay answered ${res.status}`);
  return { id: body.id, keyId: id };
}

const hmac = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest();

function same(expected: Buffer, hex: string) {
  const got = Buffer.from(hex, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Checkout's razorpay_signature: HMAC-SHA256(order_id|payment_id, key secret), hex. */
export const isValidPaymentSignature = (orderId: string, paymentId: string, signature: string, secret: string) =>
  same(hmac(`${orderId}|${paymentId}`, secret), signature);

/** A webhook's X-Razorpay-Signature: HMAC-SHA256(raw body, webhook secret), hex. */
export const isValidWebhookSignature = (rawBody: string, signature: string, secret: string) => same(hmac(rawBody, secret), signature);
