import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import type { RankCheck } from "@/features/exams/landing/data";
import { PeekingCrew } from "./crew-extras";
import { PriceLine } from "./price-line";
import { RankForm, RankRows, rankSummary } from "./rank-check";

/**
 * The home hero: what Seatora is on the left; on the right the rank check, with a real answer already in it (`example`,
 * an AIR read from MCC's result PDFs at build time, hourly) so the proof comes before any sign-up.
 */
export function Hero({ example }: { example: RankCheck | null }) {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-muted),transparent_65%)]">
      {/* Phones: the words, the rank check, then the other ways in; from lg the rank check is the right column. */}
      <Container className="grid gap-x-14 gap-y-8 pt-8 pb-12 sm:pt-16 md:pt-20 lg:grid-cols-[1fr_1.05fr]">
        <div className="lg:self-end">
          <p className="font-mono text-xs uppercase tracking-widest text-sky">NEET PG 2026 counselling planner</p>
          <h1 className="glow mt-4 font-pixel text-4xl leading-[0.95] tracking-tight sm:mt-6 sm:text-5xl md:text-7xl">
            Plan your rank. See residents. Choose well.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg">
            Enter your NEET PG rank to see where it got in last year, then who&apos;s already at each hospital, all from MCC&apos;s official lists.
          </p>
          <p className="mt-4 max-w-md text-sm text-muted-foreground"><PriceLine /></p>
        </div>

        <div id="rank" className="relative scroll-mt-24 self-center rounded-xl border border-border bg-card p-5 md:p-7 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <PeekingCrew />
          <h2 className="text-lg font-medium">Where did your rank get in?</h2>
          <p className="mt-1 text-sm text-muted-foreground">No sign-up. From MCC&apos;s allotment results.</p>
          <RankForm className="mt-5" />
          {example && example.n > 0 && (
            <div className="mt-6">
              <p className="text-sm leading-relaxed text-muted-foreground">For example, {rankSummary(example)} The nearest:</p>
              <div className="mt-3"><RankRows r={example} /></div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:self-start">
          <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
            <Link href={`/signup?${new URLSearchParams({ next: "/decide/residents" })}`}>See residents <ArrowRight className="size-4" /></Link>
          </Button>
          <Link href="/neet-pg" className="inline-flex min-h-11 items-center text-sm text-sky underline underline-offset-4 hover:no-underline">
            NEET PG counselling: ranks, fees, schedule
          </Link>
        </div>
      </Container>
    </section>
  );
}
