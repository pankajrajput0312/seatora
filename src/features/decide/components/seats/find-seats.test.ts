import { describe, expect, it } from "vitest";
import type { SeatRow } from "../../server/seats";
import type { College } from "../../types";
import { findSeats, refineSeats } from "./find-seats";

const row = (name: string, state: string | null, quota: string | null, seats: number): SeatRow => ({
  list: "l", college: { key: name, slug: name, name, state } as College, course: null, degree: "MD", specialty: "X", quota, category: "Open", seats, cs: null,
});
// listSeats order: by college name
const rows = [row("A", "Kerala", "All India", 1), row("B", null, null, 5), row("C", "Assam", "DNB Quota", 3), row("D", "Kerala", "DNB Quota", 3)];
const names = (xs: SeatRow[]) => xs.map((r) => r.college.name).join("");

describe("refineSeats", () => {
  it("filters several quotas and states; a row with no quota or state never matches them", () => {
    expect(names(refineSeats(rows, { quotas: ["All India", "DNB Quota"] }))).toBe("ACD");
    expect(names(refineSeats(rows, { states: ["Kerala", "Assam"] }))).toBe("ACD");
    expect(names(refineSeats(rows, { quotas: [], states: [] }))).toBe("ABCD");
  });
  it("sorts by state (missing last) or most seats, ties keeping institute order", () => {
    expect(names(refineSeats(rows, { sort: "state" }))).toBe("CADB");
    expect(names(refineSeats(rows, { sort: "seats" }))).toBe("BCDA");
    expect(names(refineSeats(rows, {}))).toBe("ABCD");
  });
});

// Her filter on the 2026 R2 clear vacancy list, against the local import (set -a; . ~/.config/seatora/db.env; set +a).
describe.skipIf(!process.env.DATABASE_URL)("findSeats on the real import", { timeout: 60_000 }, () => {
  it("pages one list; Σ seats covers every matching row, not just the page", async () => {
    const f = { list: "mcc/2026/R2_clear_vacancy.pdf", specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: ["MD", "DNB", "NBEMS Diploma", "Diploma"], categories: ["Open", "OBC"], quotas: [], states: [] };
    const all = await findSeats(f, { page: 1, pageSize: 100000 });
    const p2 = await findSeats({ ...f, sort: "seats" }, { page: 2, pageSize: 50 });
    expect(all.lists.map((l) => l.key)).toEqual([f.list]);
    expect(all.seats[f.list]).toBe(all.rows.reduce((a, r) => a + r.seats, 0));
    expect(p2).toMatchObject({ total: all.total, page: 2, seats: all.seats });
    expect(p2.rows).toHaveLength(50);
    expect(p2.rows[0].seats).toBeGreaterThanOrEqual(p2.rows[49].seats);
    // Two quotas filter in memory; the result equals the two one-quota reads.
    const two = await findSeats({ ...f, quotas: ["All India", "DNB Quota"] }, { page: 1, pageSize: 100000 });
    const one = async (q: string) => (await findSeats({ ...f, quotas: [q] }, { page: 1, pageSize: 1 })).seats[f.list];
    expect(two.seats[f.list]).toBe((await one("All India")) + (await one("DNB Quota")));
  });
});
