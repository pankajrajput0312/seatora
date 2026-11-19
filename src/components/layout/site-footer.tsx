import Link from "next/link";
import { business } from "@/config/business";
import { siteConfig } from "@/config/site";
import { PlannerCta } from "./auth-link";
import { Container } from "./container";

/** About, pricing and policy pages, also linked from /v2's footer. */
export const legalLinks = [
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Refund policy", href: "/refund-policy" },
  { label: "Shipping policy", href: "/shipping-policy" },
  { label: "Contact", href: "/contact" },
];

const link = "inline-flex min-h-11 items-center hover:text-foreground";

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-border">
      <Container className="flex flex-col gap-6 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p className="max-w-xl">
          An independent NEET PG planner. Not affiliated with MCC, NBEMS, NMC or any state counselling authority.
          Previous-year data is not a promise of admission.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6">
          {siteConfig.nav.map((item) => <Link key={item.href} href={item.href} className={link}>{item.label}</Link>)}
          {/* The planner: signed out, sign-up first with what she gets (her options), never the sign-in page. */}
          <PlannerCta href={`/signup?${new URLSearchParams({ next: "/decide/options" })}`} label="Your options" memberLabel="My planner" className={link} />
          {legalLinks.filter((l) => l.href !== "/pricing").map((item) => <Link key={item.href} href={item.href} className={link}>{item.label}</Link>)}
          <span className="font-mono text-xs">© {new Date().getFullYear()}{business.sellerName && ` ${business.sellerName}`}</span>
        </nav>
      </Container>
      <Container aria-hidden className="select-none">
        <p className="-mb-[0.18em] font-pixel text-[22vw] leading-none text-foreground/[0.06] [mask-image:linear-gradient(to_bottom,black_40%,transparent)] lg:text-[16rem]">
          seatora
        </p>
      </Container>
    </footer>
  );
}
