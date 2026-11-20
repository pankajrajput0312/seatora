export const siteConfig = {
  name: "Seatora",
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  /** Where privacy and deletion requests go. Set NEXT_PUBLIC_CONTACT_EMAIL before launch. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  /** The home page's meta description (≤ 155 characters), also the manifest's and the root layout's default. */
  description:
    "Seatora is a NEET PG 2026 counselling planner for MCC seats: last rank by branch, college-wise closing ranks, seat matrix, fees, bonds and residents.",
  /** The public pages every menu links (header, phone menu, footer); the planner link is PlannerCta's, signed-in aware. */
  nav: [
    { label: "NEET PG counselling", href: "/neet-pg" },
    { label: "Residents", href: "/neet-pg/residents" },
    { label: "Pricing", href: "/pricing" },
    { label: "FAQ", href: "/#faq" },
  ],
  /** NEET PG's public guides: the footer's "NEET PG" group (`label`) and /neet-pg's links (`title`, `about`). */
  neetPg: [
    { label: "Cutoff", href: "/neet-pg/cutoff", title: "NEET PG cutoff", about: "Last rank by round and branch, every year in MCC's results." },
    { label: "Colleges", href: "/neet-pg/colleges", title: "NEET PG colleges", about: "Every institute in MCC's NEET PG counselling, one page each." },
    { label: "College predictor", href: "/neet-pg/college-predictor", title: "College predictor", about: "Where ranks like yours were allotted: history, not a prediction." },
    { label: "Counselling 2026", href: "/neet-pg/counselling-2026", title: "Counselling 2026", about: "Rounds, dates and results from MCC's notices." },
    { label: "Stipend & bond", href: "/neet-pg/stipend-bond", title: "Stipend and bond", about: "Monthly stipends, service bonds and penalties by state and college." },
    { label: "Residents", href: "/neet-pg/residents", title: "Residents", about: "Residents at each college by course and year, from MCC's admitted lists." },
  ],
} as const;
