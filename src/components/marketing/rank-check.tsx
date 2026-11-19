import { PlannerCta } from "@/components/layout/auth-link";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { baseCategories, type BaseCategory } from "@/features/decide/types";
import type { RankCheck } from "@/features/exams/landing/data";
import { cn } from "@/lib/cn";

// The public rank check (home hero, /neet-pg, /neet-pg/rank): a plain GET form, so it works before any script loads
// and ships none; the answer is server-rendered from MCC's result PDFs (features/exams/landing/data.ts rankCheck).

const n = formatRank;
const field = "h-12 w-full rounded-md border border-input bg-card px-3 text-base text-foreground focus:border-sky";

/** Her AIR and category, to /neet-pg/rank. */
export function RankForm({ rank, category, className }: { rank?: number; category?: BaseCategory; className?: string }) {
  return (
    <form action="/neet-pg/rank" method="get" className={cn("grid grid-cols-[1fr_7rem] items-end gap-3 sm:grid-cols-[1fr_7rem_auto]", className)}>
      <label className="grid gap-1.5 text-sm text-muted-foreground">
        Your All India Rank
        <input name="rank" inputMode="numeric" autoComplete="off" required pattern="[0-9][0-9, ]*" title="Your AIR, digits only" placeholder="18,500" defaultValue={rank ? n(rank) : undefined} className={cn(field, "numeric text-lg")} />
      </label>
      <label className="grid gap-1.5 text-sm text-muted-foreground">
        Category
        <select name="cat" defaultValue={category ?? "Open"} className={field}>
          {baseCategories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <Button type="submit" size="lg" className="col-span-2 sm:col-span-1">Show seats</Button>
    </form>
  );
}

// "an" before each: OBC, EWS, SC and ST are said letter by letter.
const seatsOf = (c: BaseCategory) => (c === "Open" ? "Open seats" : `seats an ${c} candidate can take`);

/** "1,234 options closed at or after AIR 18,500 on seats an OBC candidate can take in MCC's 2025 Rounds 1 to 3." */
export const rankSummary = (r: RankCheck) =>
  `${n(r.n)} ${r.n === 1 ? "option" : "options"} closed at or after AIR ${n(r.rank)} on ${seatsOf(r.category)} in MCC's ${r.year} Rounds 1 to 3.`;

/** "All India quota", "DNB Quota", "Deemed/Paid Seats": a quota's name says "quota" once. */
const quotaWords = (q: string) => (/quota|seats/i.test(q) ? q : `${q} quota`);

/** Her rank's tightest options: course, institute and quota, and the round that took the rank with its result PDF. */
export function RankRows({ r }: { r: RankCheck }) {
  return (
    <ol className="divide-y divide-border border-y border-border">
      {r.rows.map((x) => (
        <li key={x.id} className="grid grid-cols-[1fr_auto] gap-x-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{x.course}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {x.college.name}{x.college.state ? `, ${x.college.state}` : ""}. {quotaWords(x.quota)}.
            </p>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            <span className="numeric block text-base font-medium text-foreground">{n(x.closing)}</span>
            {x.source?.url ? (
              <a href={x.source.url} target="_blank" rel="noopener noreferrer" title={x.source.name} className="underline decoration-foreground/25 underline-offset-4 hover:text-sky">
                {x.round} closing<span className="sr-only"> rank, MCC result PDF (opens in a new tab)</span>
              </a>
            ) : (
              `${x.round} closing`
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Sign up to see every option for this rank (signed in: open them in her planner, with this rank). */
export function RankCta({ r, className }: { r: RankCheck; className?: string }) {
  const options = `/decide/options?${new URLSearchParams({ rank: String(r.rank), cat: r.category })}`;
  return (
    <Button asChild size="lg" className={className}>
      <PlannerCta href={`/signup?${new URLSearchParams({ next: options })}`} label={`Sign up free to see all ${n(r.n)}`} member={options} memberLabel={`See all ${n(r.n)} in my planner`} />
    </Button>
  );
}
