import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { FeatureTiles } from "./feature-tiles";
import { SectionHeading } from "./section-heading";

const problems = [
  { title: "Cutoffs in scattered PDFs", body: "Round-wise allotments from MCC and every state, in different formats, every year." },
  { title: "Fees and bonds out of date", body: "Stipends, bond penalties and fee hikes are rarely dated or easy to find." },
  { title: "Who's there, buried in PDFs", body: "Admitted-candidate lists are long PDFs with no way to see one college's residents." },
];

export function Features() {
  return (
    <>
      <section className="border-b border-border">
        <Container className="grid gap-px overflow-hidden py-0 md:grid-cols-3">
          {problems.map((p) => (
            <div key={p.title} className="border-t border-border py-10 first:border-t-0 md:border-t-0 md:px-8 md:first:pl-0 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-border">
              <p className="text-base font-medium">{p.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </Container>
      </section>

      <section id="features" className="scroll-mt-16 border-b border-border">
        <Container className="py-20 md:py-28">
          <SectionHeading eyebrow="Everything inside" title="Everything you need for counselling, in one place.">
            Stop switching between forty tabs. Seatora puts the research behind every choice in one place.
          </SectionHeading>
          <Badge tone="warning" className="mt-6">Previews use demo data · illustrative only</Badge>
          <div className="mt-12">
            <FeatureTiles />
          </div>
        </Container>
      </section>
    </>
  );
}
