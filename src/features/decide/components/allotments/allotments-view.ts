import "server-only";
import { z } from "zod";
import { pageValue, parseSearchParams, rankValue } from "../../lib/params";
import { getCollege, getMeta, listAllotments } from "../../service";
import { baseCategories, roundLabel, rounds, termLabel, type Allotment, type PrevSeat, type Source, type Term } from "../../types";
import { csvLine } from "../seats/find-seats";

// The Allotments page's filters (src/app/decide/allotments), read the same lenient way by the page and its CSV
// (/api/v1/allotments/export), so the file is what she sees.

/** Seat categories (the `acat` filter). */
export const allotmentCategories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;
// Page filters never reuse a profile key: quota is `aq`, seat category `acat` (lib/links.ts).
const schema = z.object({
  inst: z.string().max(200).optional(),
  course: z.string().max(100).optional(),
  year: z.coerce.number().int().optional(),
  round: z.enum(rounds).optional(),
  aq: z.string().max(100).optional(),
  acat: z.enum(allotmentCategories).optional(),
  state: z.string().max(100).optional(),
  from: rankValue.optional(),
  to: rankValue.optional(),
  page: pageValue.default(1),
});

/** MCC's remark in that round (Allotment.status). */
export const statusLabel: Record<Allotment["status"], string> = { allotted: "Allotted", fresh: "Fresh", upgraded: "Upgraded" };
/** The remark the PDF prints beside the previous round's seat. */
export const prevRemarkLabel: Record<PrevSeat["remark"], string> = { reported: "reported", not_reported: "not reported", seat_surrendered: "seat surrendered", seat_cancelled: "seat cancelled" };

/**
 * The page's params, leniently: a bad field falls back; a rank range that isn't one is reported (`rankError`) and not
 * applied. No filter at all = the latest year's latest round (`latest`). null: an unknown `inst` (a 404).
 */
export async function allotmentsView(params: URLSearchParams, pageSize: number) {
  const f = parseSearchParams(schema, params);
  const [meta, inst] = await Promise.all([getMeta(), f.inst ? getCollege(f.inst) : null]);
  if (f.inst && !inst) return null;
  // A rank typed with commas ("30,000") is fine; anything else that isn't a rank is reported, not silently dropped.
  const typed = (k: "from" | "to") => params.get(k)?.trim() || null;
  const reversed = f.from != null && f.to != null && f.from > f.to;
  const rankError =
    (typed("from") && f.from == null) || (typed("to") && f.to == null)
      ? "Enter ranks as whole numbers from 1 to 3,00,000, for example 30,000. That range was not applied."
      : reversed
        ? "“Rank from” is above “Rank to”. That range was not applied."
        : null;
  // With no filter at all the page opens on the latest year's latest round (not all 2,09,571 rows); "All years" is year=all.
  const pristine = !["inst", "course", "year", "round", "aq", "acat", "state", "from", "to"].some((k) => params.get(k)?.trim());
  const latest = pristine ? meta.years[0] : undefined;
  const filters = {
    year: meta.years.some((y) => y.year === f.year) ? f.year : latest?.year,
    round: f.round ?? latest?.rounds.at(-1),
    course: f.course,
    quota: f.aq,
    category: f.acat,
    state: f.state,
    from: rankError ? undefined : f.from,
    to: rankError ? undefined : f.to,
  };
  const r = await listAllotments(filters, { page: f.page, pageSize }, inst?.key);
  return { f, meta, inst, typed, rankError, latest, filters, r };
}
export type AllotmentRow = NonNullable<Awaited<ReturnType<typeof allotmentsView>>>["r"]["rows"][number];

const kinds = ["fee", "stipend", "bond", "penalty"] as const;
const kindOf = { fee: "FEE", stipend: "STIPEND", bond: "BOND", penalty: "PENALTY" } as const;
const docOf = (s: Term["source"] | undefined) => s && (s.url ? `${s.name} (${s.url})` : s.name);

/**
 * Rows as CSV (no BOM: the route adds it), in the page's order: the seat, the candidate's own category, choice no.,
 * MCC's status, the seat one round back with its remark, and the course's terms as published, each with its document.
 * After a blank row: `notes` and the result PDFs behind the rows (each term's document is in the column beside it).
 * "—" = not available.
 */
export function allotmentsCsv(rows: AllotmentRow[], results: Source[], notes: string[]) {
  const head = [
    "Year", "Round", "Rank", "Quota", "Seat category", "Candidate category", "Choice no.", "Status", "Institute", "State", "Course",
    "Previous seat institute", "Previous seat course", "Previous seat quota", "Previous seat remark",
    ...kinds.flatMap((k) => [termLabel[kindOf[k]], `${termLabel[kindOf[k]]} source`]),
  ];
  const body = rows.map((a) => [
    a.year, `${roundLabel[a.round]}${a.provisional ? " (provisional)" : ""}`, a.rank, a.quota, a.category, a.candidateCategory, a.optionNo, statusLabel[a.status] ?? a.status,
    a.college.name, a.college.state, a.courseName,
    a.prev?.collegeName, a.prev?.courseName, a.prev?.quota, a.prev && prevRemarkLabel[a.prev.remark],
    ...kinds.flatMap((k) => [a.terms[k]?.text, docOf(a.terms[k]?.source)]),
  ]);
  const used = new Set(rows.map((a) => `${a.year}|${a.round}`));
  const foot = [
    ...notes.map((n) => [n]),
    [],
    ["Source", "Link", "Note"],
    ...results.filter((s) => used.has(`${s.year}|${s.round}`)).map((s) => [s.name, s.url, `${s.year} ${roundLabel[s.round]} allotments${s.provisional ? " (provisional)" : ""}`]),
  ];
  return [head, ...body, [], ...foot].map(csvLine).join("\r\n") + "\r\n";
}
