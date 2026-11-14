"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatRank } from "@/features/cutoffs/lib/format";
import type { RankFit } from "@/features/rank-predictor/lib/rank-fit";
import { fitLabel, matchResidents } from "../lib/match";
import { residentCategories, type Resident, type ResidentCategory } from "../schema";

const MIN = 1;
const MAX = 300000;

const fitStyle: Record<RankFit, { row: string; tone: "success" | "warning" | "error" }> = {
  inside: { row: "border-l-leaf", tone: "success" },
  near: { row: "border-l-sun", tone: "warning" },
  beyond: { row: "border-l-ember", tone: "error" },
};

export function ResidentFinder({ residents }: { residents: Resident[] }) {
  const [rank, setRank] = useState<number | null>(null);
  // Typed text stays raw until it's a valid rank, so partial input like "5" isn't snapped.
  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<ResidentCategory | "All">("All");
  const [query, setQuery] = useState("");

  const matches = useMemo(() => matchResidents(residents, { rank, category, query }), [residents, rank, category, query]);
  const count = (f: RankFit) => matches.filter((m) => m.fit === f).length;
  const reset = () => {
    setRank(null);
    setDraft("");
    setCategory("All");
    setQuery("");
  };

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Residents and the colleges they joined">
      <div className="grid gap-4 border-b border-border p-5 md:grid-cols-[auto_1fr_auto] md:items-end">
        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your rank</span>
          <input
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            placeholder="e.g. 12,450"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value.replace(/\D/g, ""));
              setRank(n >= MIN && n <= MAX ? n : null);
            }}
            onBlur={() => rank && setDraft(formatRank(rank))}
            className="numeric h-11 w-40 rounded-md border border-input bg-background px-3 font-pixel text-2xl placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground focus:border-sky"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Search</span>
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, college, course or state" className="h-11 pl-9" />
          </span>
        </label>
        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ResidentCategory | "All")}
            className="h-11 rounded-md border border-input bg-card px-3 text-sm focus:border-sky"
          >
            <option value="All">All categories</option>
            {residentCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {residents.length === 0 ? (
        <div className="grid place-items-center gap-3 px-5 py-16 text-center">
          <Users className="size-6 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <p className="text-base font-medium">No residents added yet.</p>
          <p className="max-w-sm text-sm text-muted-foreground">Residents will appear here with their rank and the college they joined.</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="grid place-items-center gap-3 px-5 py-16 text-center">
          <p className="text-base font-medium">No residents match these filters.</p>
          <Button variant="secondary" size="sm" onClick={reset}>Reset filters</Button>
        </div>
      ) : (
        <>
        {/* Phones: stacked cards. */}
        <ul className="divide-y divide-border md:hidden">
          {matches.map((m) => (
            <li key={`${m.name}-${m.rank}-${m.year}`} className={cn("border-l-2 px-5 py-4", m.fit ? fitStyle[m.fit].row : "border-l-transparent")}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{m.name}</span>
                <span className="numeric font-pixel text-xl">{formatRank(m.rank)}</span>
              </div>
              <p className="mt-1 text-sm">{m.course} · {m.college}{m.state ? `, ${m.state}` : ""}</p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {m.verified ? <Badge tone="success">Verified</Badge> : <Badge>Resident-reported</Badge>}
                {m.category} · {m.quota} · {m.year}{m.round ? ` ${m.round}` : ""}
              </p>
              {m.fit && <Badge tone={fitStyle[m.fit].tone} className="mt-2">{fitLabel[m.fit]}</Badge>}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3 font-normal">Resident</th>
                <th className="px-4 py-3 text-right font-normal">Rank</th>
                <th className="px-4 py-3 font-normal">College</th>
                <th className="px-4 py-3 font-normal">Course</th>
                {rank && <th className="px-5 py-3 text-right font-normal">Vs your rank</th>}
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr
                  key={`${m.name}-${m.rank}-${m.year}`}
                  className={cn("border-b border-l-2 border-b-border last:border-b-0", m.fit ? fitStyle[m.fit].row : "border-l-transparent")}
                >
                  <td className="px-5 py-3">
                    <span className="font-medium">{m.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {m.verified ? <Badge tone="success">Verified</Badge> : <Badge>Resident-reported</Badge>}
                      {m.category} · {m.quota}
                    </span>
                  </td>
                  <td className="numeric px-4 py-3 text-right font-medium">{formatRank(m.rank)}</td>
                  <td className="px-4 py-3">
                    {m.college}
                    {m.state && <span className="block text-xs text-muted-foreground">{m.state}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {m.course}
                    <span className="block font-mono text-xs text-muted-foreground">
                      {m.year}{m.round ? ` · ${m.round}` : ""}
                    </span>
                  </td>
                  {rank && (
                    <td className="px-5 py-3 text-right">
                      {m.fit && <Badge tone={fitStyle[m.fit].tone}>{fitLabel[m.fit]}</Badge>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <p className="sr-only" aria-live="polite">
        {rank
          ? `${matches.length} residents. Your rank ${formatRank(rank)} is ahead of ${count("inside")}, within 10% of ${count("near")} and behind ${count("beyond")}.`
          : `${matches.length} residents.`}
      </p>
      <figcaption className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
        Residents are listed with their agreement. Their ranks show where people got in before; they don&apos;t predict or guarantee your seat.
      </figcaption>
    </figure>
  );
}
