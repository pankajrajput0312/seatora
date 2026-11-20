import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

// Same columns as the signed-in residents table (src/features/decide/components/residents-results.tsx).
const columns = ["Name", "College", "Course", "Year", "List", "Quota", "Round"];
// Illustrative only: no real resident is ever shown on a public page.
const sample = [
  ["Dr. A. Sample", "Sample Government Medical College", "MD General Medicine", "2025", "AIQ", "Open", "Round 1"],
  ["Dr. B. Sample", "Sample Institute of Medical Sciences", "MS General Surgery", "2024", "AIQ", "OBC", "Round 2"],
  ["Dr. C. Sample", "Sample Medical College & Hospital", "MD Paediatrics", "2023", "AIQ", "EWS", "Round 3"],
];

export function PlannerPreview() {
  return (
    <section id="preview" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-sky">Residents</p>
          <h2 className="glow-strong mt-4 font-pixel text-5xl leading-none md:text-7xl">who&apos;s already there?</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            See the{" "}
            <Link href="/neet-pg/residents" className="underline decoration-foreground/25 underline-offset-4 hover:text-sky">residents at every hospital</Link>, with
            their course, year and All India Rank, from MCC&apos;s official admitted-candidates lists. Names are shown only to signed-in accounts with access.
          </p>
        </div>
        <div className="mt-12 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="px-4 pt-4 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Sample rows, for illustration only
            </caption>
            <thead>
              <tr className="text-left">
                {columns.map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap border-b border-border px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody aria-hidden>
              {sample.map((row) => (
                <tr key={row[0]} className="border-b border-border last:border-0">
                  {row.map((cell, i) => (
                    <td key={i} className={`whitespace-nowrap px-4 py-3 ${i === 3 ? "numeric" : ""} ${i < 2 ? "select-none blur-[3px]" : "text-muted-foreground"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8 text-center">
          <Button asChild size="lg">
            <Link href="/signup">Sign up free to search 77,000+ residents <ArrowRight className="size-4" /></Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
