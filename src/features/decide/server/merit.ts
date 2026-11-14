import "server-only";
import { db } from "@/lib/db";
import type { SourceType } from "@/types/provenance";
import { getCatalog } from "./catalog";

// NBEMS result aggregates (MeritList, ScoreRank, MeritPosition; prisma/import-mcc.ts). History of one year's exam, never
// a prediction: say "In NEET PG 2025, a score of X was rank A–B". Scores of different years are out of different totals
// (maxMarks): compare ranks across years, not scores.

/** The NBEMS PDF behind a year's figures: DataSource (name, PDF url, tier) plus what it covers. */
export type MeritSource = {
  key: string;
  name: string;
  url: string | null;
  type: SourceType;
  /** The NBEMS notice that publishes the PDF. */
  noticeUrl: string;
  year: number;
  maxMarks: number;
  candidates: number;
  /** Who is ranked, as the exporter states it (2025: qualified AIQ-eligible candidates only). */
  coverage: string;
  /** False when the PDF prints no category (no meritPosition for that year). */
  hasCategories: boolean;
};

const listSelect = { year: true, maxMarks: true, candidates: true, coverage: true, noticeUrl: true, step: true, source: { select: { key: true, name: true, url: true, type: true } } } as const;
type ListRow = { year: number; maxMarks: number; candidates: number; coverage: string; noticeUrl: string; step: number | null; source: { key: string; name: string; url: string | null; type: SourceType } };
const toSource = ({ source: s, step, ...l }: ListRow): MeritSource => ({ ...s, ...l, hasCategories: step != null });

/** Years with NBEMS aggregates, newest first. */
export async function meritLists(): Promise<MeritSource[]> {
  await getCatalog(); // same availability as the rest of Decide
  return (await db.meritList.findMany({ select: listSelect, orderBy: { year: "desc" } })).map(toSource);
}

async function listOf(year: number) {
  await getCatalog();
  const l = await db.meritList.findUnique({ where: { year }, select: { ...listSelect, qualified: true } });
  if (!l) return null;
  const { qualified, ...rest } = l;
  return { source: toSource(rest), qualified: (qualified ?? null) as Record<string, number> | null };
}

/** Rank range of one score: best/worst = lowest/highest rank among candidates with that score. */
export type ScoreRankRow = { score: number; bestRank: number; worstRank: number; count: number };
/** `at` = the row itself (null when no candidate had that score or rank); `above`/`below` = nearest higher/lower score. */
export type ScoreLookup = { year: number; at: ScoreRankRow | null; above: ScoreRankRow | null; below: ScoreRankRow | null; source: MeritSource };

const rowSelect = { score: true, bestRank: true, worstRank: true, count: true } as const;
const neighbours = (year: number, score: number) =>
  Promise.all([
    db.scoreRank.findFirst({ where: { year, score: { gt: score } }, orderBy: { score: "asc" }, select: rowSelect }),
    db.scoreRank.findFirst({ where: { year, score: { lt: score } }, orderBy: { score: "desc" }, select: rowSelect }),
  ]);

/** What rank a score was in that year's result. Null when the year has no NBEMS data. */
export async function scoreToRank(year: number, score: number): Promise<(ScoreLookup & { score: number }) | null> {
  const list = await listOf(year);
  if (!list) return null;
  const [at, [above, below]] = await Promise.all([db.scoreRank.findUnique({ where: { year_score: { year, score } }, select: rowSelect }), neighbours(year, score)]);
  return { year, score, at, above, below, source: list.source };
}

/** What score a rank had in that year's result (`at` null when the rank falls between two scores' ranks). */
export async function rankToScore(year: number, rank: number): Promise<(ScoreLookup & { rank: number }) | null> {
  const list = await listOf(year);
  if (!list) return null;
  const prev = await db.scoreRank.findFirst({ where: { year, bestRank: { lte: rank } }, orderBy: { bestRank: "desc" }, select: rowSelect });
  if (prev && prev.worstRank >= rank) {
    const [above, below] = await neighbours(year, prev.score);
    return { year, rank, at: prev, above, below, source: list.source };
  }
  const below = await db.scoreRank.findFirst({ where: { year, bestRank: { gt: rank } }, orderBy: { bestRank: "asc" }, select: rowSelect });
  return { year, rank, at: null, above: prev, below, source: list.source };
}

/** MCC seat category ("OBC", "Open PwD"…) → NBEMS merit-list category ("OBC", "GENERAL PwBD"…); NBEMS labels pass through. */
export function nbemsCategory(category: string): string {
  const pwd = / PwD$/.test(category);
  const base = category.replace(/ PwD$/, "");
  const nb = base === "Open" ? "GENERAL" : base === "EWS" ? "GENERAL-EWS" : base;
  return pwd ? `${nb} PwBD` : nb;
}

/** A merit-list row: candidates of the category at or ahead of AIQ rank `aiqRank`, whose highest NEET PG rank is `maxAir`. */
export type MeritRow = { aiqRank: number; maxAir: number; count: number };
export type MeritPositionResult = {
  year: number;
  /** NBEMS label. */
  category: string;
  rank: number;
  /** Candidates of `category` with a NEET PG rank at or ahead of `rank`: between `min` and `max` (from the rows around it). */
  min: number;
  max: number;
  /** Last row with maxAir ≤ rank (null: rank is ahead of the first row) and first row with maxAir > rank (null: past the last). */
  from: MeritRow | null;
  to: MeritRow | null;
  /** Qualified candidates of the category in the list. */
  qualified: number | null;
  source: MeritSource;
};

/**
 * Where a NEET PG rank fell among one category in that year's AIQ merit list (category = NBEMS label or MCC category).
 * Null when the year's PDF has no categories (2026 so far) or the category is not in it.
 */
export async function meritPosition(year: number, category: string, rank: number): Promise<MeritPositionResult | null> {
  const list = await listOf(year);
  const cat = nbemsCategory(category);
  if (!list?.qualified || !(cat in list.qualified)) return null;
  const select = { aiqRank: true, maxAir: true, count: true } as const;
  const [from, to] = await Promise.all([
    db.meritPosition.findFirst({ where: { year, category: cat, maxAir: { lte: rank } }, orderBy: [{ maxAir: "desc" }, { aiqRank: "desc" }], select }),
    db.meritPosition.findFirst({ where: { year, category: cat, maxAir: { gt: rank } }, orderBy: [{ maxAir: "asc" }, { aiqRank: "asc" }], select }),
  ]);
  return { year, category: cat, rank, min: from?.count ?? 0, max: to?.count ?? from?.count ?? 0, from, to, qualified: list.qualified[cat], source: list.source };
}
