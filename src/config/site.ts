export const siteConfig = {
  name: "Seatora",
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  /** Where privacy and deletion requests go. Set NEXT_PUBLIC_CONTACT_EMAIL before launch. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  description:
    "The NEET PG planner: institutes, specialties, previous-year ranks, seat matrices, fees, stipends, bonds, residents by college and counselling updates in one place.",
  /** The public pages every menu links (header, phone menu, footer); the planner link is PlannerCta's, signed-in aware. */
  nav: [
    { label: "NEET PG counselling", href: "/neet-pg" },
    { label: "Residents", href: "/#preview" },
    { label: "Pricing", href: "/pricing" },
    { label: "FAQ", href: "/#faq" },
  ],
} as const;
