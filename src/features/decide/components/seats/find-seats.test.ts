import { describe, expect, it } from "vitest";
import { reachOrder, type Reach } from "../../lib/reach";
import { profileFromParams } from "../../profile";
import type { SeatRow } from "../../server/seats";
import { optionId, type College } from "../../types";
import { listOptions, unlistedSeats } from "../../service";
import { csvLine, findSeats, parseSeatsParams, refineSeats, seatsCsv, seatsView, type PastClosing } from "./find-seats";

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
  it("sorts by reach (beyond her rank first, then deepest) or deepest past closing, missing last", () => {
    const d = (closing: number) => ({ year: 2025, round: "R3", closing, provisional: false }) as PastClosing;
    const h = (r: SeatRow, reach: Reach | null, deepest: PastClosing | null) => ({ ...r, reach, deepest });
    const xs = [h(rows[0], "closed-before", d(9)), h(rows[1], null, null), h(rows[2], "reached-both", d(5)), h(rows[3], "reached-both", d(7))];
    expect(names(refineSeats(xs, { sort: "reach" }))).toBe("DCAB");
    expect(names(refineSeats(xs, { sort: "closing" }))).toBe("ADCB");
  });
});

it("csvLine: quotes when needed, never runs a formula, — for missing", () => {
  expect(csvLine(["a,b", 'say "hi"', null, 42, "=1+1", "-x", "", "plain"])).toBe(`"a,b","say ""hi""",—,42,'=1+1,'-x,—,plain`);
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

  it("compare: every list of the round side by side, one row per institute, course, quota and seat category; each column = that list alone", async () => {
    const c = await findSeats({ ...mine, compare: true });
    expect(c.lists.map((l) => l.kind)).toEqual(["clear", "virtual", "new"]);
    for (const l of c.lists) expect(c.seats[l.key]).toBe((await findSeats({ ...mine, list: l.key }, { page: 1, pageSize: 1 })).seats[l.key]);
    expect(new Set(c.rows.map((r) => [r.college.key, r.degree, r.specialty, r.quota, r.category].join("|"))).size).toBe(c.total);
    expect(c.rows.every((r) => Object.keys(r.byList).length > 0)).toBe(true);
  });

  it("past closings per seat category, and the reach label Options gives on that one category", async () => {
    // Kokilaben Navi Mumbai, DNB Anaesthesiology, DNB Quota, Open seats: 1 in the 2026 R2 virtual vacancy list.
    const f = { list: "mcc/2026/R2_virtual_vacancy.pdf", specialties: ["ANAESTHESIOLOGY"], degrees: ["DNB"], categories: ["Open"], quotas: ["DNB Quota"], sort: "reach" as const, reachFor: { rank: 42284, categories: ["Open"] } };
    const v = await findSeats(f);
    const k = v.rows.find((r) => r.college.key.startsWith("KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8"))!;
    expect(k.seats).toBe(1);
    expect(k.deepest).toMatchObject({ year: 2025, round: "R3", closing: 29892 });
    expect(k.rounds.find((c) => c.year === 2025 && c.round === "stray")?.closing).toBe(33685);
    expect(k.rounds.find((c) => c.year === 2026)).toMatchObject({ round: "R1", closing: 20132 });
    // An Open-category profile has one seat category, so Options' label per option must be the seat row's.
    const open = { ...profile, category: "Open" as const, specialties: ["ANAESTHESIOLOGY"], degrees: ["DNB"], quotas: ["DNB Quota"] };
    const opts = new Map((await listOptions(open, { showClosed: true })).rows.map((o) => [o.id, o.reach]));
    const both = v.rows.filter((r) => opts.has(optionId({ college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota! })));
    expect(both.length).toBeGreaterThan(20);
    for (const r of both) expect(r.reach).toBe(opts.get(optionId({ college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota! })));
    const pos = v.rows.map((r) => reachOrder.indexOf(r.reach!));
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
    // A seat category she can't take gets no label.
    const sc = await findSeats({ ...f, categories: ["SC"], reachFor: { rank: 42284, categories: ["Open", "OBC"] } }, { page: 1, pageSize: 5 });
    expect(sc.rows.length).toBeGreaterThan(0);
    expect(sc.rows.every((r) => r.reach === null)).toBe(true);
  });

  it("two seat categories: each Seats row has Options' label on that category, and Options notes a list whose seats are all on another label", async () => {
    // Her pairs profile, clear vacancy list: every labelled Seats row = Options' label on the row's seat category alone.
    const p = new URLSearchParams("rank=42284&cat=OBC&c=MD~ANAESTHESIOLOGY,DNB~ANAESTHESIOLOGY,NBEMS Diploma~ANAESTHESIOLOGY,Diploma~ANAESTHESIOLOGY,DNB~FAMILYMEDICINE");
    const her = profileFromParams(p)!;
    const v = await seatsView(parseSeatsParams(p), her);
    const opts = new Map((await listOptions(her, { showClosed: true })).rows.map((o) => [o.id, o]));
    const both = v.r!.rows.filter((r) => r.reach && opts.has(optionId({ college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota! })));
    expect(both.length).toBeGreaterThan(600);
    for (const r of both) expect(opts.get(optionId({ college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota! }))!.reachBy?.[r.category as "Open"]).toBe(r.reach);
    // GMERS Vadnagar NBEMS Diploma Anaesthesiology, DNB Quota: "Reached in 2026 R1" from OBC seats (2026 R1 44,810), while
    // the clear vacancy list prints Open (2) and SC seats only: Open closed before her rank, so Options says so.
    const g = opts.get("GMERSMEDICALCOLLEGEANDGENERALHOSPITALKHA#384355~NBEMS Diploma~ANAESTHESIOLOGY~DNB Quota")!;
    expect(g).toMatchObject({ reach: "reached-latest", reachBy: { Open: "closed-before", OBC: "reached-latest" }, seatsBy: { clear: 2, virtual: 3 } });
    expect(g.seatsBelow).toEqual([{ kind: "clear", on: [{ category: "Open", reach: "closed-before" }] }]);
    // A Seats row with no history on its own seat category says so for that category, not "your categories".
    const csv = await seatsCsv({ ...v, r: v.r! });
    expect(csv).toContain("No allotment on OBC seats in 2024, 2025 or 2026 R1");
    expect(csv).not.toContain("No allotment in your categories");
  });

  it("CSV of her view: every row, page order, sources in columns", async () => {
    const p = new URLSearchParams("rank=42284&cat=OBC&sp=ANAESTHESIOLOGY,FAMILYMEDICINE&view=compare");
    const v = await seatsView(parseSeatsParams(p), profileFromParams(p));
    const csv = await seatsCsv({ ...v, r: v.r! });
    const lines = csv.split("\r\n");
    expect(lines.indexOf("")).toBe(v.r!.total + 1); // header, rows, then a blank row before the notes and sources
    expect(lines[0]).toContain("2026 R2 clear vacancy seats,2026 R2 virtual vacancy seats,2026 R2 newly added seats,2024 R2 closing rank");
    expect(lines[0]).toContain("Reach at AIR 42284 (history, not a prediction)");
    expect(lines.some((l) => l.startsWith("MCC PG 2026 Round 2 clear vacancy (list as published),https://"))).toBe(true);
    expect(lines.some((l) => l.startsWith("MCC PG 2025 Round 3 allotment result (final),https://"))).toBe(true);
    // The MCC seat notice dated the same day as the clear and virtual lists, listed for each (as the page shows it).
    const sameDay = lines.filter((l) => l.startsWith("NOTICE FOR ADDITION AND REMOVAL OF SEATS FROM ROUND 2 PG 2026,") && l.includes("the same day as the"));
    expect(sameDay.map((l) => l.match(/the same day as the (.*) list/)?.[1])).toEqual(["2026 R2 clear vacancy", "2026 R2 virtual vacancy"]);
    expect(v.sort).toBe("reach");
  });

  it("a state filter counts the matching seats it drops for having no state", async () => {
    const st = await findSeats({ ...mine, states: ["Maharashtra"] }, { page: 1, pageSize: 1 });
    const all = await findSeats(mine, { page: 1, pageSize: 100000 });
    expect(st.noState[mine.list]).toBe(all.rows.filter((r) => r.college.state == null).reduce((a, r) => a + r.seats, 0));
    expect(st.noState[mine.list]).toBeGreaterThan(0);
    expect((await findSeats(mine, { page: 1, pageSize: 1 })).noState[mine.list]).toBe(0);
  });
});
