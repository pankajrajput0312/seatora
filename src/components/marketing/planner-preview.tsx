import { Container } from "@/components/layout/container";
import { ResidentFinder } from "@/features/residents/components/resident-finder";
import { residents } from "@/features/residents/residents";
import { SectionHeading } from "./section-heading";

export function PlannerPreview() {
  return (
    <section id="preview" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <SectionHeading eyebrow="Residents" title="Find residents at every hospital, and reach them directly.">
          Search a college to see who&apos;s doing residency there, with their rank and course. Message them on WhatsApp,
          call or email to ask what it&apos;s really like.
        </SectionHeading>
        <div className="mt-12">
          <ResidentFinder residents={residents} />
        </div>
      </Container>
    </section>
  );
}
