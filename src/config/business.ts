import { siteConfig } from "@/config/site";

/** Seller details for the policy pages (an individual seller in India, not a registered business). Empty fields are not rendered. */
export const business = {
  sellerName: "Pankaj Rajput",
  address: "B-1/13 Shiv Ram Park, Nangloi, New Delhi 110041, India",
  phone: "+91 93156 30275",
  email: siteConfig.contactEmail,
  /** The Season Pass's price in rupees (features/payments PLANS charges it in paise). Free till FREE_FOR_ALL_UNTIL. */
  regularPrice: 499,
  period: "per NEET PG counselling season",
  /** What a season is and when access ends (Pricing and Terms). */
  season:
    "A season is one year's MCC NEET PG counselling, from Round 1 to the last stray vacancy round. The current Season Pass is for the 2026 season, and access ends when MCC's 2026 counselling ends.",
};
