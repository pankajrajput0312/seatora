// Chance bands for assess_chances (pure, tested). History only: the rule is written out with every band so the
// assistant can explain it, and nothing here is a probability.

import { formatRank } from "@/features/cutoffs/lib/format";
import type { Round } from "@/features/decide/types";

export type Cell = { closing: number; n?: number; provisional?: boolean };
export type Grid = Record<number, Partial<Record<Round, Cell>>>;
export type Seats = { clear?: number | null; virtual?: number | null; new?: number | null };
export type Band = "likely" | "possible" | "longShot" | "unlikely" | "noHistory";

export const BAND_RULES: Record<Band, string> = {
  likely: "Likely: her rank was within the R1 or R2 closing in 2 or more of the recent years, or within the latest year's R1 or R2 closing (provisional while MCC's result is).",
  possible: "Possible: reached in R1/R2 in one recent year, or reached in R3, or closed within 10% of her rank in a main round, or seats are up on last year's same round with a closing within 20%.",
  longShot: "Long shot: reached only in a stray round, or a main-round closing within 20% of her rank.",
  unlikely: "Unlikely: every main-round and stray closing on her seat categories was more than 20% before her rank.",
  noHistory: "No history: no past allotment on her seat categories (new seats); judge by the college and the course.",
};

const MAIN: Round[] = ["R1", "R2", "R3"];
const STRAY: Round[] = ["stray", "special_stray"];
const label: Record<Round, string> = { R1: "R1", R2: "R2", R3: "R3", stray: "stray", special_stray: "special stray" };

/** The trend of R1 closings across years: deeper (later ranks got in: easier), tighter, or steady (within 3%). */
export function trendOf(grid: Grid): { arrow: "↑" | "↓" | "→"; text: string } | null {
  const pts = Object.keys(grid)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((y) => (grid[y].R1 ? [{ y, c: grid[y].R1!.closing }] : []));
  if (pts.length < 2) return null;
  const [a, b] = [pts[0].c, pts.at(-1)!.c];
  const arrow = b > a * 1.03 ? "↑" : b < a * 0.97 ? "↓" : "→";
  const word = arrow === "↑" ? "deeper (easier)" : arrow === "↓" ? "tighter" : "steady";
  return { arrow, text: `R1 ${pts.map((p) => `${formatRank(p.c)} (${p.y})`).join(" → ")}: ${word}` };
}

/** Clear vacancy seats now vs the same list last year ("+3 clear vs 2025 R2"); null without last year's list. */
export function seatChange(now: Seats, last: Seats | null, lastLabel: string): { delta: number; text: string } | null {
  if (!last) return null;
  const a = last.clear ?? 0;
  const b = now.clear ?? 0;
  const d = b - a;
  return { delta: d, text: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)} clear vs ${lastLabel} (${b} now, ${a} then)` };
}

/**
 * The band of one option for `rank`, with a one-line reason. `years`: the recent years counted (e.g. 2024, 2025, 2026);
 * `latestYear`: the year whose R1 or R2 alone can make an option likely (as Options' "Reached in 2026 R1 to R2").
 */
export function bandOf(rank: number, grid: Grid, o: { years: number[]; latestYear: number; seatsUp?: boolean }): { band: Band; why: string } {
  const cells = o.years.flatMap((y) => Object.entries(grid[y] ?? {}).map(([r, c]) => ({ y, r: r as Round, c: c!.closing })));
  if (!cells.length) return { band: "noHistory", why: "No past allotment on her seat categories in these years." };
  const fmt = (x: { y: number; r: Round; c: number }) => `${formatRank(x.c)} in ${x.y} ${label[x.r]}`;
  const main = cells.filter((x) => MAIN.includes(x.r));
  const deepestMain = main.reduce<(typeof main)[number] | null>((m, x) => (!m || x.c > m.c ? x : m), null);
  const reached = (rs: Round[]) => cells.filter((x) => rs.includes(x.r) && x.c >= rank);
  const r1r2 = reached(["R1", "R2"]);
  const r1r2Years = [...new Set(r1r2.map((x) => x.y))];
  const latest = (["R1", "R2"] as const).flatMap((r) => { const c = grid[o.latestYear]?.[r]; return c && c.closing >= rank ? [{ r, c }] : []; })[0];
  if (latest) return { band: "likely", why: `Reached in ${o.latestYear} ${latest.r}${latest.c.provisional ? " (provisional)" : ""} (closed ${formatRank(latest.c.closing)}).` };
  if (r1r2Years.length >= 2) return { band: "likely", why: `Reached in R1/R2 in ${r1r2Years.join(" and ")} (${r1r2.slice(0, 2).map(fmt).join("; ")}).` };
  if (r1r2Years.length === 1) return { band: "possible", why: `Reached in R1/R2 only in ${r1r2Years[0]} (${fmt(r1r2[0])}).` };
  const r3 = reached(["R3"]);
  if (r3.length) return { band: "possible", why: `Reached only in R3 (${r3.map(fmt).join("; ")}).` };
  if (deepestMain && deepestMain.c >= rank * 0.9) return { band: "possible", why: `Closed within 10% of her rank (${fmt(deepestMain)}).` };
  if (o.seatsUp && deepestMain && deepestMain.c >= rank * 0.8) return { band: "possible", why: `More seats than last year and closed within 20% (${fmt(deepestMain)}).` };
  const stray = reached(STRAY);
  if (stray.length) return { band: "longShot", why: `Reached only in a stray round (${stray.map(fmt).join("; ")}).` };
  if (deepestMain && deepestMain.c >= rank * 0.8) return { band: "longShot", why: `Closed within 20% of her rank (${fmt(deepestMain)}).` };
  const deepest = cells.reduce((m, x) => (x.c > m.c ? x : m));
  return { band: "unlikely", why: `Deepest closing ${fmt(deepest)}, well before her rank.` };
}
