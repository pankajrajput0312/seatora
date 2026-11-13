"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatINR, formatRank } from "@/features/cutoffs/lib/format";
import { rankFit, rankFitLabel, type RankFit } from "../lib/rank-fit";

// Demo rows for the landing-page preview only. Not real colleges or real ranks.
const demoRows = [
  { college: "Example Government Medical College", type: "Government", r1: 6820, r2: 8240, fee: 52000 },
  { college: "Example State Institute of Medical Sciences", type: "Government", r1: 11410, r2: 12900, fee: 78000 },
  { college: "Example Municipal Medical College", type: "Government", r1: 31300, r2: 38650, fee: 64000 },
  { college: "Example Deemed University Hospital", type: "Deemed", r1: 74250, r2: 92800, fee: 2450000 },
];

const MIN = 1000;
const MAX = 200000;

const fitStyle: Record<RankFit, { row: string; tone: "success" | "warning" | "error" }> = {
  inside: { row: "border-l-leaf", tone: "success" },
  near: { row: "border-l-sun", tone: "warning" },
  beyond: { row: "border-l-ember", tone: "error" },
};

export function RankExplorer() {
  const [rank, setRank] = useState(12450);
  // Typed text is kept raw and only clamped on commit, so partial input like "5" isn't snapped.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = Number(draft.replace(/\D/g, ""));
    if (n) setRank(Math.min(MAX, Math.max(MIN, n)));
    setDraft(null);
  };
  const fits = demoRows.map((r) => rankFit(rank, r.r2)!);
  const count = (f: RankFit) => fits.filter((x) => x === f).length;

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Interactive planner preview with demo data">
      <div className="grid gap-4 border-b border-border p-5 md:grid-cols-[auto_1fr] md:items-center md:gap-8">
        <label className="flex items-baseline gap-3">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your rank</span>
          <input
            type="text"
            inputMode="numeric"
            value={draft ?? formatRank(rank)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="numeric w-36 rounded-md border border-input bg-background px-2 py-1 font-pixel text-2xl focus:border-sky"
          />
        </label>
        <div className="flex items-center gap-3">
          <span className="numeric font-mono text-xs text-muted-foreground">{formatRank(MIN)}</span>
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={100}
            value={rank}
            onChange={(e) => { setDraft(null); setRank(Number(e.target.value)); }}
            aria-label="Adjust your rank"
            className="h-2 w-full cursor-pointer accent-sky"
          />
          <span className="numeric font-mono text-xs text-muted-foreground">{formatRank(MAX)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        {["OBC", "AIQ", "MD General Medicine", "Any state"].map((chip) => (
          <span key={chip} className="rounded-md border border-input bg-secondary px-2.5 py-1 text-xs">{chip}</span>
        ))}
        <Badge tone="warning" className="ml-auto">Demo data · illustrative only</Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3 font-normal">Institute</th>
              <th className="px-4 py-3 text-right font-normal">Closing R1</th>
              <th className="px-4 py-3 text-right font-normal">Closing R2</th>
              <th className="px-4 py-3 text-right font-normal">Annual fee</th>
              <th className="px-5 py-3 text-right font-normal">Your rank vs R2</th>
            </tr>
          </thead>
          <tbody>
            {demoRows.map((r, i) => {
              const fit = fits[i];
              return (
                <tr key={r.college} className={cn("border-b border-l-2 border-b-border last:border-b-0 transition-colors", fitStyle[fit].row)}>
                  <td className="px-5 py-3">
                    {r.college}
                    <span className="block text-xs text-muted-foreground">{r.type}</span>
                  </td>
                  <td className="numeric px-4 py-3 text-right text-muted-foreground">{formatRank(r.r1)}</td>
                  <td className="numeric px-4 py-3 text-right">{formatRank(r.r2)}</td>
                  <td className="numeric px-4 py-3 text-right">{formatINR(r.fee)}</td>
                  <td className="px-5 py-3 text-right">
                    <Badge tone={fitStyle[fit].tone}>{rankFitLabel[fit]}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="sr-only" aria-live="polite">
        {`Rank ${formatRank(rank)}: ${count("inside")} inside, ${count("near")} near, ${count("beyond")} beyond last year's closing rank.`}
      </p>
      <figcaption className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        &ldquo;Near&rdquo; means within 10% of the previous-year closing rank. This compares against last year&apos;s Round 2 only and does not predict or guarantee a seat.
      </figcaption>
    </figure>
  );
}
