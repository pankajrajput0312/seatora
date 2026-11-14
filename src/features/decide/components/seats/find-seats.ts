import "server-only";
import { listSeats, type SeatFilters, type SeatRow } from "../../server/seats";
import type { PageQuery } from "../../service";

export const seatSorts = ["college", "state", "seats"] as const;
export type SeatSort = (typeof seatSorts)[number];
/** listSeats filters with several quotas and states (her profile can hold more than one) and a sort. */
export type SeatQuery = Omit<SeatFilters, "quota" | "state"> & { quotas?: string[]; states?: string[]; sort?: SeatSort };

const lastIfNull = (s: string | null) => s ?? "￿";

/** Quota/state filters and the sort on rows in listSeats order (college name…); the sort is stable, so ties keep it. */
export function refineSeats(rows: SeatRow[], { quotas, states, sort = "college" }: Pick<SeatQuery, "quotas" | "states" | "sort">): SeatRow[] {
  const out = rows.filter(
    (r) => (!quotas?.length || (r.quota != null && quotas.includes(r.quota))) && (!states?.length || (r.college.state != null && states.includes(r.college.state))),
  );
  if (sort === "state") out.sort((a, b) => lastIfNull(a.college.state).localeCompare(lastIfNull(b.college.state)));
  if (sort === "seats") out.sort((a, b) => b.seats - a.seats);
  return out;
}

const some = <T>(xs: T[] | undefined) => (xs?.length ? xs : undefined);

/**
 * One page of seat rows for the Seats page and /api/v1/seats. `seats[list key]` = Σ seats of every matching row of that
 * one list (lists are never added together). Empty filter arrays mean "all".
 * ponytail: reads every matching row of the picked list (≤ ~18k, ~150 ms) and sorts/pages here; move sort and paging
 * into listSeats' SQL if lists grow.
 */
export async function findSeats(f: SeatQuery, pg: PageQuery) {
  const { quotas, states, sort, courses, specialties, degrees, categories, ...rest } = f;
  const r = await listSeats({
    ...rest,
    courses: some(courses),
    specialties: some(specialties),
    degrees: some(degrees),
    categories: some(categories),
    quota: quotas?.length === 1 ? quotas[0] : undefined,
    state: states?.length === 1 ? states[0] : undefined,
  });
  const rows = refineSeats(r.rows, { quotas, states, sort });
  const total = rows.length;
  const page = Math.min(Math.max(1, pg.page), Math.max(1, Math.ceil(total / pg.pageSize)));
  const seats = Object.fromEntries(r.lists.map((l) => [l.key, rows.reduce((a, x) => (x.list === l.key ? a + x.seats : a), 0)]));
  return { rows: rows.slice((page - 1) * pg.pageSize, page * pg.pageSize), total, page, pageSize: pg.pageSize, lists: r.lists, seats };
}
