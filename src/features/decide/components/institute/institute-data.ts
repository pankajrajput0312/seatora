import "server-only";
import { getCatalog, type YearInfo } from "../../server/catalog";
import { countAllotments, type AllotmentCount } from "../../server/queries";
import { listSeats, seatLists, sumSeats, type SeatRow } from "../../server/seats";
import { baseCategories, openQuotas, roundLabel, type Round, type SeatList, type Source } from "../../types";

// Institute page data (src/app/decide/institutes/[slug]) that the service does not return: the newest round's seat
// lists at this college, and its allotments by quota and seat category.

export type RoundSeats = { list: SeatList; rows: SeatRow[] }[];

/**
 * The newest round's seat lists (clear, virtual, newly added: seatLists() order; a kind can have two PDFs), each with its
 * rows at this college, every course. Empty when no list is imported. Each list stays separate: they overlap.
 */
export async function roundSeatsAt(collegeKey: string): Promise<RoundSeats> {
  const all = await seatLists();
  const lists = all.filter((l) => l.year === all[0]?.year && l.round === all[0]?.round);
  return Promise.all(lists.map(async (list) => ({ list, rows: (await listSeats({ list: list.key, college: collegeKey })).rows })));
}

/** One option's seats in ONE list's rows: its course and quota, in `categories` (all when omitted); null when the list prints none. */
export const optionSeats = (rows: SeatRow[], o: { degree: string; specialty: string; quota: string }, categories?: string[]) =>
  sumSeats(rows.filter((r) => r.degree === o.degree && r.specialty === o.specialty), { quota: o.quota, categories });

const categoryOrder: string[] = [...baseCategories, ...baseCategories.map((c) => `${c} PwD`)];
const pos = (xs: string[], x: string) => (xs.includes(x) ? xs.indexOf(x) : xs.length);

export type MixColumn = { label: string; year: number; round?: Round; provisional: boolean };
export type AllotmentMix = { columns: MixColumn[]; groups: { quota: string; rows: { category: string; values: (number | null)[] }[] }[] };

/**
 * Allotments per quota × seat category: the newest result round, then each year (all its rounds; the newest year only
 * when it has more than that round). Open quotas first, then the rest by name; null = none in that column. Null when
 * there are no allotments.
 */
export function allotmentMix(rows: AllotmentCount[], years: YearInfo[], sources: Source[]): AllotmentMix | null {
  const [newest] = years;
  if (!newest?.rounds.length || !rows.length) return null;
  const round = newest.rounds.at(-1)!;
  const columns: MixColumn[] = [
    { label: `${newest.year} ${roundLabel[round]}`, year: newest.year, round, provisional: sources.some((s) => s.year === newest.year && s.round === round && s.provisional) },
    ...years
      .filter((y) => y.year !== newest.year || y.rounds.length > 1)
      .map((y) => ({ label: y.year === newest.year ? `${y.year} (${y.rounds.map((r) => roundLabel[r]).join(", ")})` : String(y.year), year: y.year, provisional: y.provisional })),
  ];
  const quotas = [...new Set(rows.map((r) => r.quota))].sort((a, b) => pos(openQuotas, a) - pos(openQuotas, b) || a.localeCompare(b));
  const cats = [...new Set(rows.map((r) => r.category as string))].sort((a, b) => pos(categoryOrder, a) - pos(categoryOrder, b) || a.localeCompare(b));
  const cell = (c: MixColumn, quota: string, category: string) => {
    const xs = rows.filter((r) => r.quota === quota && r.category === category && r.year === c.year && (!c.round || r.round === c.round));
    return xs.length ? xs.reduce((a, r) => a + r.n, 0) : null;
  };
  return {
    columns,
    groups: quotas.map((quota) => ({
      quota,
      rows: cats.filter((category) => rows.some((r) => r.quota === quota && r.category === category)).map((category) => ({ category, values: columns.map((c) => cell(c, quota, category)) })),
    })),
  };
}

/** allotmentMix of every course at this college, from the Allotment table. */
export async function allotmentMixAt(collegeKey: string) {
  const cat = await getCatalog();
  const cs = [...cat.pairs.values()].filter((p) => p.college === collegeKey).map((p) => p.cs);
  return allotmentMix(await countAllotments(cat, cs), cat.meta.years, cat.sources);
}
