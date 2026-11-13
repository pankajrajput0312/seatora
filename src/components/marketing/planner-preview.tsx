import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatRank } from "@/features/cutoffs/lib/format";
import { SectionHeading } from "./section-heading";

// Demo rows for the product preview only. Not real colleges or real ranks.
const demoRows = [
  { college: "Example Government Medical College", type: "Government", r1: 9820, r2: 11240, fee: 52000 },
  { college: "Example State Institute of Medical Sciences", type: "Government", r1: 11410, r2: 12900, fee: 78000 },
  { college: "Example Deemed University Hospital", type: "Deemed", r1: 14250, r2: 16800, fee: 2450000 },
];

export function PlannerPreview() {
  return (
    <section id="preview" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <SectionHeading eyebrow="The planner" title="Your rank, against every previous round.">
          Enter your rank once. See where it would have landed, round by round, with the fee next to it.
        </SectionHeading>
        <figure className="mt-12 overflow-hidden rounded-xl border border-border bg-card" aria-label="Planner preview with demo data">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            {["Rank 12,450", "OBC", "AIQ", "MD General Medicine", "Any state"].map((chip) => (
              <span key={chip} className="numeric rounded-md border border-input bg-secondary px-2.5 py-1 text-xs">{chip}</span>
            ))}
            <Badge tone="warning" className="ml-auto">Demo data · illustrative only</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3 font-normal">Institute</th>
                  <th className="px-4 py-3 font-normal">Type</th>
                  <th className="px-4 py-3 text-right font-normal">Closing R1</th>
                  <th className="px-4 py-3 text-right font-normal">Closing R2</th>
                  <th className="px-4 py-3 text-right font-normal">Annual fee</th>
                </tr>
              </thead>
              <tbody>
                {demoRows.map((r) => (
                  <tr key={r.college} className="border-b border-border last:border-0 hover:bg-muted">
                    <td className="px-4 py-3">{r.college}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.type}</td>
                    <td className="numeric px-4 py-3 text-right">{formatRank(r.r1)}</td>
                    <td className="numeric px-4 py-3 text-right">{formatRank(r.r2)}</td>
                    <td className="numeric px-4 py-3 text-right">{formatINR(r.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <figcaption className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            In the planner, every row links to its official source and shows when it was last verified. Previous-year ranks show past outcomes, not guarantees.
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}
