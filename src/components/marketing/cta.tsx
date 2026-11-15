import { Container } from "@/components/layout/container";
import { PeekingCrew } from "./crew-extras";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FreePrice } from "./free-price";

export function Cta() {
  return (
    <section id="get-seatora" className="scroll-mt-16">
      <Container className="py-20 md:py-28">
        <div className="relative rounded-xl border border-border bg-card p-8 md:p-14">
          <PeekingCrew />
          <h2 className="max-w-3xl font-pixel text-4xl leading-[0.95] tracking-tight md:text-6xl">
            Make your next career decision with clarity.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Seatora NEET PG 2026 Season Pass: <FreePrice className="font-semibold text-foreground" /> for the whole 2026 counselling season. Create a free account and access is switched on immediately.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Create free account</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
