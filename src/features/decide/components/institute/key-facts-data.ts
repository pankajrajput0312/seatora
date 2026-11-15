import type { GridCell } from "../../lib/reach";
import type { OptionRow } from "../../service";
import { openQuotas, rounds, type Round } from "../../types";

// The institute page's key facts (key-facts.tsx): which course rows it shows, and each row's newest closing rank.
// Plain .ts so it is tested without a database.

/** Rows in the key facts: on phones only the first KEY_ROWS_PHONE show (the rest in Courses). */
export const KEY_ROWS = 5;
export const KEY_ROWS_PHONE = 3;

/**
 * Her options here (profile; in the service's order), else the main courses: quotas anyone can take first, then the most
 * clear-vacancy seats in the newest round, then the most allotments in the newest year with any; at most KEY_ROWS.
 */
export function keyRows(options: OptionRow[], yours: OptionRow[] | null): OptionRow[] {
  if (yours?.length) return yours.slice(0, KEY_ROWS);
  const open = (r: OptionRow) => (openQuotas.includes(r.quota) ? 0 : 1);
  const newestN = (r: OptionRow) => Object.entries(r.allotmentsByYear).sort(([a], [b]) => Number(b) - Number(a)).find(([, n]) => n != null)?.[1] ?? 0;
  return [...options].sort((a, b) => open(a) - open(b) || (b.seatsBy?.clear ?? 0) - (a.seatsBy?.clear ?? 0) || newestN(b) - newestN(a)).slice(0, KEY_ROWS);
}

/** The closing rank of the newest round with one (newest year, then its last round): her seat categories with a profile. */
export function newestClosing(grid: OptionRow["grid"]): (GridCell & { year: number; round: Round }) | null {
  for (const year of Object.keys(grid).map(Number).sort((a, b) => b - a)) {
    const round = [...rounds].reverse().find((r) => grid[year]?.[r]);
    if (round) return { ...grid[year][round]!, year, round };
  }
  return null;
}
