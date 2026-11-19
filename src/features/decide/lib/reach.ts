import { formatRank } from "@/features/cutoffs/lib/format";
import { authorityOf, DEFAULT_EXAM, yearName, type ExamKey } from "@/features/exams/keys";
import { kindName, roundLabel, rounds, roundShort, type BaseCategory, type Category, type Cutoff, type Round, type SeatKind, type Source } from "../types";

/** The years the labels compare (client-safe; service.ts re-exports them). They match the imported MCC results. */
export const LATEST_YEAR = 2026;
export const PAST_YEARS: [number, number] = [2024, 2025];
export const YEARS = [2024, 2025, 2026];

/**
 * The latest year and its newest round with an MCC result in the data (latestRound). `pastYears`, `exam`: another exam's
 * two past years and key (exams/registry.ts latestOf); absent = NEET PG's PAST_YEARS (pastOf) and years.
 */
export type Latest = { year: number; round: Round; pastYears?: [number, number]; /** Set when `round` is a stray round: the latest year's last round before Stray (what "reached" counts). */ main?: Round; exam?: ExamKey };
/** The past years the labels beside `latest` count. */
export const pastOf = (latest: Latest): [number, number] => latest.pastYears ?? PAST_YEARS;
/** A year beside `latest` as its exam names it (exams/keys.ts yearName; NEET PG: the year). */
const yearOf = (latest: Latest, y: number) => yearName(latest.exam ?? DEFAULT_EXAM, y);

/**
 * THE latest round (one source of truth for every label, note, filter and export): the latest year's newest round with
 * a result PDF in the data (`rounds` order; R1 before any), provisional while MCC's result for it is. `year`: the
 * exam's latest year (exams/registry.ts latestOf), NEET PG's by default.
 */
export function latestRound(sources: Pick<Source, "year" | "round" | "provisional">[], year = LATEST_YEAR): Latest & { provisional: boolean } {
  const mine = sources.filter((s) => s.year === year);
  const had = rounds.filter((r) => mine.some((s) => s.round === r));
  const round = had.at(-1) ?? "R1";
  const main = isStrayRound(round) ? had.filter((r) => !isStrayRound(r)).at(-1) : undefined;
  return { year, round, provisional: mine.some((s) => s.round === round && s.provisional), ...(main && { main }) };
}

/** Index in `rounds` of the latest year's last round the labels count: its newest, the one before without it (-1: none). */
const lastCounted = ({ round }: Latest, includeLatest: boolean) => rounds.indexOf(round) - (includeLatest ? 0 : 1);

/** "2026 R1", or "2026 R1 to R2" once R2 is in: the latest year's rounds the labels count (R1 when none is). */
export function latestText(latest: Latest, includeLatest = true) {
  const last = rounds[Math.max(0, lastCounted(latest, includeLatest))];
  return `${yearOf(latest, latest.year)} ${last === "R1" ? "R1" : `R1 to ${roundShort(last, latest.exam)}`}`;
}

/** Seat categories a candidate can be allotted: Open always, their own category, and PwD seats if PwD. */
export function eligibleCategories(category: BaseCategory, pwd: boolean): Category[] {
  const base: Category[] = category === "Open" ? ["Open"] : ["Open", category];
  return pwd ? [...base, ...base.map((c) => `${c} PwD` as Category)] : base;
}

export type Deepest = { closing: number; round: Round; category: Category; provisional: boolean };

/**
 * THE deepest closing (one definition on every screen): the highest closing rank among the given rounds, Stray and
 * special stray included; ties keep the first (the earliest round, as rounds come oldest first). Always shown with its
 * year and round (deepestText). A screen that leaves Stray out says "deepest before Stray" and shows Stray beside it.
 */
export const deepestOf = <T extends { closing: number }>(xs: T[]): T | null => xs.reduce<T | null>((a, c) => (!a || c.closing > a.closing ? c : a), null);

/** Why a later round can close lower than R1 (BJ Ahmedabad 2025: R1 203, R2 85): said wherever rounds sit side by side. */
export const LATER_ROUNDS_NOTE = "Later rounds count only new allotments and upgrades, so a later round can close lower than R1.";

/** "Deepest 2025: 60,351 (Stray)": a deepest closing with its year and round. */
export const deepestText = (d: { year: number; round?: Round; closing: number }) => `Deepest ${d.year}: ${formatRank(d.closing)}${d.round ? ` (${roundLabel[d.round]})` : ""}`;

/** Highest (deepest) closing rank per year across rounds (Stray included, as deepestOf), among the given cutoffs. */
export function deepestByYear(cutoffs: Cutoff[], provisionalSrc: Set<string>): Map<number, Deepest> {
  const out = new Map<number, Deepest>();
  for (const c of cutoffs) {
    const cur = out.get(c.year);
    if (!cur || c.closing > cur.closing) {
      out.set(c.year, { closing: c.closing, round: c.round, category: c.category, provisional: provisionalSrc.has(c.src) });
    }
  }
  return out;
}

export type GridCell = { closing: number; category: Category; n: number; provisional: boolean };

/**
 * Year × round grid. Closing (and its seat category) comes from the categories she can take; the bracketed
 * count is allotments made that round across ALL categories (the planner judge's rule: every category counts).
 */
export function buildGrid(all: Cutoff[], eligible: Set<string> | null, provisionalSrc: Set<string>) {
  const grid: Record<number, Partial<Record<Round, GridCell>>> = {};
  for (const c of all) {
    const cell = ((grid[c.year] ??= {})[c.round] ??= { closing: 0, category: c.category, n: 0, provisional: provisionalSrc.has(c.src) });
    cell.n += c.n;
    if ((!eligible || eligible.has(c.category)) && c.closing > cell.closing) Object.assign(cell, { closing: c.closing, category: c.category });
  }
  // Drop cells where none of her categories had an allotment, but keep the year if any cell remains.
  for (const y of Object.keys(grid)) {
    for (const r of Object.keys(grid[+y]) as Round[]) if (!grid[+y][r]!.closing) delete grid[+y][r];
    if (!Object.keys(grid[+y]).length) delete grid[+y];
  }
  return grid;
}

/** What a reach label reads from a cutoff (a raw cutoff, or a per-year deepest closing whose round may be unknown). */
export type ReachInput = Pick<Cutoff, "year" | "closing"> & { round?: Round; category?: Category };

/**
 * "new": an option with no past allotment at all (no row in any MCC result in the data, any year, round or seat
 * category), listed only because the newest round's seat lists print seats for it (Options' round view). classifyReach
 * never returns it. The chips' order; the round view sorts by roundReachOrder.
 */
export const reachOrder = ["reached-latest", "reached-both", "reached-one", "within-10", "stray-only", "closed-before", "no-data", "new"] as const;
export type Reach = (typeof reachOrder)[number];
/** Options' round view sort: what she can realistically get first; unknown (new, no allotment on her seats) before closed before her rank. */
export const roundReachOrder: readonly Reach[] = ["reached-latest", "reached-both", "reached-one", "within-10", "stray-only", "new", "no-data", "closed-before"];

/**
 * Stray and special stray rounds fill leftover seats, often far below the rank that closed R1 to R3, so they never make an
 * option "reached": a rank reached only there is "stray-only". A cutoff with no round (a per-year deepest from SQL,
 * findReachInputs) is from R1 to R3.
 */
export const isStrayRound = (round: Round | undefined) => round === "stray" || round === "special_stray";

/** The MCC results in the data, e.g. "2023 to 2026 R1": oldest year to the newest year's last round (`years` newest first, as meta.years). */
export function resultsSpan(years: { year: number; rounds: readonly Round[] }[], exam: ExamKey = DEFAULT_EXAM) {
  if (!years.length) return "";
  const [last, first] = [years[0], years.at(-1)!];
  const end = `${yearName(exam, last.year)}${last.rounds.length ? ` ${roundShort(last.rounds.at(-1)!, exam)}` : ""}`;
  return first.year === last.year ? end : `${yearName(exam, first.year)} to ${end}`;
}

/** `includeLatest` false: without the latest round (Options' "leave out provisional"). */
type Window = { latest: Latest; pastYears: [number, number]; includeLatest: boolean };
/** Only the years and rounds the labels talk about: the two past years, plus the latest year's R1 to its newest round. */
const inWindow = <T extends ReachInput>(cutoffs: T[], { latest, pastYears, includeLatest }: Window) =>
  cutoffs.filter((c) => pastYears.includes(c.year) || (c.year === latest.year && !!c.round && rounds.indexOf(c.round) <= lastCounted(latest, includeLatest)));

/**
 * The closing a label rests on, so a second label can say it with its year and round ("2025 R3 closed at 38,120").
 * `stray`: when that closing leaves Stray out ("deepest before Stray"), the deepest stray closing beside it.
 */
export type ReachAt = { year: number; round?: Round; closing: number; stray?: { year: number; round?: Round; closing: number } };
/**
 * The deepest closing a label counts (classifyReach's window): R1 to R3, or every round for "stray-only" or when only
 * stray rounds are there. Null: no closing in the window ("no-data").
 */
export function reachEvidence(cutoffs: ReachInput[], reach: Reach, window: Window): ReachAt | null {
  const used = inWindow(cutoffs, window);
  const main = used.filter((c) => !isStrayRound(c.round));
  const pool = reach === "stray-only" || !main.length ? used : main;
  const pick = (c: ReachInput | null) => c && { year: c.year, round: c.round, closing: c.closing };
  const d = pick(deepestOf(pool));
  const stray = pool === main ? pick(deepestOf(used.filter((c) => isStrayRound(c.round)))) : null;
  return d && (stray ? { ...d, stray } : d);
}

/**
 * A "reached" label's first round (classifyReach's window, R1 to R3, never Stray): in each year the label rests on
 * (the latest year; both past years; the one past year), the earliest round whose closing reached her rank; of those,
 * the latest. So R1 means Round 1 reached her rank in every one of those years; else `year` is the one where only a
 * later round did. Null for any other label.
 */
export function reachedFrom(rank: number, cutoffs: ReachInput[], reach: Reach, window: Window): { year: number; round: Round } | null {
  const years = reach === "reached-latest" ? [window.latest.year] : reach === "reached-both" || reach === "reached-one" ? window.pastYears : [];
  const hit = inWindow(cutoffs, window).filter((c) => c.round && !isStrayRound(c.round) && c.closing >= rank);
  let out: { year: number; round: Round } | null = null;
  for (const year of years) {
    const first = rounds.find((r) => hit.some((c) => c.year === year && c.round === r));
    if (first && (!out || rounds.indexOf(first) > rounds.indexOf(out.round))) out = { year, round: first };
  }
  return out;
}

/**
 * History-only label for how a rank compares with past closing ranks. "Reached" means the rank was within the
 * closing rank of that round, R1 to R3 only (isStrayRound). "reached-latest": in any round of the latest year so far
 * (R1 up to its newest, latestText), as a past year counts every round. Never a chance or prediction.
 */
export function classifyReach(rank: number, cutoffs: ReachInput[], { latest, pastYears, includeLatest }: Window): Reach {
  const used = inWindow(cutoffs, { latest, pastYears, includeLatest });
  if (used.length === 0) return "no-data";
  const main = used.filter((c) => !isStrayRound(c.round));
  const reachedIn = (y: number) => main.some((c) => c.year === y && c.closing >= rank);
  if (main.some((c) => c.year === latest.year && c.closing >= rank)) return "reached-latest";
  const [a, b] = pastYears;
  if (reachedIn(a) && reachedIn(b)) return "reached-both";
  if (reachedIn(a) || reachedIn(b)) return "reached-one";
  if (used.some((c) => c.closing >= rank)) return "stray-only";
  // Agreed definition (neetpg-planner export_her.py): closing within 10% of her rank, i.e. closing >= rank * 0.9.
  if (main.some((c) => c.closing >= rank * 0.9)) return "within-10";
  return "closed-before";
}

/**
 * The label of an option MCC never allotted in any result in the data ("new" internally). Not "new": that word is only
 * MCC's newly added seat list (seatKindShort "newly added").
 */
export const NEVER_ALLOTTED = "Never allotted before";

/** The rounds the labels count, e.g. "2024, 2025 and 2026 R1" (older years show in the grids but are not counted). */
export function reachWindow(latest: Latest, years: [number, number], includeLatest = true, or = false) {
  const [a, b] = years.map((y) => yearOf(latest, y));
  return lastCounted(latest, includeLatest) >= 0 ? `${a}, ${b} ${or ? "or" : "and"} ${latestText(latest, includeLatest)}` : `${a} ${or ? "or" : "and"} ${b}`;
}

/**
 * `includeLatest` false: the labels were made without the latest round (Options' "leave out provisional"). `on`: the
 * label is on that one seat category (a Seats row), not on all of hers together.
 */
export function reachLabel(reach: Reach, latest: Latest, pastYears: [number, number], includeLatest = true, on?: string): string {
  const [a, b] = pastYears.map((y) => yearOf(latest, y));
  return {
    // Stray rounds never make "reached": a latest round that is one leaves the label at the round before it (2025 R1 to R2).
    "reached-latest": `Reached in ${latest.main ? latestText({ ...latest, round: latest.main }) : latestText(latest, includeLatest)}`,
    "reached-both": `Reached in ${a} and ${b}`,
    "reached-one": `Reached in ${a} or ${b}`,
    "within-10": "Within 10% in a past round",
    "stray-only": "Reached only in stray rounds",
    "closed-before": "Closed before your rank",
    "no-data": `No allotment ${on ? `on ${on} seats` : "in your categories"} in ${reachWindow(latest, pastYears, includeLatest, true)}`,
    new: NEVER_ALLOTTED,
  }[reach];
}

/**
 * A list whose seats at an option, in her seat categories, are all on categories (`on`, each with its own label and the
 * closing it rests on, `at`) whose label is not the option's.
 */
export type SeatsBelow = { kind: SeatKind; on: { category: string; reach: Reach; at?: ReachAt | null }[] };

/**
 * Options label an option on all her seat categories together; a list's seats there can all be on a category whose own
 * label differs (e.g. "Reached in 2026 R1" from OBC seats, while the clear vacancy list prints only Open seats there,
 * where it closed before her rank). `reachBy`: the label on each of her categories alone; `seatCats`: per list kind,
 * her categories with seats in it; `at`: per category, the closing its label rests on (reachEvidence).
 */
export const seatsBelow = (reach: Reach, reachBy: Partial<Record<string, Reach>>, seatCats: Partial<Record<SeatKind, string[]>>, at?: Partial<Record<string, ReachAt | null>>): SeatsBelow[] =>
  Object.entries(seatCats).flatMap(([kind, cats]) =>
    cats?.length && cats.every((c) => (reachBy[c] ?? "no-data") !== reach)
      ? [{ kind: kind as SeatKind, on: cats.map((c) => ({ category: c, reach: reachBy[c] ?? "no-data", ...(at && { at: at[c] ?? null }) })) }]
      : [],
  );

const kindWords: Record<SeatKind, string> = { clear: "clear vacancy", virtual: "virtual vacancy", new: "newly added" };
const atVerdict: Partial<Record<Reach, string>> = {
  "reached-latest": "reached your rank",
  "reached-both": "reached your rank",
  "reached-one": "reached your rank",
  "stray-only": "reached your rank only in a stray round",
  "within-10": "before your rank, within 10%",
  "closed-before": "before your rank",
};

/**
 * The notes under an option's one label, a list kind each (kinds with the same seats merged), every fact with its year
 * and round, so they never read against the label: "In the clear and virtual vacancy lists, the seats here you can take
 * are Open seats only. On Open seats: deepest closing 38,120 in 2025 R3, before your rank."
 */
export function seatsBelowNotes(ns: SeatsBelow[], latest: Latest, pastYears: [number, number], includeLatest = true): string[] {
  const groups = new Map<string, SeatsBelow[]>();
  for (const n of ns) {
    const k = JSON.stringify(n.on);
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return [...groups.values()].map((g) => {
    const kinds = g.map((n) => (kindName(n.kind, latest.exam) === "Seat position" ? "seat position" : kindWords[n.kind]));
    const lists = `${kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)} lists` : `${kinds[0]} list`}`;
    // INI-CET: JIPMER's course total ("All", not split by category) is no category of hers: its own sentence, never "All seats".
    const on = g[0].on.filter((x) => x.category !== "All");
    const unsplit = on.length < g[0].on.length;
    if (!on.length) return `In the ${lists}, the seats here are a course total ${authorityOf(latest.exam)} doesn't split by category, so it may or may not include seats of yours. The label is from your categories' past closings.`;
    const facts = on.map(({ category, reach, at }) => {
      const verdict = atVerdict[reach];
      // Stray left out of the label's closing: say so, and give Stray as its own number.
      const stray = at?.stray ? ` Stray: ${formatRank(at.stray.closing)} in ${yearOf(latest, at.stray.year)}.` : "";
      if (at && verdict) return `On ${category} seats: deepest ${at.stray ? "before Stray " : "closing "}${formatRank(at.closing)} in ${yearOf(latest, at.year)}${at.round ? ` ${roundShort(at.round, latest.exam)}` : ""}, ${verdict}.${stray}`;
      if (verdict) return `On ${category} seats alone: ${reachLabel(reach, latest, pastYears, includeLatest, category)}.`;
      return `On ${category} seats: no allotment in ${reachWindow(latest, pastYears, includeLatest, true)}.`;
    });
    return `In the ${lists}, the seats here you can take are ${on.map((x) => x.category).join(" and ")} seats only${unsplit ? ", besides a course total not split by category" : ""}. ${facts.join(" ")}`;
  });
}

export const reachTone: Record<Reach, "info" | "neutral" | "warning"> = {
  "reached-latest": "info",
  "reached-both": "info",
  "reached-one": "neutral",
  "within-10": "warning",
  "stray-only": "warning",
  "closed-before": "neutral",
  "no-data": "neutral",
  new: "neutral",
};

/**
 * Last ranks' closing-rank filter: a row's deepest closing between `min` and `max` (either open), counting rounds from
 * year `since`; -1 when none is in range.
 */
export function bestClosing(grid: Record<number, Partial<Record<Round, { closing: number } | undefined>>>, cl: { min?: number; max?: number; since?: number }) {
  const inRange = Object.entries(grid)
    .filter(([y]) => !cl.since || Number(y) >= cl.since)
    .flatMap(([, g]) => Object.values(g).map((c) => c?.closing ?? -1))
    .filter((x) => x >= 0 && (!cl.min || x >= cl.min) && (!cl.max || x <= cl.max));
  return Math.max(-1, ...inRange);
}
