"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatRank } from "@/features/cutoffs/lib/format";
import { roundLabel, type Round } from "../types";

// Charts follow the dataviz skill: emphasis form (one accent + gray context), thin marks, hairline solid grid,
// hover AND focus tooltips, legend for 2+ series, and a table view for every chart. Text never wears the data colour.

type Tip = { x: number; y: number; value: string; label: string; sub?: string } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div role="status" className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-overlay" style={{ left: tip.x, top: tip.y - 10 }}>
      <p className="numeric text-sm font-semibold text-foreground">{tip.value}</p>
      <p className="text-muted-foreground">{tip.label}</p>
      {tip.sub && <p className="text-muted-foreground">{tip.sub}</p>}
    </div>
  );
}

export function ChartCard({ title, subtitle, legend, table, children, className, source }: { title: string; subtitle?: string; legend?: React.ReactNode; table: React.ReactNode; children: React.ReactNode; className?: string; source?: React.ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <figure aria-labelledby={id} className={cn("m-0 rounded-xl border border-border bg-card p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <figcaption id={id} className="text-base font-medium">{title}</figcaption>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <button type="button" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} className="min-h-11 rounded-md px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>
      {legend && !asTable && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">{legend}</div>}
      <div className="mt-4">{asTable ? <div className="relative max-h-96 overflow-auto">{table}</div> : children}</div>
      {source && <div className="mt-4">{source}</div>}
    </figure>
  );
}

export function StatTile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted">{body}</Link>
  ) : (
    <div className="rounded-xl border border-border bg-card p-5">{body}</div>
  );
}

const niceMax = (v: number) => {
  const step = v > 150000 ? 50000 : v > 60000 ? 20000 : 10000;
  return Math.ceil(v / step) * step;
};
const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => Math.round((max / n) * i));

/** Dot strip per course: each option's 2025 deepest closing rank, with a line at your rank. */
export function RankStrip({ rank, rows, query }: { rank: number; rows: { course: string; points: { id: string; name: string; slug: string; quota: string; closing: number; round: Round; category: string; reached: boolean }[] }[]; query: string }) {
  const [tip, setTip] = useState<Tip>(null);
  const all = rows.flatMap((r) => r.points.map((p) => p.closing));
  const max = niceMax(Math.max(rank * 1.2, ...all));
  const W = 1000, L = 250, R = 44, rowH = 46, top = 28;
  const H = top + rows.length * rowH + 28;
  const x = (v: number) => L + (v / max) * (W - L - R);
  const show = (e: React.SyntheticEvent<SVGElement>, p: (typeof rows)[number]["points"][number]) => {
    const box = (e.currentTarget.ownerSVGElement ?? (e.currentTarget as unknown as SVGSVGElement)).getBoundingClientRect();
    const scale = box.width / W;
    const cx = Number(e.currentTarget.getAttribute("data-x"));
    const cy = Number(e.currentTarget.getAttribute("data-y"));
    setTip({ x: cx * scale, y: cy * scale, value: formatRank(p.closing), label: p.name, sub: `${p.quota} · 2025 ${roundLabel[p.round]} · ${p.category} seat` });
  };
  return (
    <div className="relative overflow-x-auto" onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[720px]" role="img" aria-label={`2025 deepest closing ranks for each option, with your rank ${formatRank(rank)} marked. Dots at or right of the line closed at or after your rank.`}>
        {ticks(max).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 8} y2={H - 24} className="stroke-border" strokeWidth={1} />
            <text x={x(t)} y={H - 8} textAnchor="middle" className="numeric fill-muted-foreground text-[12px]">{formatRank(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = top + i * rowH + rowH / 2;
          return (
            <g key={r.course}>
              <text x={0} y={cy + 5} className="fill-foreground text-[14px] font-medium">{r.course}</text>
              <line x1={L} x2={W - R} y1={cy} y2={cy} className="stroke-border" strokeWidth={1} />
              {r.points.map((p) => (
                <a key={p.id} href={`/decide/institutes/${p.slug}${query}`} aria-label={`${p.name}, ${p.quota}: closed at ${formatRank(p.closing)} in 2025 ${roundLabel[p.round]}`}>
                  <circle cx={x(p.closing)} cy={cy} r={12} className="fill-transparent" data-x={x(p.closing)} data-y={cy} onPointerEnter={(e) => show(e, p)} onFocus={(e) => show(e, p)} onBlur={() => setTip(null)} />
                  <circle cx={x(p.closing)} cy={cy} r={5} strokeWidth={2} className={cn("pointer-events-none stroke-card", p.reached ? "fill-sky" : "fill-muted-foreground/60")} />
                </a>
              ))}
            </g>
          );
        })}
        <line x1={x(rank)} x2={x(rank)} y1={top - 20} y2={H - 24} className="stroke-foreground" strokeWidth={2} />
        <text x={x(rank) + 6} y={top - 10} className="numeric fill-foreground text-[13px] font-bold">You, {formatRank(rank)}</text>
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** One-series horizontal bars (count per reach label), value at the tip. */
export function LabelBars({ rows }: { rows: { label: string; count: number; href: string; accent: boolean }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.label}>
          <Link href={r.href} className="group grid grid-cols-[minmax(0,11rem)_1fr] items-center gap-3 rounded-md py-1 hover:bg-muted/50">
            <span className="truncate text-sm text-muted-foreground group-hover:text-foreground">{r.label}</span>
            <span className="flex items-center gap-2">
              <span className={cn("h-3 rounded-r-[4px]", r.accent ? "bg-sky" : "bg-muted-foreground/50")} style={{ width: `${(r.count / max) * 85}%` }} aria-hidden />
              <span className="text-sm font-semibold text-foreground">{r.count}<span className="sr-only"> options</span></span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Small multiple: median 2025 closing by round for one course, with a hairline at your rank. */
export function RoundTrend({ title, href, rank, points }: { title: string; href?: string; rank: number; points: { round: Round; median: number | null; n: number }[] }) {
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
      <p className="text-sm font-medium">{href ? <Link href={href} className="hover:text-sky hover:underline">{title}</Link> : title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`${title}: median closing rank by round in 2025. ${points.map((p) => `${roundLabel[p.round]} ${p.median ? formatRank(p.median) : "none"}`).join(", ")}. Your rank ${formatRank(rank)}.`}>
        <line x1={L} x2={W - R} y1={y(rank)} y2={y(rank)} className="stroke-foreground/70" strokeWidth={1} />
        <text x={L} y={y(rank) - 4} className="numeric fill-muted-foreground text-[10px]">You, {formatRank(rank)}</text>
        <polyline points={line} className="fill-none stroke-sky" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          p.median ? (
            <g key={p.round}>
              <circle cx={x(i)} cy={y(p.median)} r={12} className="fill-transparent" tabIndex={0} aria-label={`${roundLabel[p.round]}: median ${formatRank(p.median)} across ${p.n} options`}
                onPointerEnter={(e) => { const s = e.currentTarget.ownerSVGElement!.getBoundingClientRect().width / W; setTip({ x: x(i) * s + 12, y: y(p.median!) * s + 28, value: formatRank(p.median!), label: `2025 ${roundLabel[p.round]} median`, sub: `${p.n} options` }); }}
                onFocus={(e) => { const s = e.currentTarget.ownerSVGElement!.getBoundingClientRect().width / W; setTip({ x: x(i) * s + 12, y: y(p.median!) * s + 28, value: formatRank(p.median!), label: `2025 ${roundLabel[p.round]} median`, sub: `${p.n} options` }); }}
                onBlur={() => setTip(null)} />
              <circle cx={x(i)} cy={y(p.median)} r={4} className="pointer-events-none fill-sky stroke-card" strokeWidth={2} />
            </g>
          ) : null,
        )}
        {points.map((p, i) => <text key={p.round} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{roundLabel[p.round]}</text>)}
        {last?.median && <text x={x(points.indexOf(last))} y={y(last.median) - 8} textAnchor="end" className="numeric fill-foreground text-[11px] font-semibold">{formatRank(last.median)}</text>}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}
