import "server-only";
import type { StatKey } from "../../lib/stat-format";
import { rounds, type Round } from "../../types";
import { getCatalog } from "../../server/catalog";
import { courseTerms, type ProgrammeTerms } from "../../server/terms";
import { hospitalInfo, type HospitalInfo } from "../institute/institute-data";
import { Beds } from "../pages/beds";
import { TypeBadge } from "../type-badge";

// Card bits the rank pages (Last ranks, Rank scan, Rank journey) share: each row's terms, type, beds and MCC profile,
// and the card's meta line (state • type badge • beds).

export type RowHospital = Pick<HospitalInfo, "type" | "beds"> | null;
export type RowInfo = { state: string | null; fees: ProgrammeTerms; hospital: RowHospital; mcc: string | null };

/** Allotment rows with their course and quota's terms (stat cells, term filters), the institute's state, type, beds and MCC profile. */
export async function withRowInfo<T extends { college: string; degree: string; specialty: string; quota: string }>(rows: T[]): Promise<(T & RowInfo)[]> {
  const [cat, info] = await Promise.all([getCatalog(), hospitalInfo()]);
  return rows.map((r) => {
    const h = info.get(r.college);
    return {
      ...r,
      state: cat.collegeByKey.get(r.college)?.state ?? null,
      fees: courseTerms(cat, r.college, r.degree, r.specialty, r.quota),
      hospital: h && (h.type || h.beds) ? { type: h.type, beds: h.beds } : null,
      mcc: h?.mccProfileUrl ?? null,
    };
  });
}



/**
 * A course link under a card's title (or an institute in a table): 24px tall, and `relative` so it sits above the MCC
 * icon's 44px hit area that reaches into its first line.
 */
export const subLink = "relative inline-flex min-h-6 items-center hover:text-sky hover:underline";

/**
 * The five term columns of a rank table (TermStatCells variant="table", statKeys headers): tight padding (the cells
 * break only after a range's dash, the marker on its own line), so they fit beside the row's institute at about
 * 1,024px; the last cell keeps 12px for its (i)'s 44px hit area.
 */
export const termCol = {
  /** Bond at least 104px, so "2 years" or "No bond" never breaks beside its (i). */
  th: (k: StatKey) => `px-2 py-3 text-right text-xs font-semibold text-muted-foreground last:pr-3${k === "bond" ? " min-w-26" : ""}`,
  td: "px-2 last:pr-3",
};

/** A card's meta line: state, the type badge, beds (each left out when not known). `of`: the institute, naming the beds (i). */
export const cardMeta = (r: { state: string | null; hospital?: RowHospital }, of: string) => [
  r.state,
  r.hospital?.type && <TypeBadge type={r.hospital.type} of={of} />,
  r.hospital?.beds && <Beds b={r.hospital.beds} inst={of} unit />,
];

/** Each round's first allotment at or past `rank` (rows sorted by rank within a round): "Your rank falls here" goes before it. */
export function youMarks<T extends { round: Round; rank: number }>(rows: T[], rank: number): Set<T> {
  const out = new Set<T>();
  for (const rd of rounds) {
    const hit = rows.find((a) => a.round === rd && a.rank >= rank);
    if (hit) out.add(hit);
  }
  return out;
}

/** A Last ranks card's big number: `sort` (a year and round) when given, else the row's newest closing (newest year first, R1 → special stray). */
export function bigClosing<C>(grid: Partial<Record<number, Partial<Record<Round, C>>>>, years: number[], sort?: { year: number; round: Round } | null) {
  const year = sort?.year ?? [...years].sort((a, b) => b - a).find((y) => grid[y] && rounds.some((r) => grid[y]?.[r]));
  const round = sort?.round ?? (year != null ? rounds.find((r) => grid[year]?.[r]) : undefined);
  return year != null && round ? { year, round, cell: grid[year]?.[round] ?? null } : null;
}
