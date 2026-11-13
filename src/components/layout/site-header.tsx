import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Container } from "./container";
import { LogoMark } from "./logo";
import { MobileNav } from "./mobile-nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 font-pixel text-lg tracking-tight text-foreground">
          <LogoMark className="size-6" />
          {siteConfig.name}
        </Link>
        <nav aria-label="Primary" className="hidden gap-7 text-sm text-muted-foreground md:flex">
          {siteConfig.nav.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <Button asChild size="sm">
              <Link href="/#waitlist">Get early access</Link>
            </Button>
          </div>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
