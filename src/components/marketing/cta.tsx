import { AuthLink, PlannerCta } from "@/components/layout/auth-link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { PeekingCrew } from "./crew-extras";
import { PriceLine } from "./price-line";

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
            <PriceLine className="font-semibold text-foreground" />
          </p>
          {/* Signed in: "Open my planner" alone, never "Create free account" or "Sign in". */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <PlannerCta label="Create free account" />
            </Button>
            <Button asChild size="lg" variant="ghost" className="w-full sm:w-auto">
              <AuthLink />
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
