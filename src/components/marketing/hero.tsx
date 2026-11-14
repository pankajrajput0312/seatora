import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { HeroScene } from "./hero-scene";

const quickLinks = [
  { label: "Residents by hospital", href: "#preview" },
  { label: "Counselling routes", href: "#coverage" },
  { label: "Closing ranks & seats", href: "#features" },
  { label: "Step by step", href: "#how" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-muted),transparent_65%)]">
      <Container className="grid items-center gap-12 pt-16 pb-12 md:pt-24 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-sky">NEET PG counselling planner</p>
          <h1 className="glow mt-6 font-pixel text-5xl leading-[0.95] tracking-tight md:text-7xl">
            Plan your PG seat, not just your rank.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Previous-year closing ranks, seat matrices, fees, stipends and bonds across All India, State, Deemed and DNB
            counselling, plus residents at each hospital you can contact directly. One planner, every number sourced.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="#waitlist">Get early access <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="#preview">Find residents at a hospital</Link>
            </Button>
          </div>
          <nav aria-label="Jump to" className="mt-8 flex flex-wrap gap-2">
            {quickLinks.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="rounded-full border border-input bg-secondary px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <HeroScene />
      </Container>
    </section>
  );
}
