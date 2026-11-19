/**
 * What each plan costs, in paise. The order route reads it; the browser never sends an amount. `wasAmount` is display
 * only and never charged: Decide's home box still strikes it ("~~₹499~~ ₹199"); the public pages, the plan cards and the
 * buy buttons state the price alone (components/marketing/price-line.tsx).
 */
export const PLANS = {
  season_pass: { amount: 19900, wasAmount: 49900, currency: "INR", description: "Season Pass" },
} as const;

export type Plan = keyof typeof PLANS;

/** Checkout shows only with keys set, and never with test keys on production (a test card would grant a real pass). */
export function paymentsOn(env: Record<string, string | undefined> = process.env) {
  const id = env.RAZORPAY_KEY_ID;
  return !!id && !!env.RAZORPAY_KEY_SECRET && !(env.VERCEL_ENV === "production" && id.startsWith("rzp_test_"));
}
