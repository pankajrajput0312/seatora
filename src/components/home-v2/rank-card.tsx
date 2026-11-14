"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check } from "lucide-react";
import { formatRank } from "@/features/cutoffs/lib/format";

const categories = ["Open", "OBC", "EWS", "SC", "ST"] as const;
const points = ["Closing ranks for every round and year", "Residents at each hospital, from MCC's lists", "Your choice list, in MCC order"];

/** The one standout element: a working rank entry that opens the planner with that rank. */
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
      className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-[1.75rem] border border-wash-line bg-linear-to-br from-wash via-wash/40 to-card text-left shadow-overlay md:grid-cols-[1.2fr_1fr]"
    >
      <div className="p-7 md:p-9">
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
          className="mt-1 block w-full border-0 bg-transparent p-0 text-[4rem] leading-none font-bold tracking-tight text-foreground tabular-nums placeholder:text-foreground/20 focus:outline-none md:text-[4.75rem]"
        />
        {error && <p id="v2-rank-error" className="mt-2 text-sm text-ember">Enter a rank between 1 and 3,00,000.</p>}
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-muted-foreground">Category</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((c) => (
              <label key={c} className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring ${cat === c ? "border-foreground bg-foreground text-white" : "border-wash-line bg-card hover:border-foreground/40"}`}>
                <input type="radio" name="cat" value={c} checked={cat === c} onChange={() => setCat(c)} className="sr-only" />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="group mt-7 inline-flex h-14 items-center gap-3 rounded-full bg-foreground pr-2 pl-6 text-base font-semibold text-white transition-colors hover:bg-foreground/90">
          Show my colleges
          <span className="grid size-10 place-items-center rounded-full bg-mark transition-transform group-hover:rotate-45"><ArrowUpRight className="size-5" aria-hidden /></span>
        </button>
      </div>
      <ul className="grid content-center gap-5 border-t border-wash-line bg-card/60 p-7 md:border-t-0 md:border-l md:p-10">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-3 text-base">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-mark/10 text-sky"><Check className="size-4" strokeWidth={2.5} aria-hidden /></span>
            {p}
          </li>
        ))}
      </ul>
    </form>
  );
}
