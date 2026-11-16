import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlannerCta } from "@/components/layout/auth-link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { CrewScene } from "./crew-scene";
import { FreePrice } from "./free-price";

// Phones only: what's inside and the price, so they sit above the fold next to the buttons. Each opens its planner page
// (sign-up first when signed out; /signup sends a signed-in visitor straight on to `next`).
const inside = [
  { label: "Residents' names", next: "/decide/residents" },
  { label: "Options for your rank", next: "/decide/options" },
  { label: "Fees, stipend, bond", next: "/decide/fees" },
  { label: "Seats", next: "/decide/seats" },
];
const viaSignup = (next: string) => `/signup?${new URLSearchParams({ next })}`;

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-muted),transparent_65%)]">
      <Container className="grid items-center gap-12 pt-8 pb-12 sm:pt-16 md:pt-24 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-sky">NEET PG counselling planner</p>
          <h1 className="glow mt-4 font-pixel text-4xl leading-[0.95] tracking-tight sm:mt-6 sm:text-5xl md:text-7xl">
            Plan your rank. See residents. Choose well.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg">
            Enter your NEET PG rank, see where it got in before, and see who&apos;s already at each hospital, from MCC&apos;s official lists.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm md:hidden" aria-label="What you get">
            {inside.map((item) => (
              <li key={item.label}>
                <Link href={viaSignup(item.next)} className="hit inline-flex rounded-md border border-border bg-card px-2.5 py-1 hover:underline">{item.label}</Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground md:hidden">
            Season Pass: <FreePrice className="text-base font-semibold text-foreground" />
          </p>
          <div className="mt-5 flex flex-wrap gap-3 sm:mt-8">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={viaSignup("/decide/residents")}>See residents <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="w-full sm:w-auto">
              <PlannerCta />
            </Button>
          </div>
        </div>

        <CrewScene />
      </Container>
    </section>
  );
}
