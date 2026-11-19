"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatRank } from "@/features/cutoffs/lib/format";
import { roundShort, type Round } from "../types";
import { quotaIn } from "@/features/exams/exam";
import { yearName } from "@/features/exams/keys";
import { useExamInfo } from "../lib/use-decide-store";
import { InfoTip } from "./info-tip";
import { ScrollTable } from "./scroll-table";

// Charts follow the dataviz skill: emphasis form (one accent + gray context), thin marks, hairline solid grid,
// hover tooltips, legend for 2+ series, and a table view for every chart. Text never wears the data colour.

type Tip = { x: number; y: number; value: string; label: string; sub?: string } | null;

/** Hover tooltip (WCAG 1.4.13): stays while the pointer is on it, Escape closes it. Not a live region: the values are in the chart's label and table. */
function Tooltip({ tip, setTip }: { tip: Tip; setTip: (t: Tip) => void }) {
  useEffect(() => {
    if (!tip) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setTip(null);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [tip, setTip]);
  if (!tip) return null;
  return (
    <div className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-overlay" style={{ left: tip.x, top: tip.y - 10 }}>
      <p className="numeric text-sm font-semibold text-foreground">{tip.value}</p>
      <p className="text-muted-foreground">{tip.label}</p>
      {tip.sub && <p className="text-muted-foreground">{tip.sub}</p>}
    </div>
  );
}

/**
 * A chart with its "Show as table" view. `subtitle`: how to read it, behind an (i) beside the title (the chart's words
 * stay one click away, not a paragraph over it). `source`: one short line under it, e.g. DataSource ("Sources 1, 2").
 */
export function ChartCard({ title, subtitle, legend, table, children, className, source }: { title: string; subtitle?: React.ReactNode; legend?: React.ReactNode; table: React.ReactNode; children: React.ReactNode; className?: string; source?: React.ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <figure aria-labelledby={id} className={cn("m-0 rounded-xl border border-border bg-card p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 id={id} className="text-title font-semibold">{title}</h2>
          {subtitle && <InfoTip label={title}>{subtitle}</InfoTip>}
        </div>
        {/* The label says what it does, so no aria-pressed (a pressed "Show chart" contradicts itself). */}
        <button type="button" onClick={() => setAsTable((v) => !v)} className="min-h-11 rounded-md px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>
      {legend && !asTable && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">{legend}</div>}
      <div className="mt-4">
        {/* The table view scrolls with the page (never a box of its own), its header row pinned under the top bar. */}
        {asTable ? <ScrollTable label={`${title} (table)`} className="">{table}</ScrollTable> : children}
      </div>
      {source && <div className="mt-4">{source}</div>}
    </figure>
  );
}

const niceMax = (v: number) => {
  const step = v > 150000 ? 50000 : v > 60000 ? 20000 : 10000;
  return Math.ceil(v / step) * step;
};
const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => Math.round((max / n) * i));

type StripPoint = { name: string; quota: string; closing: number; round: Round; category: string };

/**
 * Dot strip per course: each option's 2025 deepest closing rank, with a line at your rank. A picture with one summary
 * label: dots are not focusable (hundreds of tab stops); the hover tooltip finds the nearest dot, and ChartCard's
 * table view carries the numbers for keyboard and screen-reader use.
 */
export function RankStrip({ rank, rows, year: y = 2025 }: { rank: number; rows: { course: string; points: StripPoint[] }[]; year?: number }) {
  const [tip, setTip] = useState<Tip>(null);
  const E = useExamInfo(); // each quota as the exam's MCC words it
  const year = yearName(E.key, y);
  const all = rows.flatMap((r) => r.points.map((p) => p.closing));
  const max = niceMax(Math.max(rank * 1.2, ...all));
  // Text sizes are viewBox units: at the 860px minimum width (scale 0.86) the 14-unit labels draw at 12px or more.
  const W = 1000, L = 250, R = 44, rowH = 46, top = 28;
  const H = top + rows.length * rowH + 28;
  const x = (v: number) => L + (v / max) * (W - L - R);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const s = box.width / W;
    const vx = (e.clientX - box.left) / s;
    const i = Math.floor(((e.clientY - box.top) / s - top) / rowH);
    let best: StripPoint | null = null;
    let dist = 10;
    for (const p of rows[i]?.points ?? []) {
      const d = Math.abs(x(p.closing) - vx);
      if (d < dist) [best, dist] = [p, d];
    }
    setTip(best && { x: x(best.closing) * s, y: (top + i * rowH + rowH / 2) * s, value: formatRank(best.closing), label: best.name, sub: `${quotaIn(E, best.quota)} · ${year} ${roundShort(best.round, E.key)} · ${best.category} seat` });
  };
  const summary = rows.map((r) => `${r.course}: ${r.points.length} options, ${r.points.filter((p) => p.closing >= rank).length} closed at or after your rank`).join("; ");
  return (
    <div role="region" aria-label="Where your rank sits (chart)" tabIndex={0} className="relative overflow-x-auto overflow-y-hidden" onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[860px]" role="img" aria-label={`${year} deepest closing rank of each option, with your rank ${formatRank(rank)} marked. ${summary}.`} onPointerMove={onMove}>
        {ticks(max).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 8} y2={H - 24} className="stroke-border" strokeWidth={1} />
            <text x={x(t)} y={H - 8} textAnchor="middle" className="numeric fill-muted-foreground text-[14px]">{formatRank(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = top + i * rowH + rowH / 2;
          return (
            <g key={r.course}>
              <text x={0} y={cy + 5} className="fill-foreground text-[14px] font-medium">{r.course}</text>
              <line x1={L} x2={W - R} y1={cy} y2={cy} className="stroke-border" strokeWidth={1} />
              {r.points.map((p, j) => <circle key={j} cx={x(p.closing)} cy={cy} r={5} strokeWidth={2} className={cn("stroke-card", p.closing >= rank ? "fill-mark" : "fill-muted-foreground/60")} />)}
            </g>
          );
        })}
        <line x1={x(rank)} x2={x(rank)} y1={top - 20} y2={H - 24} className="stroke-foreground" strokeWidth={2} />
        <text x={x(rank) + 6} y={top - 10} className="numeric fill-foreground text-[14px] font-bold">You, {formatRank(rank)}</text>
      </svg>
      <Tooltip tip={tip} setTip={setTip} />
    </div>
  );
}

/** One-series horizontal bars (count per reach label), value at the tip. */
export function LabelBars({ rows }: { rows: { label: string; count: number; href: string; accent: boolean }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="grid gap-1">
      {rows.map((r) => (
        <li key={r.label}>
          <Link href={r.href} className="group grid min-h-11 grid-cols-[minmax(0,11rem)_1fr] items-center gap-3 rounded-md hover:bg-muted/50">
            <span className="py-1 text-sm text-pretty text-muted-foreground group-hover:text-foreground">{r.label}</span>
            <span className="flex items-center gap-2">
              <span className={cn("h-3 rounded-r-[4px]", r.accent ? "bg-mark" : "bg-muted-foreground/50")} style={{ width: `${(r.count / max) * 85}%` }} aria-hidden />
              <span className="numeric text-sm font-semibold text-foreground">{formatRank(r.count)}<span className="sr-only"> options</span></span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Small multiple: median 2025 closing by round for one course, with a hairline at your rank. Hover tooltips; values in the label. */
export function RoundTrend({ title, href, rank, points, year: yr = 2025 }: { title: string; href?: string; rank: number; points: { round: Round; median: number | null; n: number }[]; year?: number }) {
  const ek = useExamInfo().key;
  const year = yearName(ek, yr);
  const [tip, setTip] = useState<Tip>(null);
  const vals = points.flatMap((p) => (p.median ? [p.median] : []));
  const max = niceMax(Math.max(rank * 1.15, ...vals));
  const W = 260, H = 140, L = 8, R = 12, T = 18, B = 22;
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = points.flatMap((p, i) => (p.median ? [`${x(i)},${y(p.median)}`] : [])).join(" ");
  const last = [...points].reverse().find((p) => p.median);
  return (
    <div className="relative rounded-lg border border-border p-3" onPointerLeave={() => setTip(null)}>
      <h3 className="text-title font-semibold">{href ? <Link href={href} className="inline-flex min-h-11 items-center text-sky underline">{title}</Link> : title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`${title}: median closing rank by round in ${year}. ${points.map((p) => `${roundShort(p.round, ek)} ${p.median ? formatRank(p.median) : "none"}`).join(", ")}. Your rank ${formatRank(rank)}.`}>
        <line x1={L} x2={W - R} y1={y(rank)} y2={y(rank)} className="stroke-foreground/70" strokeWidth={1} />
        <text x={L} y={y(rank) - 4} className="numeric fill-muted-foreground text-[12px]">You, {formatRank(rank)}</text>
        <polyline points={line} className="fill-none stroke-mark" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          p.median ? (
            <g key={p.round}>
              {/* Hover only: the svg is one image with the values in its label; "Show as table" has them too. */}
              <circle cx={x(i)} cy={y(p.median)} r={12} className="fill-transparent"
                onPointerEnter={(e) => { const s = e.currentTarget.ownerSVGElement!.getBoundingClientRect().width / W; setTip({ x: x(i) * s + 12, y: y(p.median!) * s + 28, value: formatRank(p.median!), label: `${year} ${roundShort(p.round, ek)} median`, sub: `${formatRank(p.n)} options` }); }} />
              <circle cx={x(i)} cy={y(p.median)} r={4} className="pointer-events-none fill-mark stroke-card" strokeWidth={2} />
            </g>
          ) : null,
        )}
        {points.map((p, i) => <text key={p.round} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[12px]">{roundShort(p.round, ek)}</text>)}
        {last?.median && <text x={x(points.indexOf(last))} y={y(last.median) - 8} textAnchor="end" className="numeric fill-foreground text-[13px] font-semibold">{formatRank(last.median)}</text>}
      </svg>
      <Tooltip tip={tip} setTip={setTip} />
    </div>
  );
}
