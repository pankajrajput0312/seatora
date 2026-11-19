import { ArrowRight } from "lucide-react";
import { PlannerCta } from "@/components/layout/auth-link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import type { residentCounts } from "@/features/exams/landing/data";

type Counts = Awaited<ReturnType<typeof residentCounts>>;

/**
 * "who's already there?": live counts from MCC's admitted-candidates lists, and one real institute's residents by course
 * and year. Counts only: no name is ever on a public page (signed-in members see them).
 */
export function PlannerPreview({ counts, college }: { counts: Counts; college: string | null }) {
  const at = counts?.at;
  return (
    <section id="preview" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-sky">Residents</p>
          <h2 className="glow-strong mt-4 font-pixel text-5xl leading-none md:text-7xl">who&apos;s already there?</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            {counts ? (
              <>
                <span className="numeric text-foreground">{formatRank(counts.n)}</span> residents by hospital, course and year ({counts.y0} to {counts.y1}), from
                MCC&apos;s official admitted-candidates lists, with their All India Rank where known.
              </>
            ) : (
              <>The residents at every hospital, by course and year, from MCC&apos;s official admitted-candidates lists, with their All India Rank where known.</>
            )}{" "}
            Names are shown only to signed-in accounts.
          </p>
        </div>
        {at && college && at.courses.length > 0 && (
          <div className="mx-auto mt-12 max-w-2xl overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="px-4 pt-4 text-left text-sm text-muted-foreground">
                Residents at <span className="text-foreground">{college}</span> by course and year: {formatRank(at.total)} in all
                {at.more > 0 && `, the ${at.courses.length} biggest courses shown`}.
              </caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="border-b border-border px-4 py-3 font-normal text-muted-foreground">Course</th>
                  {at.years.map((y) => <th key={y} scope="col" className="numeric border-b border-border px-4 py-3 text-right font-normal text-muted-foreground">{y}</th>)}
                </tr>
              </thead>
              <tbody>
                {at.courses.map((c) => (
                  <tr key={c.course} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal">{c.course}</th>
                    {c.byYear.map((x, i) => <td key={at.years[i]} className="numeric px-4 py-3 text-right text-muted-foreground">{x || "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-8 text-center">
          <Button asChild size="lg">
            <PlannerCta
              href={`/signup?${new URLSearchParams({ next: "/decide/residents" })}`}
              label={<>Sign up free to see the names <ArrowRight className="size-4" /></>}
              member="/decide/residents"
              memberLabel="Open Residents"
            />
          </Button>
        </div>
      </Container>
    </section>
  );
}
