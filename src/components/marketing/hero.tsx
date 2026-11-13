import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { PixelEmblem } from "./pixel-emblem";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-muted),transparent_65%)]">
      <Container className="grid items-center gap-12 pt-16 pb-12 md:pt-24 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-sky">NEET PG · AIQ &amp; state counselling</p>
          <h1 className="glow mt-6 font-pixel text-5xl leading-[0.95] tracking-tight md:text-7xl">
            Plan your PG seat, not just your rank.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Institutes, previous-year closing ranks, seat matrices, fees, stipends, bonds and what residents actually say.
            One planner, every number sourced.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="#waitlist">Get early access <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="#preview">See the planner</Link>
            </Button>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md py-10" aria-hidden>
          <p className="absolute top-0 left-0 z-10 rounded-full border border-input bg-secondary px-4 py-2 text-sm shadow-overlay">
            AIQ rank 12,450 · OBC · MD Medicine
          </p>
          <PixelEmblem className="bob mx-auto w-4/5" />
          <p className="absolute right-0 bottom-0 z-10 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground shadow-overlay">
            <span className="size-1.5 animate-pulse rounded-full bg-sky" />
            comparing previous-year rounds
          </p>
        </div>
      </Container>
    </section>
  );
}
