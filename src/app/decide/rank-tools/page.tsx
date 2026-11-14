import type { Metadata } from "next";
import { z } from "zod";
import { formatRank } from "@/features/cutoffs/lib/format";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { DataSource } from "@/features/decide/components/data-source";
import { control, EmptyState, Field, FilterBar, Select } from "@/features/decide/components/ui";
import { parseSearchParams, rankValue } from "@/features/decide/lib/params";
import { profileFromParams, toURLSearchParams } from "@/features/decide/profile";
import { meritLists, meritPosition, scoreToRank, type MeritSource, type ScoreRankRow } from "@/features/decide/server/merit";
import { baseCategories } from "@/features/decide/types";

export const metadata: Metadata = { title: "Score & rank" };
const categories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;
type Category = (typeof categories)[number];
// Own keys (score, air, mcat): never a profile key, or they would leak into her profile.
const schema = z.object({
  score: z.preprocess((v) => (typeof v === "string" ? v.replace(/\s/g, "") : v), z.coerce.number().int().min(-1000).max(1000)).optional(),
  air: rankValue.optional(),
  mcat: z.enum(categories).optional(),
});

const air = (r: ScoreRankRow) => `AIR ${formatRank(r.bestRank)}${r.worstRank > r.bestRank ? `–${formatRank(r.worstRank)}` : ""}`;
const plural = (n: number, one: string, many: string) => `${formatRank(n)} ${n === 1 ? one : many}`;
const covers = (s: MeritSource) => `Covers ${formatRank(s.candidates)} candidates: ${s.coverage.replace(/\.$/, "")}.`;

/** The NBEMS PDF and the notice that publishes it. */
const Sources = ({ s }: { s: MeritSource }) => <DataSource results={false} terms={[s, { name: `${s.name}: NBEMS notice`, url: s.noticeUrl, type: s.type }]} />;

function Sheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="grid content-start gap-2 rounded-xl border border-border bg-card p-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </li>
  );
}

export default async function RankToolsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const profile = profileFromParams(params);
  const f = parseSearchParams(schema, params);
  const typedScore = params.get("score")?.trim() || null;
  const typedAir = params.get("air")?.trim() || null;
  const badScore = typedScore != null && f.score == null;
  const badAir = typedAir != null && f.air == null;
  const score = f.score;
  const rank = badAir ? null : (f.air ?? profile?.rank ?? null);
  const category: Category = f.mcat ?? (profile ? (`${profile.category}${profile.pwd ? " PwD" : ""}` as Category) : "Open");

  const lists = await meritLists(); // newest first
  const [scores, positions] = await Promise.all([
    score == null ? [] : Promise.all(lists.map((l) => scoreToRank(l.year, score))),
    rank == null ? [] : Promise.all(lists.filter((l) => l.hasCategories).map((l) => meritPosition(l.year, category, rank))),
  ]);

  return (
    <AppPage className="grid grid-cols-1 gap-6">
      <PageHead title="Score & rank">What a NEET PG score or rank meant in earlier NBEMS results: the rank a score was, and how many candidates of a category were ahead of a rank. History of those exams, not a prediction.</PageHead>

      <FilterBar action="/decide/rank-tools" params={params} cols="md:grid-cols-[1fr_1fr_1fr_auto]">
        <Field label="NEET PG score">
          <input name="score" inputMode="numeric" defaultValue={typedScore ?? ""} placeholder="e.g. 419" aria-invalid={badScore || undefined} aria-describedby={badScore ? "score-error" : undefined} className={`${control} numeric`} />
        </Field>
        <Field label="All India Rank">
          <input name="air" inputMode="numeric" defaultValue={typedAir ?? rank ?? ""} placeholder="e.g. 42,284" aria-invalid={badAir || undefined} aria-describedby={badAir ? "air-error" : undefined} className={`${control} numeric`} />
        </Field>
        <Field label="Category"><Select name="mcat" value={category} options={categories.map((c) => ({ value: c, label: c }))} /></Field>
      </FilterBar>

      <section aria-labelledby="score-h" className="grid grid-cols-1 gap-3">
        <h2 id="score-h" className="text-lg font-semibold">Score to rank</h2>
        <p className="text-sm text-muted-foreground">
          Each year has its own scale ({lists.map((l) => `${l.year} out of ${l.maxMarks}`).join(", ")}), so the same score means different things in different years: compare ranks, not scores.
        </p>
        <div aria-live="polite">
          {badScore ? (
            <p id="score-error" role="alert" className="text-sm text-ember">“{typedScore}” isn&apos;t a score. Enter a whole number, for example 419.</p>
          ) : score == null ? (
            <EmptyState headingLevel={3} title="Enter a score" description="Type a NEET PG score above to see the rank it was in each year's NBEMS result." />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {scores.map((l) => {
                if (!l) return null;
                const { at, above, below, source: s } = l;
                const nearest = [above && `${above.score} was ${air(above)}`, below && `${below.score} was ${air(below)}`].filter(Boolean).join("; ");
                return (
                  <Sheet key={s.year} title={`NEET PG ${s.year}, out of ${s.maxMarks}`}>
                    <p>
                      {score > s.maxMarks
                        ? `NEET PG ${s.year} was marked out of ${s.maxMarks}, so a score of ${score} isn't possible in that year.`
                        : at
                          ? <>In NEET PG {s.year} (out of {s.maxMarks}), a score of {score} was <span className="numeric font-semibold">{air(at)}</span>: {plural(at.count, "candidate", "candidates")} had that score.</>
                          : `In NEET PG ${s.year} (out of ${s.maxMarks}), no candidate in the list scored ${score}. Nearest: ${nearest}.`}
                    </p>
                    <p className="text-xs text-muted-foreground">{covers(s)}</p>
                    <Sources s={s} />
                  </Sheet>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="merit-h" className="grid grid-cols-1 gap-3">
        <h2 id="merit-h" className="text-lg font-semibold">Merit position</h2>
        <p className="text-sm text-muted-foreground">How many candidates of one category had a NEET PG rank at or ahead of the one you enter, in an earlier AIQ merit list. Counts only, from that year: the candidates, category mix and seats change every year.</p>
        <div aria-live="polite">
          {badAir ? (
            <p id="air-error" role="alert" className="text-sm text-ember">“{typedAir}” isn&apos;t a rank. Enter a whole number between 1 and 3,00,000, for example 42,284.</p>
          ) : rank == null ? (
            <EmptyState headingLevel={3} title="Enter a rank" description="Type an All India Rank above, or set your rank, to see how many candidates of a category were ahead of it." />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {positions.map((p) => {
                if (!p) return null;
                const cat = p.category === category ? category : `${p.category} (${category})`;
                const n = p.min !== p.max ? `${formatRank(p.min)}–${formatRank(p.max)}` : p.min === p.qualified ? "all" : formatRank(p.min);
                const steps = [p.from, p.to].flatMap((r) => (r ? [`up to AIQ rank ${formatRank(r.aiqRank)} (AIR ${formatRank(r.maxAir)} or better), ${formatRank(r.count)}`] : []));
                return (
                  <Sheet key={p.year} title={`NEET PG ${p.year} AIQ merit list`}>
                    <p>In NEET PG {p.year}, <span className="numeric font-semibold">{n}</span> of the {formatRank(p.qualified)} {cat} candidates in the AIQ merit list had AIR {formatRank(p.rank)} or better.</p>
                    <p className="text-xs text-muted-foreground">The list is counted in steps of AIQ rank: {steps.join("; ")} {p.category} candidates. {covers(p.source)}</p>
                    <Sources s={p.source} />
                  </Sheet>
                );
              })}
              {lists.filter((l) => !l.hasCategories).map((s) => (
                <Sheet key={s.year} title={`NEET PG ${s.year}`}>
                  <p>No {s.year} count: the {s.year} category-wise merit list is not published yet. The NEET PG {s.year} result NBEMS has published prints no category.</p>
                  <Sources s={s} />
                </Sheet>
              ))}
            </ul>
          )}
        </div>
      </section>
    </AppPage>
  );
}
