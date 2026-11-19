import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { z } from "zod";
import { Container } from "@/components/layout/container";
import { RankCta, RankForm, RankRows, rankSummary } from "@/components/marketing/rank-check";
import { formatRank } from "@/features/cutoffs/lib/format";
import { baseCategories } from "@/features/decide/types";
import { rankCheck } from "@/features/exams/landing/data";
import { allow } from "@/lib/rate-limit";

// The public rank check's answer: where a NEET PG rank got in last year, no sign-in. Per request (it reads the query);
// the cutoffs behind it are read once per category per data version (rankTable), and each visitor gets 20 checks a minute.

export const metadata: Metadata = {
  title: "Where your NEET PG rank got in last year",
  description: "Enter your All India Rank and category: the MCC seats that took it in last year's Rounds 1 to 3, from MCC's result PDFs.",
  robots: { index: false }, // one page per rank: /neet-pg is the page to find
};

/** "18,500" or "18500" (any spaces or commas) and a category; a category it doesn't know is Open. */
const querySchema = z.object({
  rank: z.string().transform((s) => Number(s.replace(/[\s,]/g, ""))).pipe(z.number().int().min(1).max(300000)),
  cat: z.enum(baseCategories).catch("Open"),
});

type Props = { searchParams: Promise<{ rank?: string | string[]; cat?: string | string[] }> };

export default async function RankCheckPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = querySchema.safeParse(params);
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const busy = q.success && !allow(`rank-check:${ip}`, 20, 60_000);
  const r = q.success && !busy ? await rankCheck(q.data.rank, q.data.cat) : null;

  return (
    <Container className="grid gap-12 py-10 md:py-20 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
      <section aria-labelledby="rank-h">
        <p className="text-sm text-muted-foreground">NEET PG, where a rank got in</p>
        <h1 id="rank-h" className="glow mt-3 font-pixel text-4xl leading-[0.95] tracking-tight md:text-6xl">
          {q.success ? `AIR ${formatRank(q.data.rank)}, ${q.data.cat}` : "Your rank"}
        </h1>
        {!q.success ? (
          params.rank === undefined ? (
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-muted-foreground">Enter your All India Rank and category to see the seats that took it last year.</p>
          ) : (
            <p role="alert" className="mt-6 max-w-prose text-base text-ember">Enter your All India Rank as a number from 1 to 3,00,000.</p>
          )
        ) : busy ? (
          <p role="alert" className="mt-6 max-w-prose text-base text-sun">That&apos;s 20 ranks in a minute. Try again in a minute.</p>
        ) : r && r.n > 0 ? (
          <>
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-foreground">{rankSummary(r)}</p>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              An option is one course at one institute in one quota. These {r.rows.length} closed nearest your rank, at different institutes: the most sought
              seats this rank still got.
            </p>
            <div className="mt-6"><RankRows r={r} /></div>
            <RankCta r={r} className="mt-8 w-full sm:w-auto" />
            <p className="mt-3 max-w-prose text-sm text-muted-foreground">Each option with its closing rank in every round, its fee, stipend and bond, and this year&apos;s seats.</p>
          </>
        ) : (
          r && (
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-foreground">
              No option closed at or after AIR {formatRank(r.rank)} in MCC&apos;s {r.year} Rounds 1 to 3. Stray rounds and the restricted quotas (NRI,
              Armed Forces, minority, a university&apos;s own) are in the planner.
            </p>
          )
        )}
      </section>

      <aside className="grid content-start gap-6">
        <div className="rounded-xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-base font-medium">{q.success ? "Try another rank" : "Where did your rank get in?"}</h2>
          <RankForm rank={q.success ? q.data.rank : undefined} category={q.success ? q.data.cat : undefined} className="mt-4" />
        </div>
        <div className="text-sm leading-relaxed text-muted-foreground">
          <p>
            From MCC&apos;s allotment result PDFs, on the quotas anyone can take (All India, deemed and DNB). Stray-round closings don&apos;t count.
          </p>
          <p className="mt-2">History, not a prediction: this year&apos;s seats, candidates and rounds can differ.</p>
          <Link href="/neet-pg" className="mt-2 inline-flex min-h-11 items-center text-sky underline underline-offset-4 hover:no-underline">NEET PG counselling: ranks, fees and where it stands</Link>
        </div>
      </aside>
    </Container>
  );
}
