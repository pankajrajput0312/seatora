"use client";

import { useMemo, useState } from "react";
import { Hospital, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRank } from "@/features/cutoffs/lib/format";
import { groupByCollege } from "../lib/match";
import type { Resident } from "../schema";
import { PortraitPreview, ResidentCard } from "./resident-card";

const MIN = 1;
const MAX = 300000;
const digits = (n: string) => n.replace(/\D/g, "");

export function ResidentFinder({ residents }: { residents: Resident[] }) {
  const [rank, setRank] = useState<number | null>(null);
  // Typed text stays raw until it's a valid rank, so partial input like "5" isn't snapped.
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const groups = useMemo(() => groupByCollege(residents, { rank, query }), [residents, rank, query]);
  const shown = groups.reduce((n, g) => n + g.residents.length, 0);
  const reset = () => {
    setRank(null);
    setDraft("");
    setQuery("");
  };

  return (
    <div>
      <div className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-[1fr_auto] md:items-end">
        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Find a hospital or resident</span>
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="College, city, state, course or name" className="h-11 pl-9" />
          </span>
        </label>
        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Your rank (optional)</span>
          <input
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            placeholder="e.g. 12,450"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(digits(e.target.value));
              setRank(n >= MIN && n <= MAX ? n : null);
            }}
            onBlur={() => rank && setDraft(formatRank(rank))}
            className="numeric h-11 w-full rounded-md border border-input bg-background px-3 font-pixel text-2xl placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground focus:border-sky md:w-44"
          />
        </label>
      </div>

      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        {residents.length === 0
          ? ""
          : `${shown} ${shown === 1 ? "resident" : "residents"} at ${groups.length} ${groups.length === 1 ? "college" : "colleges"}${rank ? `, closest to rank ${formatRank(rank)} first` : ""}.`}
      </p>

      {residents.length === 0 ? (
        <div className="mt-2">
          <PortraitPreview />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Residents are being added. Each card will show their rank, hospital, specialty and year.
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div className="mt-2 grid place-items-center gap-3 rounded-xl border border-dashed border-border px-5 py-16 text-center">
          <p className="text-base font-medium">No hospitals or residents match.</p>
          <Button variant="secondary" size="sm" onClick={reset}>Clear search</Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-14">
          {groups.map((g) => (
            <section key={`${g.college}|${g.state ?? ""}`} aria-label={g.college}>
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
                <h3 className="flex items-center gap-3 text-xl font-medium leading-snug md:text-2xl">
                  <Hospital className="size-6 shrink-0 text-sky" strokeWidth={1.75} aria-hidden />
                  {g.college}
                </h3>
                <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {g.state && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {g.state}
                    </span>
                  )}
                  <span>
                    {g.residents.length} {g.residents.length === 1 ? "resident" : "residents"}
                  </span>
                </p>
              </div>
              <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {g.residents.map((r, i) => <ResidentCard key={`${r.name}-${r.rank}-${r.year}`} r={r} index={i} />)}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Their ranks show where people got in before; they don&apos;t predict or guarantee your seat.
      </p>
    </div>
  );
}
