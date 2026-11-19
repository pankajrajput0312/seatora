// Suggest my list (pure, tested): her options in one deterministic, explained order, from the reach labels she already
// sees and nothing else. History, never a prediction: no new reading of the data, no chance, no model.
import { formatRank } from "@/features/cutoffs/lib/format";
import { DEFAULT_EXAM, yearName } from "@/features/exams/keys";
import { typeCategory, typeCategoryLabel } from "../components/institute/college-type";
import { prefRank, type Profile } from "../profile";
import type { OptionRow } from "../service";
import { roundShort, type Round } from "../types";
import { pastOf, r1Reached, reachEvidence, type Latest, type Reach } from "./reach";
import { anyTermFilter, termVerdict, typeFails, type TermFilters } from "./term-filters";

/** Within one course preference, listed in this order: a seat higher in the list is tried first, so the stretch goes above the sure one. */
export const buckets = ["dream", "target", "safe"] as const;
export type Bucket = (typeof buckets)[number];
export const bucketName: Record<Bucket, string> = { dream: "Dream", target: "Target", safe: "Safe" };

/** The labels a suggestion can come from (the rest are left out, counted): what Suggest asks listOptions for. */
export const SUGGEST_REACH: Reach[] = ["reached-latest", "reached-both", "reached-one", "within-10", "stray-only", "new"];

/**
 * The rule, said where the list is (its (i)). Every word is the reach labels' own: "Reached" counts R1 to R3 only
 * (never a stray round); "within 10%" is a closing of at least 90% of her rank.
 */
export const BUCKET_RULES: Record<Bucket, string> = {
  safe: "Reached, first in Round 1: Round 1 reached your rank in each year the reach counts (the latest year, or both past years)",
  target: "every other Reached: reached in only one of the two past years, or only from Round 2 or later",
  dream: "Within 10% (closed before your rank, at no more than 10% before it), Reached only in a stray round, or Never allotted before where the same course at similar colleges (same type, same state) closed within 10% of your rank or past it",
};

/** What a suggestion reads of an option (OptionRow's fields). */
export type SuggestRow = Pick<OptionRow, "id" | "course" | "reach" | "reachFrom" | "grid" | "similar" | "fees" | "otherGroup"> & { hospital?: OptionRow["hospital"] };

/** Why an option is not suggested, the first reason that holds (counted, never left out silently). */
export const leftOutReasons = ["closed", "noData", "far", "otherGroup", "type", "fee", "terms", "unknown"] as const;
export type LeftOut = (typeof leftOutReasons)[number];

export type Suggested<T> = {
  row: T;
  bucket: Bucket;
  /** Her preference group (profile.ts prefRank): 0 first; past her groups for a course her order doesn't name. */
  pref: number;
  /**
   * How sought the seat is, for the tightest-first order: its newest Round 1 closing on her seat categories (a later
   * round can close far deeper: INI-CET's Open Round), else the closing its reason gives (a never-allotted one: its
   * similar seats' deepest).
   */
  closing: number;
  /** "Dream: closed at 23,502 in 2025 R3, 6% before you". */
  reason: string;
  /** Passed her caps only because "Include not published" keeps a figure that isn't published (listed after the known ones). */
  unsure?: true;
  govt: boolean;
};

export type SuggestInput = {
  rank: number;
  latest: Latest;
  order?: Profile["order"];
  /** Her fee and bond caps and the page's term filters (college type…); null or empty: none. */
  caps?: TermFilters | null;
  /** Government colleges (the shown type Govt) first within each bucket. */
  govtFirst?: boolean;
};

const grid2inputs = (g: SuggestRow["grid"]) =>
  Object.entries(g).flatMap(([y, rs]) => Object.entries(rs).flatMap(([round, c]) => (c ? [{ year: Number(y), round: round as Round, closing: c.closing, category: c.category }] : [])));

/** An option's bucket and the closing its reason rests on; null: not suggested (`left`: why). */
function place(r: SuggestRow, { rank, latest }: SuggestInput): { bucket: Bucket; closing: number; reason: string } | { left: LeftOut } {
  const exam = latest.exam ?? DEFAULT_EXAM;
  const Y = (y: number) => yearName(exam, y);
  const at = (y: number, round: Round, closing: number, category?: string) =>
    `closed at ${formatRank(closing)}${category && category !== "Open" ? ` (${category} seat)` : ""} in ${Y(y)} ${roundShort(round, exam)}`;
  const pct = (closing: number) => {
    const v = (Math.abs(closing - rank) / rank) * 100;
    // Twice her rank or more reads better in ranks than as "2,624%".
    const by = v < 1 ? "under 1%" : v < 100 ? `${Math.round(v)}%` : `${formatRank(Math.abs(closing - rank))} ranks`;
    return closing === rank ? "at your rank" : `${by} ${closing > rank ? "past" : "before"} you`;
  };
  const [a, b] = pastOf(latest).map(Y);
  const window = { latest, pastYears: pastOf(latest), includeLatest: true };
  if (r.otherGroup) return { left: "otherGroup" };
  if (r.reach === "closed-before") return { left: "closed" };
  if (r.reach === "no-data") return { left: "noData" };
  if (r.reach === "new") {
    const s = r.similar;
    if (!s || s.max < rank * 0.9) return { left: "far" };
    const range = s.min === s.max ? formatRank(s.max) : `${formatRank(s.min)}–${formatRank(s.max)}`;
    const rounds = s.last === "R1" ? "R1" : `R1 to ${roundShort(s.last, exam)}`;
    return { bucket: "dream", closing: s.max, reason: `Dream: never allotted before; the same course at ${s.colleges} other ${typeCategoryLabel[s.type]} ${s.colleges === 1 ? "college" : "colleges"} in ${s.state} closed ${range} in ${Y(s.year)} ${rounds}, ${pct(s.max)} at the deepest` };
  }
  const inputs = grid2inputs(r.grid);
  if (r.reach === "within-10" || r.reach === "stray-only") {
    const e = reachEvidence(inputs, r.reach, window);
    if (!e) return { left: "noData" };
    const cat = inputs.find((c) => c.year === e.year && c.round === e.round)?.category;
    const why = r.reach === "stray-only" ? "; your rank was reached only in a stray round" : "";
    return { bucket: "dream", closing: e.closing, reason: `Dream: ${e.round ? at(e.year, e.round, e.closing, cat) : `closed at ${formatRank(e.closing)} in ${Y(e.year)}`}, ${pct(e.closing)}${why}` };
  }
  // A "reached" label. Round 1 in every year it counts: Safe, said with Round 1's closing (r1Reached). Else Target.
  const from = r.reachFrom;
  const r1 = from?.round === "R1" && r.reach !== "reached-one" ? r1Reached(r.grid, r.reach, latest, rank) : null;
  if (r1) {
    const cat = r.grid[r1.year]?.R1?.category;
    const years = r.reach === "reached-both" ? `${a} and ${b}` : Y(latest.year);
    return { bucket: "safe", closing: r1.closing, reason: `Safe: ${at(r1.year, "R1", r1.closing, cat)}, ${pct(r1.closing)}; Round 1 reached your rank in ${years}` };
  }
  const cell = from && r.grid[from.year]?.[from.round];
  const one = r.reach === "reached-one" && from ? `reached your rank in ${Y(from.year)}, not in ${Y(from.year === pastOf(latest)[0] ? pastOf(latest)[1] : pastOf(latest)[0])}` : null;
  const r1Then = from && from.round !== "R1" ? r.grid[from.year]?.R1 : undefined;
  const later = from && from.round !== "R1" ? `only a later round reached your rank${r1Then ? ` (R1 closed at ${formatRank(r1Then.closing)})` : ""}` : null;
  const why = [one, later].filter(Boolean).join("; ");
  return { bucket: "target", closing: cell?.closing ?? Infinity, reason: `Target: ${from && cell ? `${at(from.year, from.round, cell.closing, cell.category)}, ${pct(cell.closing)}` : "reached your rank"}${why ? `; ${why}` : ""}` };
}

/** Her caps on one option: null when it passes; else the first cap that leaves it out. `unsure`: passes only with "Include not published". */
function capped(r: SuggestRow, caps: TermFilters | null | undefined): { left: LeftOut } | { unsure: boolean } {
  if (!anyTermFilter(caps)) return { unsure: false };
  const type = r.hospital?.type?.value;
  const v = termVerdict(r.fees, type, caps!);
  if (v === "fail") return { left: typeFails(type, caps!) ? "type" : termVerdict(r.fees, type, { maxFee: caps!.maxFee }) === "fail" ? "fee" : "terms" };
  if (v === "unknown" && !caps!.keepUnknown) return { left: "unknown" };
  return { unsure: v === "unknown" };
}

/**
 * Her options as one suggested list, the order MCC and AIIMS fill a list in: what she prefers most first. So by her
 * course preference (`order`), then Dream above Target above Safe within one preference (a seat higher in the list is
 * tried first, so listing a stretch above a sure seat costs it nothing), then (`govtFirst`) government colleges, then
 * the ones whose capped figures are published, then the most sought first (`closing`: its newest Round 1 closing),
 * an option never allotted before after the ones with closings of their own, then the option id (so the order never
 * varies). Her caps (`caps`) leave options out; `left` counts every option left out by its first reason.
 */
export function suggestList<T extends SuggestRow>(rows: T[], input: SuggestInput): { items: Suggested<T>[]; left: Partial<Record<LeftOut, number>> } {
  const left: Partial<Record<LeftOut, number>> = {};
  const out = (why: LeftOut) => void (left[why] = (left[why] ?? 0) + 1);
  const items: Suggested<T>[] = [];
  for (const row of rows) {
    const p = place(row, input);
    if ("left" in p) {
      out(p.left);
      continue;
    }
    const c = capped(row, input.caps);
    if ("left" in c) {
      out(c.left);
      continue;
    }
    const type = row.hospital?.type?.value;
    const years = [input.latest.year, ...[...pastOf(input.latest)].reverse()];
    const r1 = years.map((y) => row.grid[y]?.R1?.closing).find((c) => c != null);
    items.push({ row, ...p, closing: r1 ?? p.closing, pref: prefRank(input.order, row.course), govt: !!type && typeCategory[type] === "govt", ...(c.unsure && { unsure: true as const }) });
  }
  const fresh = (x: Suggested<T>) => (x.row.reach === "new" ? 1 : 0);
  items.sort(
    (x, y) =>
      x.pref - y.pref ||
      buckets.indexOf(x.bucket) - buckets.indexOf(y.bucket) ||
      (input.govtFirst ? Number(y.govt) - Number(x.govt) : 0) ||
      Number(!!x.unsure) - Number(!!y.unsure) ||
      fresh(x) - fresh(y) ||
      x.closing - y.closing ||
      (x.row.id < y.row.id ? -1 : x.row.id > y.row.id ? 1 : 0),
  );
  return { items, left };
}

