"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatRank } from "@/features/cutoffs/lib/format";

const categories = ["Open", "OBC", "EWS", "SC", "ST"] as const;

/** A working rank entry that opens the planner with that rank. */
export function RankCard() {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [cat, setCat] = useState<(typeof categories)[number]>("Open");
  const rank = Number(draft.replace(/\D/g, ""));
  const valid = rank >= 1 && rank <= 300000;
  const [error, setError] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return setError(true);
        router.push(`/decide/options?rank=${rank}&cat=${cat}`);
      }}
      className="w-full rounded-xl border border-border bg-card p-6 text-left shadow-overlay md:p-8"
    >
      <label htmlFor="v2-rank" className="text-sm font-semibold text-muted-foreground">Your All India Rank</label>
      <input
        id="v2-rank"
        inputMode="numeric"
        autoComplete="off"
        placeholder="42,284"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setError(false); }}
        onBlur={() => valid && setDraft(formatRank(rank))}
        aria-invalid={error}
        aria-describedby={error ? "v2-rank-error" : undefined}
        className="mt-1 block w-full border-0 border-b border-input bg-transparent p-0 pb-2 text-[3.5rem] leading-none font-bold tracking-tight text-foreground tabular-nums placeholder:text-foreground/20 focus:border-foreground focus:outline-none md:text-[4.25rem]"
      />
      {error && <p id="v2-rank-error" className="mt-2 text-sm text-ember">Enter a rank between 1 and 3,00,000.</p>}
      <fieldset className="mt-6">
        <legend className="text-sm font-semibold text-muted-foreground">Category</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring ${cat === c ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground"}`}>
              <input type="radio" name="cat" value={c} checked={cat === c} onChange={() => setCat(c)} className="sr-only" />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="mt-7 inline-flex h-12 items-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
        Show my colleges
      </button>
    </form>
  );
}
