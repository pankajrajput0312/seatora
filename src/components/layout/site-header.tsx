import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Container } from "./container";
import { AuthLink, PlannerCta } from "./auth-link";
import { LogoMark } from "./logo";
import { MobileNav } from "./mobile-nav";

export function SiteHeader() {
  // data-nosnippet: the menu and buttons ("Get Seatora — Free") never become a search result's snippet.
  return (
    <header data-nosnippet className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 font-pixel text-lg tracking-tight text-foreground">
          <LogoMark className="size-6" />
          {siteConfig.name}
        </Link>
        <div className="flex items-center gap-2">
          <nav aria-label="Main" className="mr-2 hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
            {siteConfig.nav.filter((l) => l.href !== "/#faq").map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center hover:text-foreground">{l.label}</Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button asChild size="sm" variant="ghost">
              <AuthLink />
            </Button>
            <Button asChild size="sm">
              <PlannerCta />
            </Button>
          </div>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
