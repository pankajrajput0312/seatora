import "server-only";
import { getCatalog } from "../../server/catalog";
import { hasOption, listSeats, type SeatFilters, type SeatRow } from "../../server/seats";
import type { PageQuery } from "../../service";

export const seatSorts = ["college", "state", "seats"] as const;
export type SeatSort = (typeof seatSorts)[number];
/**
 * listSeats filters with several quotas and states (her profile can hold more than one) and a sort. A null in `quotas`
 * keeps the rows of a PDF that prints no quota. `nohist`: only rows whose course and quota is not an Options row (no
 * past allotments).
 */
export type SeatQuery = Omit<SeatFilters, "quota" | "state"> & { quotas?: (string | null)[]; states?: string[]; sort?: SeatSort; nohist?: boolean };

const lastIfNull = (s: string | null) => s ?? "￿";

/** Quota/state filters and the sort on rows in listSeats order (college name…); the sort is stable, so ties keep it. */
export function refineSeats(rows: SeatRow[], { quotas, states, sort = "college" }: Pick<SeatQuery, "quotas" | "states" | "sort">): SeatRow[] {
  const out = rows.filter(
    (r) => (!quotas?.length || quotas.includes(r.quota)) && (!states?.length || (r.college.state != null && states.includes(r.college.state))),
  );
  if (sort === "state") out.sort((a, b) => lastIfNull(a.college.state).localeCompare(lastIfNull(b.college.state)));
  if (sort === "seats") out.sort((a, b) => b.seats - a.seats);
  return out;
}

const some = <T>(xs: T[] | undefined) => (xs?.length ? xs : undefined);

/**
 * One page of seat rows for the Seats page and /api/v1/seats. `seats[list key]` = Σ seats of every matching row of that
 * one list (lists are never added together). Empty filter arrays mean "all". `noState[list key]`: with a state filter,
 * Σ seats of rows that match everything else but are at an institute with no state in the data (the filter drops them).
 * ponytail: reads every matching row of the picked list (≤ ~18k, ~150 ms) and sorts/pages here; move sort and paging
 * into listSeats' SQL if lists grow.
 */
export async function findSeats(f: SeatQuery, pg: PageQuery) {
  const { quotas, states, sort, nohist, courses, specialties, degrees, categories, ...rest } = f;
  // State is filtered here, not in SQL, so the rows a state filter drops for having no state can be counted.
  const [r, cat] = await Promise.all([
    listSeats({ ...rest, courses: some(courses), specialties: some(specialties), degrees: some(degrees), categories: some(categories), quota: quotas?.length === 1 ? (quotas[0] ?? undefined) : undefined }),
    nohist ? getCatalog() : null,
  ]);
  const kept = cat ? r.rows.filter((x) => !hasOption(cat, x)) : r.rows;
  const rows = refineSeats(kept, { quotas, states, sort });
  const noState = states?.length ? refineSeats(kept, { quotas }).filter((x) => x.college.state == null) : [];
  const perList = (xs: SeatRow[]) => Object.fromEntries(r.lists.map((l) => [l.key, xs.reduce((a, x) => (x.list === l.key ? a + x.seats : a), 0)]));
  const total = rows.length;
  const page = Math.min(Math.max(1, pg.page), Math.max(1, Math.ceil(total / pg.pageSize)));
  return { rows: rows.slice((page - 1) * pg.pageSize, page * pg.pageSize), total, page, pageSize: pg.pageSize, lists: r.lists, seats: perList(rows), noState: perList(noState) };
}
