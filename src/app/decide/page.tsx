import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { formatRank } from "@/features/cutoffs/lib/format";
import { DemoSource, HISTORY_CAPTION, SetRankPrompt } from "@/features/decide/components/bits";
import { ChartCard, LabelBars, RankStrip, RoundTrend } from "@/features/decide/components/charts";
import { StatStrip, TopChoices } from "@/features/decide/components/dashboard-parts";
import { reachLabel, reachOrder } from "@/features/decide/lib/reach";
import { profileFromParams, profileToParams, toURLSearchParams } from "@/features/decide/profile";
import { dashboard, getNotices } from "@/features/decide/service";
import { roundLabel } from "@/features/decide/types";

export const metadata: Metadata = { title: "Overview" };
const label = (r: (typeof reachOrder)[number]) => reachLabel(r, 2026, [2024, 2025]);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = profileFromParams(toURLSearchParams(await searchParams));
  if (!profile) return <Container className="py-10"><h1 className="text-3xl font-bold tracking-tight">Overview</h1><SetRankPrompt path="/decide" /></Container>;

  const [d, notices] = await Promise.all([dashboard(profile), getNotices()]);
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ ...Object.fromEntries(profileToParams(profile)), ...extra })}`;
  const schedule = notices.filter((n) => n.kind === "schedule").sort((a, b) => a.date.localeCompare(b.date));
  const open = schedule.find((n) => /open now/i.test(n.title));
  const reached = d.counts["reached-latest"] + d.counts["reached-both"] + d.counts["reached-one"];

  return (
    <Container className="grid gap-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-muted-foreground">AIR {formatRank(profile.rank)}, {profile.category}{profile.pwd ? " PwD" : ""}. MCC All India counselling 2026.</p>
        </div>
        {open && (
          <p className="flex items-center gap-2 rounded-lg border border-sky/30 bg-sky/10 px-3 py-2 text-sm">
            <span className="size-2 rounded-full bg-leaf" aria-hidden />
            <strong className="font-semibold">Round 2 choice filling is open.</strong>
            <a href={open.url} target="_blank" rel="noopener noreferrer" className="text-sky underline">MCC schedule (opens MCC site)</a>
          </p>
        )}
      </div>

      <StatStrip
        items={[
          { label: "Options in your profile", value: String(d.total), note: `${d.strip.length} courses, ${d.counts["closed-before"]} closed before your rank` },
          { label: "Reached your rank in some round", value: String(reached), note: `${d.counts["reached-latest"]} of them in 2026 R1 (provisional)`, href: `/decide/options${q({})}` },
          { label: "Within 10% in a past round", value: String(d.counts["within-10"]), note: "Worth a look in later rounds", href: `/decide/options${q({ reach: "within-10" })}` },
        ]}
      />

      <ChartCard
        className="chart-paper"
        title="Where your rank sits"
        subtitle="Each dot is one option's deepest closing rank in 2025, in seat categories you can take. Dots right of your line closed after your rank."
        legend={
          <>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sky" />Reached your rank in 2025</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground/60" />Closed before your rank</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-foreground" />Your rank</span>
          </>
        }
        table={
          <table className="w-full text-sm">
            <caption className="sr-only">2025 deepest closing rank per option</caption>
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-2">Course</th><th scope="col">Institute</th><th scope="col">Quota</th><th scope="col" className="text-right">2025 closing</th><th scope="col" className="pl-3">vs your rank</th></tr></thead>
            <tbody>
              {d.strip.flatMap((r) => r.points.map((p) => (
                <tr key={p.id} className="border-b border-border">
                  <td className="py-1.5">{r.course.degree} {r.course.name}</td><th scope="row" className="text-left font-normal">{p.name}</th><td>{p.quota}</td>
                  <td className="numeric text-right">{formatRank(p.closing)} <span className="text-xs text-muted-foreground">{roundLabel[p.round]}</span></td>
                  <td className="pl-3">{p.reached ? "Reached" : "Closed before"}</td>
                </tr>
              )))}
            </tbody>
          </table>
        }
      >
        <RankStrip rank={profile.rank} rows={d.strip.map((r) => ({ course: `${r.course.degree} ${r.course.name}`, points: r.points }))} query={q({})} />
      </ChartCard>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <ChartCard
          title="Options by label"
          subtitle="From past closing ranks only. Select a label to see those options."
          table={
            <table className="w-full text-sm">
              <caption className="sr-only">Options by label</caption>
              <tbody>{reachOrder.map((r) => <tr key={r} className="border-b border-border"><th scope="row" className="py-1.5 text-left font-normal">{label(r)}</th><td className="numeric text-right">{d.counts[r]}</td></tr>)}</tbody>
            </table>
          }
        >
          <LabelBars rows={reachOrder.filter((r) => r !== "no-data" || d.counts[r] > 0).map((r) => ({ label: label(r), count: d.counts[r], href: `/decide/options${q({ reach: r, closed: "1" })}`, accent: r.startsWith("reached") }))} />
        </ChartCard>

        <ChartCard
          title="How closing ranks moved through 2025"
          subtitle="Median closing rank per round for each course. Later rounds usually close deeper."
          table={
            <table className="w-full text-sm">
              <caption className="sr-only">Median 2025 closing rank by round</caption>
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th scope="col" className="py-2">Course</th>{["R1", "R2", "R3", "Stray"].map((r) => <th key={r} scope="col" className="text-right">{r}</th>)}</tr></thead>
              <tbody>{d.trend.map((t) => <tr key={t.course.slug} className="border-b border-border"><th scope="row" className="py-1.5 text-left font-normal">{t.course.degree} {t.course.name}</th>{t.points.map((p) => <td key={p.round} className="numeric text-right">{p.median ? formatRank(p.median) : "—"}</td>)}</tr>)}</tbody>
            </table>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {d.trend.map((t) => <RoundTrend key={t.course.slug} title={`${t.course.degree} ${t.course.name}`} href={`/decide/last-ranks${q({ course: t.course.slug })}`} rank={profile.rank} points={t.points} />)}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="timeline" className="rounded-xl border border-border bg-card p-5">
          <h2 id="timeline" className="text-base font-semibold">Counselling timeline</h2>
          <ol className="mt-4 grid gap-0">
            {schedule.map((n, i) => {
              const done = /\(done\)/i.test(n.title), now = /open now/i.test(n.title);
              return (
                <li key={n.title} className="grid grid-cols-[1.25rem_1fr] gap-3">
                  <span className="flex flex-col items-center" aria-hidden>
                    <span className={`mt-1.5 size-3 rounded-full border-2 ${now ? "border-sky bg-sky" : done ? "border-foreground bg-foreground" : "border-input bg-card"}`} />
                    {i < schedule.length - 1 && <span className="w-px flex-1 bg-border" />}
                  </span>
                  <span className="pb-4">
                    <span className="block text-sm font-medium">{n.title.replace(/\s*\((done|open now)\)/i, "")}</span>
                    <span className="block text-xs text-muted-foreground">{fmtDate(n.date)}{now ? ", open now" : done ? ", done" : ""}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
        <TopChoices href={`/decide/choices${q({})}`} />
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground">
        <p>{HISTORY_CAPTION}</p>
        <DemoSource />
      </div>
    </Container>
  );
}
