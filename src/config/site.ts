export const siteConfig = {
  name: "MEDPATH",
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  /** Where privacy and deletion requests go. Set NEXT_PUBLIC_CONTACT_EMAIL before launch. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  description:
    "The NEET PG planner: institutes, specialties, previous-year ranks, seat matrices, fees, stipends, bonds, resident experiences and counselling updates in one place.",
  nav: [
    { label: "Planner", href: "/#preview" },
    { label: "Features", href: "/#features" },
    { label: "Data", href: "/#data" },
    { label: "FAQ", href: "/#faq" },
  ],
} as const;
