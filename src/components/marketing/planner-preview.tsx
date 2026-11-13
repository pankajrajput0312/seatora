import { Container } from "@/components/layout/container";
import { RankExplorer } from "@/features/rank-predictor/components/rank-explorer";
import { SectionHeading } from "./section-heading";

export function PlannerPreview() {
  return (
    <section id="preview" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <SectionHeading eyebrow="Try it" title="Drag your rank. Watch last year's rounds respond.">
          Every row compares your rank with where that seat closed in the previous round.
        </SectionHeading>
        <div className="mt-12">
          <RankExplorer />
        </div>
      </Container>
    </section>
  );
}
