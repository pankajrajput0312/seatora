import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { CrewScene } from "./crew-scene";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-muted),transparent_65%)]">
      <Container className="grid items-center gap-12 pt-16 pb-12 md:pt-24 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-sky">NEET PG counselling planner</p>
          <h1 className="glow mt-6 font-pixel text-5xl leading-[0.95] tracking-tight md:text-7xl">
            Plan your rank. See residents. Choose well.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
            Enter your NEET PG rank, see where it got in before, and see who&apos;s already at each hospital, from MCC&apos;s official lists.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="#preview">See residents <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/signup">Get Seatora — Free</Link>
            </Button>
          </div>
        </div>

        <CrewScene />
      </Container>
    </section>
  );
}
