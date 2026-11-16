/** What each plan costs, in paise. The order route reads it; the browser never sends an amount. */
export const PLANS = {
  season_pass: { amount: 49900, currency: "INR", description: "Season Pass" },
} as const;

export type Plan = keyof typeof PLANS;
