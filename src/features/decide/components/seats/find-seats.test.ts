import { describe, expect, it } from "vitest";
import type { SeatRow } from "../../server/seats";
import type { College } from "../../types";
import { listOptions, unlistedSeats } from "../../service";
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
    expect(names(refineSeats(rows, { quotas: ["DNB Quota", null] }))).toBe("BCD"); // null: a PDF with no quota column
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

  const profile = { rank: 42284, category: "OBC" as const, pwd: false, specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: ["MD", "DNB", "NBEMS Diploma", "Diploma"], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };
  const mine = { list: "mcc/2026/R2_clear_vacancy.pdf", specialties: profile.specialties, degrees: profile.degrees, categories: ["Open", "OBC"], quotas: ["All India", "DNB Quota", "Deemed/Paid Seats"] };

  it("nohist: the seats Options names but cannot list, the same on both pages", async () => {
    const no = await findSeats({ ...mine, nohist: true }, { page: 1, pageSize: 100000 });
    const u = (await unlistedSeats(profile))!;
    expect(u.list.key).toBe(mine.list);
    expect(u.seats).toBe(no.seats[mine.list]);
    expect(u.options).toBe(new Set(no.rows.map((r) => `${r.college.key}~${r.degree}~${r.specialty}~${r.quota}`)).size);
    // Sri Venkateswaraa MD Anaesthesiology, Deemed/Paid, Open 17: added by MCC's 13 Nov notice, no allotment history.
    expect(no.rows.some((r) => /VENKATESWARAA/i.test(r.college.name) && r.degree === "MD" && r.specialty === "ANAESTHESIOLOGY" && r.seats === 17)).toBe(true);
    // Options' clear-seat total + these = the list's total for her filters.
    const all = await findSeats(mine, { page: 1, pageSize: 1 });
    const opts = await listOptions(profile, { hasSeats: true, showClosed: true });
    expect(opts.rows.reduce((a, r) => a + (r.seats ?? 0), 0) + u.seats).toBe(all.seats[mine.list]);
  });

  it("hasSeats counts the options it hides that have seats only in the virtual vacancy list", async () => {
    const opts = await listOptions(profile, { hasSeats: true, showClosed: true });
    expect(opts.virtualOnly?.list.key).toBe("mcc/2026/R2_virtual_vacancy.pdf");
    expect(opts.virtualOnly!.options).toBeGreaterThan(0);
    const every = await listOptions(profile, { showClosed: true });
    expect(opts.total + opts.virtualOnly!.options).toBeLessThanOrEqual(every.total);
  });

  it("a state filter counts the matching seats it drops for having no state", async () => {
    const st = await findSeats({ ...mine, states: ["Maharashtra"] }, { page: 1, pageSize: 1 });
    const all = await findSeats(mine, { page: 1, pageSize: 100000 });
    expect(st.noState[mine.list]).toBe(all.rows.filter((r) => r.college.state == null).reduce((a, r) => a + r.seats, 0));
    expect(st.noState[mine.list]).toBeGreaterThan(0);
    expect((await findSeats(mine, { page: 1, pageSize: 1 })).noState[mine.list]).toBe(0);
  });
});
