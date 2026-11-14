import { Container } from "@/components/layout/container";
import { ResidentFinder } from "@/features/residents/components/resident-finder";
import { residents } from "@/features/residents/residents";

export function PlannerPreview() {
  return (
    <section id="preview" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-sky">Residents</p>
          <h2 className="glow-strong mt-4 font-pixel text-5xl leading-none md:text-7xl">who&apos;s already there?</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Find the residents at every hospital, with their rank and specialty, and message them to ask what it&apos;s really like.
          </p>
        </div>
        <div className="mt-12">
          <ResidentFinder residents={residents} />
        </div>
      </Container>
    </section>
  );
}
