import "server-only";
import { z } from "zod";
import { DEFAULT_EXAM, perGroup, type ExamKey } from "@/features/exams/registry";
import { pageValue, parseSearchParams, rankValue } from "../../lib/params";
import { anyTermFilter, feeValue, termFilterLists, termFilters, termFilterShape, untypedOnly } from "../../lib/term-filters";
import { profileFromParams, profileHasCourse } from "../../profile";
import { getCollege, getMeta, listAllotments } from "../../service";
import { baseCategories, roundLabel, rounds, termLabel, type Allotment, type PrevSeat, type Source, type Term } from "../../types";
import { collegeTypeLabel } from "../institute/college-type";
import { reportedCount } from "../institute/hospital-bits";
import { hospitalInfo } from "../institute/institute-data";
import { csvLine } from "../seats/find-seats";

// The Allotments page's filters (src/app/decide/allotments), read the same lenient way by the page and its CSV
// (/api/v1/allotments/export), so the file is what she sees.

/** Seat categories (the `acat` filter). */
export const allotmentCategories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;
// Page filters never reuse a profile key: quota is `aq`, seat category `acat` (lib/links.ts).
const schema = z.object({
  inst: z.string().max(200).optional(),
  /** Course slugs (one or more). */
  course: z.array(z.string().max(100)).optional(),
  /** "0": not her profile's default (Show all). */
  mine: z.literal("0").optional(),
  year: z.coerce.number().int().optional(),
  round: z.enum(rounds).optional(),
  aq: z.string().max(100).optional(),
  acat: z.enum(allotmentCategories).optional(),
  state: z.string().max(100).optional(),
  from: rankValue.optional(),
  to: rankValue.optional(),
  page: pageValue.default(1),
  /** Fee, stipend, bond, leaving, college type and `nd` on each allotment's course and quota (lib/term-filters.ts; an absent fee / bond cap is her profile's). */
  ...termFilterShape,
});

/** MCC's remark in that round (Allotment.status). */
export const statusLabel: Record<Allotment["status"], string> = { allotted: "Allotted", fresh: "Fresh", upgraded: "Upgraded" };
/** The remark the PDF prints beside the previous round's seat. */
export const prevRemarkLabel: Record<PrevSeat["remark"], string> = { reported: "reported", not_reported: "not reported", seat_surrendered: "seat surrendered", seat_cancelled: "seat cancelled" };

/** The rank window around her rank that the page opens on: −25% to +25%. */
export const rankWindow = (rank: number) => ({ from: Math.max(1, Math.round(rank * 0.75)), to: Math.round(rank * 1.25) });

/**
 * The page's params, leniently: a bad field falls back; a rank range that isn't one is reported (`rankError`) and not
 * applied. No filter at all = with her profile, her courses (all of them when it names none) in every year and round,
 * ranks within 25% of hers (`fromProfile`, as if those were the params; mine=0 drops it), else the latest year's latest
 * round (`latest`). null: an unknown `inst` (a 404).
 */
export async function allotmentsView(params: URLSearchParams, pageSize: number, exam: ExamKey = DEFAULT_EXAM) {
  const f = parseSearchParams(schema, params, [...termFilterLists, "course"]);
  const [meta, inst] = await Promise.all([getMeta(exam), f.inst ? getCollege(f.inst, exam) : null]);
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
  // A term filter (fee, type…) alone keeps that default.
  const pristine = !["inst", "course", "year", "round", "aq", "acat", "state", "from", "to"].some((k) => params.get(k)?.trim());
  const profile = profileFromParams(params);
  const mine = profile && meta.courses.filter((c) => profileHasCourse(profile, c)).map((c) => c.slug);
  // NEET SS: ranks near hers in her question group only (a rank is within one group).
  const groupQuotas = profile && perGroup(exam) && profile.quotas.length ? profile.quotas : undefined;
  const fromProfile = pristine && profile && f.mine !== "0" ? { courses: mine && mine.length < meta.courses.length ? mine : [], ...rankWindow(profile.rank), ...(groupQuotas && { quotas: groupQuotas }) } : null;
  const latest = pristine && !fromProfile ? meta.years[0] : undefined;
  const filters = {
    year: meta.years.some((y) => y.year === f.year) ? f.year : latest?.year,
    round: f.round ?? latest?.rounds.at(-1),
    courses: fromProfile?.courses ?? f.course,
    quota: f.aq,
    ...(fromProfile?.quotas && { quotas: fromProfile.quotas }),
    category: f.acat,
    state: f.state,
    from: fromProfile?.from ?? (rankError ? undefined : f.from),
    to: fromProfile?.to ?? (rankError ? undefined : f.to),
    terms: termFilters(f, profile),
  };
  // `unknownTerms`: the rows "Include not declared" (nd=keep) would add, i.e. left out only because a filtered figure is
  // not declared (keep is a superset: it only lets unknown values through). Counted only when that box is unticked.
  const keep = anyTermFilter(filters.terms) && !filters.terms.keepUnknown ? { ...filters, terms: { ...filters.terms, keepUnknown: true } } : null;
  // `untyped`: with a college type picked, the rows it left out only because their college's type is not known.
  const typeless = untypedOnly(filters.terms);
  const [r, info, all, untyped] = await Promise.all([
    listAllotments(filters, { page: f.page, pageSize }, inst?.key, exam),
    hospitalInfo(exam),
    keep && listAllotments(keep, { page: 1, pageSize: 1 }, inst?.key, exam),
    typeless ? listAllotments({ ...filters, terms: typeless }, { page: 1, pageSize: 1 }, inst?.key, exam).then((x) => x.total) : 0,
  ]);
  // Each row's MCC institute profile (the card's external link); null when the import has none.
  const rows = r.rows.map((a) => ({ ...a, mccProfileUrl: info.get(a.college.key)?.mccProfileUrl ?? null }));
  return { f, meta, inst, typed, rankError, latest, fromProfile, filters, r: { ...r, rows, unknownTerms: all ? all.total - r.total : 0, untyped } };
}
export type AllotmentRow = NonNullable<Awaited<ReturnType<typeof allotmentsView>>>["r"]["rows"][number];

const kinds = ["fee", "stipend", "bond", "penalty"] as const;
const kindOf = { fee: "FEE", stipend: "STIPEND", bond: "BOND", penalty: "PENALTY" } as const;
const docOf = (s: Term["source"] | undefined) => s && (s.url ? `${s.name} (${s.url})` : s.name);

/**
 * Rows as CSV (no BOM: the route adds it), in the page's order: the seat, the candidate's own category, choice no.,
 * MCC's status, the seat one round back with its remark, the course's terms as plain numbers (feeValue: the stat cells'
 * figures; bond 0 = no bond on record), the college type and beds, and the terms as published, each with its document.
 * After a blank row: `notes` and the result PDFs behind the rows (each term's document is in the column beside it).
 * "—" = not available.
 */
export function allotmentsCsv(rows: AllotmentRow[], results: Source[], notes: string[]) {
  const head = [
    "Year", "Round", "Rank", "Quota", "Seat category", "Candidate category", "Choice no.", "Status", "Institute", "State", "Course",
    "Previous seat institute", "Previous seat course", "Previous seat quota", "Previous seat remark",
    "Fee year 1 ₹", "Stipend year 1 ₹/month", "Bond years", "Bond ₹ (highest)", "Leaving penalty ₹ (highest)", "Type (not official)", "Beds (self-reported)",
    ...kinds.flatMap((k) => [termLabel[kindOf[k]], `${termLabel[kindOf[k]]} source`]),
  ];
  const body = rows.map((a) => [
    a.year, `${roundLabel[a.round]}${a.provisional ? " (provisional)" : ""}`, a.rank, a.quota, a.category, a.candidateCategory, a.optionNo, statusLabel[a.status] ?? a.status,
    a.college.name, a.college.state, a.courseName,
    a.prev?.collegeName, a.prev?.courseName, a.prev?.quota, a.prev && prevRemarkLabel[a.prev.remark],
    feeValue.fee1(a.fees), feeValue.stip1(a.fees), feeValue.bondyrs(a.fees), feeValue.bond(a.fees), feeValue.leave(a.fees),
    a.hospital?.type && collegeTypeLabel[a.hospital.type.value], a.hospital?.beds && reportedCount(a.hospital.beds).text,
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
