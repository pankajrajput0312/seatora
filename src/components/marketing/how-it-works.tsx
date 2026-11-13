import { Container } from "@/components/layout/container";
import { SectionHeading } from "./section-heading";

const steps = [
  { title: "Add your rank and preferences", body: "Rank, category, quota, domicile state and the specialties you're considering." },
  { title: "See where you stood last year", body: "Colleges whose previous-year closing ranks were near yours, round by round." },
  { title: "Research and compare", body: "Open institute profiles, read resident experiences, and compare fees, stipends and bonds." },
  { title: "Shortlist and track rounds", body: "Order your choices and follow every registration and result date." },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <SectionHeading eyebrow="How it works" title="From rank to choice list in four steps." />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="bg-background p-6">
              <span className="font-pixel text-4xl text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-6 text-base font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
