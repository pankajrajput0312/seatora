export const siteConfig = {
  name: "MEDPATH",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "The NEET PG planner: institutes, specialties, previous-year ranks, seat matrices, fees, stipends, bonds, resident experiences and counselling updates in one place.",
  nav: [
    { label: "Planner", href: "/#preview" },
    { label: "Features", href: "/#features" },
    { label: "Data", href: "/#data" },
    { label: "FAQ", href: "/#faq" },
  ],
} as const;
