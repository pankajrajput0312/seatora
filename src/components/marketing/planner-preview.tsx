import { Container } from "@/components/layout/container";
import { ResidentFinder } from "@/features/residents/components/resident-finder";
import { residents } from "@/features/residents/residents";
import { SectionHeading } from "./section-heading";

export function PlannerPreview() {
  return (
    <section id="preview" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <SectionHeading eyebrow="Residents" title="See where residents with your rank got in.">
          Real residents, their NEET PG rank and the college they joined. Enter your rank to see who was closest to you.
        </SectionHeading>
        <div className="mt-12">
          <ResidentFinder residents={residents} />
        </div>
      </Container>
    </section>
  );
}
