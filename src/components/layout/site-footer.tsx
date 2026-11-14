import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Container } from "./container";

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-border">
      <Container className="flex flex-col gap-6 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p className="max-w-xl">
          An independent NEET PG planner. Not affiliated with MCC, NBEMS, NMC or any state counselling authority.
          Previous-year data does not guarantee admission.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {siteConfig.nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">{item.label}</Link>
          ))}
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <span className="font-mono text-xs">© {new Date().getFullYear()}</span>
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
