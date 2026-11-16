/** What each plan costs, in paise. The order route reads it; the browser never sends an amount. */
export const PLANS = {
  season_pass: { amount: 49900, currency: "INR", description: "Season Pass" },
} as const;

export type Plan = keyof typeof PLANS;

/** Checkout shows only with keys set, and never with test keys on production (a test card would grant a real pass). */
export function paymentsOn(env: Record<string, string | undefined> = process.env) {
  const id = env.RAZORPAY_KEY_ID;
  return !!id && !!env.RAZORPAY_KEY_SECRET && !(env.VERCEL_ENV === "production" && id.startsWith("rzp_test_"));
}
