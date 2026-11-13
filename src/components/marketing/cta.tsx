import { Container } from "@/components/layout/container";
import { WaitlistForm } from "@/features/waitlist/components/waitlist-form";
import { examYearsFrom } from "@/features/waitlist/validations";

export function Cta() {
  return (
    <section id="waitlist" className="scroll-mt-16">
      <Container className="py-20 md:py-28">
        <div className="rounded-xl border border-border bg-card p-8 md:p-14">
          <h2 className="max-w-3xl font-pixel text-4xl leading-[0.95] tracking-tight md:text-6xl">
            Make your next career decision with clarity.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Join early access. We&apos;ll let you know when the planner opens for your counselling year.
          </p>
          <div className="mt-8 max-w-2xl">
            <WaitlistForm examYears={examYearsFrom()} />
          </div>
        </div>
      </Container>
    </section>
  );
}
