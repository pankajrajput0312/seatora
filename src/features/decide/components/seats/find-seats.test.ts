import { describe, expect, it } from "vitest";
import { reachOrder, type Reach } from "../../lib/reach";
import { profileFromParams } from "../../profile";
import type { SeatRow } from "../../server/seats";
import { getCatalog } from "../../server/catalog";
import { courseTerms, type ProgrammeTerms } from "../../server/terms";
import { optionId, type College } from "../../types";
import { feeValue, listOptions, unlistedSeats } from "../../service";
import { csvLine, findSeats, NO_LABEL, parseSeatsParams, refineSeats, seatsCsv, seatsView, type PastClosing } from "./find-seats";

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

it("sorts by year-1 fee (lowest first) and bond years (no bond on record first), as the Fees page reads them; not declared last, ties keeping institute order", () => {
  // Only what feeValue reads (server/terms.ts ProgrammeTerms): year 1's fee, the bond's years (0 = no bond on record).
  const fees = (fee: number | null, years: number | null) => ({ years: [{ year: 1, fee: fee == null ? null : { inr: fee } }], bond: { years } }) as unknown as ProgrammeTerms;
  const xs = [{ ...rows[0], fees: fees(500000, 2) }, rows[1], { ...rows[2], fees: fees(100000, 1) }, { ...rows[3], fees: fees(500000, 0) }];
  expect(names(refineSeats(xs, { sort: "fee" }))).toBe("CADB");
  expect(names(refineSeats(xs, { sort: "bond" }))).toBe("DCAB");
  expect(names(refineSeats([{ ...rows[0], fees: fees(null, null) }, { ...rows[1], fees: fees(1, 3) }], { sort: "bond" }))).toBe("BA");
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
    // Options' clear-seat total + these = the list's total for her filters (the all view: options with past allotments).
    const all = await findSeats(mine, { page: 1, pageSize: 1 });
    const opts = await listOptions(profile, { view: "all", hasSeats: true, showClosed: true });
    expect(opts.rows.reduce((a, r) => a + (r.seats ?? 0), 0) + u.seats).toBe(all.seats[mine.list]);
    // The round view lists those seats as new options, so its clear-seat total is the list's total alone.
    const round = await listOptions(profile, { hasSeats: "clear" });
    expect(round.view).toBe("round");
    expect(round.rows.reduce((a, r) => a + (r.seats ?? 0), 0)).toBe(all.seats[mine.list]);
    expect(round.rows.filter((r) => r.reach === "new").reduce((a, r) => a + (r.seats ?? 0), 0)).toBe(u.seats);
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
    const opts = new Map((await listOptions(her, { view: "all", showClosed: true })).rows.map((o) => [o.id, o]));
    const both = v.r!.rows.filter((r) => r.reach && opts.has(optionId({ college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota! })));
    expect(both.length).toBeGreaterThan(600);
    for (const r of both) expect(opts.get(optionId({ college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota! }))!.reachBy?.[r.category as "Open"]).toBe(r.reach);
    // GMERS Vadnagar NBEMS Diploma Anaesthesiology, DNB Quota: "Reached in 2026 R1" from OBC seats (2026 R1 44,810), while
    // the clear vacancy list prints Open (2) and SC seats only: Open closed before her rank, so Options says so.
    const g = opts.get("GMERSMEDICALCOLLEGEANDGENERALHOSPITALKHA#384355~NBEMS Diploma~ANAESTHESIOLOGY~DNB Quota")!;
    expect(g).toMatchObject({ reach: "reached-latest", reachBy: { Open: "closed-before", OBC: "reached-latest" }, seatsBy: { clear: 2, virtual: 3 } });
    expect(g.seatsBelow).toMatchObject([{ kind: "clear", on: [{ category: "Open", reach: "closed-before", at: { year: expect.any(Number), closing: expect.any(Number) } }] }]);
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
    expect(lines[0]).toContain("2026 R2 clear vacancy seats,2026 R2 virtual vacancy seats,2026 R2 newly added seats,2026 R1 closing rank,2025 R2 closing rank,2025 R3 closing rank,2024 R2 closing rank,2024 R3 closing rank,Deepest of these");
    expect(lines[0]).toContain("Leaving penalty ₹ (highest),Beds,Beds note,Type");
    expect(lines[0]).toContain("Reach at AIR 42284 (history, not a prediction)");
    expect(lines.some((l) => l.startsWith("MCC PG 2026 Round 2 clear vacancy (list as published),https://"))).toBe(true);
    expect(lines.some((l) => l.startsWith("MCC PG 2025 Round 3 allotment result (final),https://"))).toBe(true);
    // The MCC seat notice dated the same day as the clear and virtual lists, listed for each (as the page shows it).
    const sameDay = lines.filter((l) => l.startsWith("NOTICE FOR ADDITION AND REMOVAL OF SEATS FROM ROUND 2 PG 2026,") && l.includes("the same day as the"));
    expect(sameDay.map((l) => l.match(/the same day as the (.*) list/)?.[1])).toEqual(["2026 R2 clear vacancy", "2026 R2 virtual vacancy"]);
    expect(v.sort).toBe("reach");
  });

  it("matrix: the round's lists merged, Σ per list = each list alone, every closing with its count; All rounds adds earlier lists and allotted-only rows", async () => {
    const p = new URLSearchParams("rank=42284&cat=OBC&c=MD~ANAESTHESIOLOGY,DNB~ANAESTHESIOLOGY,NBEMS Diploma~ANAESTHESIOLOGY,Diploma~ANAESTHESIOLOGY,DNB~FAMILYMEDICINE");
    const her = profileFromParams(p)!;
    const m = (await seatsView(parseSeatsParams(p), her)).r!;
    expect(parseSeatsParams(p).view).toBe("matrix");
    expect(m.lists.map((l) => l.key)).toEqual(["mcc/2026/R2_clear_vacancy.pdf", "mcc/2026/R2_virtual_vacancy.pdf", "mcc/2026/R2_new_seats.pdf"]);
    for (const l of m.lists) {
      const one = (await seatsView(parseSeatsParams(new URLSearchParams(`${p}&view=list&list=${l.key}`)), her)).r!;
      expect(m.seats[l.key]).toBe(one.seats[l.key]);
    }
    expect(m.rows.every((r) => Object.values(r.byList).some((n) => n > 0))).toBe(true);
    // A virtual vacancy is a seat held from an earlier round: never "new"; with no allotment linked, the data gap is named.
    const virtual = "mcc/2026/R2_virtual_vacancy.pdf";
    expect(m.rows.filter((r) => (r.byList[virtual] ?? 0) > 0 && r.reach === "new")).toEqual([]);
    for (const r of m.rows.filter((x) => x.noLabel === NO_LABEL.unlinked)) expect(r.byList[virtual]).toBeGreaterThan(0);
    // Kokilaben Navi Mumbai DNB Anaesthesiology, DNB Quota, Open: every round of every year, with allotments made.
    const k = (await findSeats({ ...mine, specialties: ["ANAESTHESIOLOGY"], degrees: ["DNB"], categories: ["Open"], quotas: ["DNB Quota"], compare: true, q: "Kokilaben" })).rows.find((r) => r.college.key.startsWith("KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8"))!;
    expect(k.closings.map((c) => `${c.year} ${c.round} ${c.closing} (${c.n})`)).toEqual(["2025 R1 21699 (2)", "2025 R2 25059 (2)", "2025 R3 29892 (2)", "2025 stray 33685 (1)", "2026 R1 20132 (1)"]);
    expect(m.rows.some((r) => r.closings.some((c) => c.year === 2023))).toBe(true);
    // has: only rows with newly added seats; Σ of the new list unchanged (every newly added seat is on such a row).
    const added = (await seatsView(parseSeatsParams(new URLSearchParams(`${p}&has=new`)), her)).r!;
    expect(added.rows.every((r) => (r.byList["mcc/2026/R2_new_seats.pdf"] ?? 0) > 0)).toBe(true);
    expect(added.seats["mcc/2026/R2_new_seats.pdf"]).toBe(m.seats["mcc/2026/R2_new_seats.pdf"]);
    expect(added.total).toBeLessThan(m.total);
    // A row whose course and quota MCC never allotted is "new", as on Options.
    expect(m.rows.some((r) => r.reach === "new")).toBe(true);
    // All rounds: every list, the latest rows kept, plus allotted rows no list prints (no seats, with closings).
    const a = (await seatsView(parseSeatsParams(new URLSearchParams(`${p}&rounds=all`)), her, 100000)).r!;
    expect(a.lists).toHaveLength(10);
    expect(a.total).toBeGreaterThan(m.total);
    for (const l of m.lists) expect(a.seats[l.key]).toBe(m.seats[l.key]);
    const onlyAllotted = a.rows.filter((r) => !Object.keys(r.byList).length);
    expect(onlyAllotted.length).toBeGreaterThan(0);
    expect(onlyAllotted.every((r) => r.closings.length > 0 && r.seats === 0)).toBe(true);
    const keys = a.rows.map((r) => [r.college.key, r.degree, r.specialty, r.quota, r.category].join("|"));
    expect(new Set(keys).size).toBe(keys.length);
    // Terms: each row's own course (its programme's bucket, its own bond figure where the record prices bonds by subject).
    const cat = await getCatalog();
    for (const r of m.rows) expect(r.fees).toEqual(courseTerms(cat, r.college.key, r.degree, r.specialty));
    const byFee = (await seatsView(parseSeatsParams(new URLSearchParams(`${p}&sort=fee`)), her, 100000)).r!.rows.map((r) => feeValue.fee1(r.fees));
    const known = byFee.filter((x) => x != null);
    expect(known).toEqual([...known].sort((x, y) => x - y));
    expect(byFee.slice(0, known.length)).toEqual(known); // not declared last
    // The CSV follows: every closing column with its count, and the figures the Fees page reads.
    const csv = await seatsCsv({ ...(await seatsView(parseSeatsParams(p), her)), r: m });
    expect(csv.split("\r\n")[0]).toContain("Fee year 1 ₹,Stipend year 1 ₹/month,Bond years,Bond ₹ (highest),Leaving penalty ₹ (highest),Beds");
    expect(csv.split("\r\n")[0]).toContain("2026 R1 closing rank,2026 R1 allotted,2025 R1 closing rank,2025 R1 allotted");
    expect(csv.split("\r\n")[0]).toContain("2023 Special stray closing rank");
    expect(csv.split("\r\n")[0]).toContain("Reach at AIR 42284");
  });

  it("a PDF with no quota column gets no label (not \"No allotment\"), on the page and in the CSV", async () => {
    // 2025 R2 newly added (11 Dec PDF) prints no quota; North Bengal MD Anaesthesiology has All India Open allotments.
    const p = new URLSearchParams("rank=42284&cat=OBC&c=MD~ANAESTHESIOLOGY,DNB~ANAESTHESIOLOGY,NBEMS Diploma~ANAESTHESIOLOGY,DNB~FAMILYMEDICINE");
    const her = profileFromParams(p)!;
    for (const q of ["rounds=all", "view=list&list=mcc/2025/R2_new_seats_2025-12-11.pdf"]) {
      const v = await seatsView(parseSeatsParams(new URLSearchParams(`${p}&${q}`)), her);
      const none = v.r!.rows.filter((r) => r.quota == null);
      expect(none.length).toBeGreaterThan(0);
      expect(none.every((r) => r.reach === null && r.noLabel === NO_LABEL.quota)).toBe(true);
      expect(none.some((r) => /North Bengal/i.test(r.college.name) && r.degree === "MD" && r.specialty === "ANAESTHESIOLOGY" && r.category === "Open")).toBe(true);
      const csv = (await seatsCsv({ ...v, r: v.r! })).split("\r\n").filter((l) => l.startsWith("North Bengal Medical College,") && l.includes(",MD,") && l.includes("Anaesthesiology"));
      expect(csv.some((l) => l.includes(NO_LABEL.quota))).toBe(true);
      expect(csv.some((l) => /,—,Open,/.test(l) && l.includes("No allotment"))).toBe(false);
    }
  });

  it("a list line printing 0 seats: shown in its one-list view, left out where lists are merged", async () => {
    const f = { list: "mcc/2026/R2_new_seats.pdf", quotas: ["Armed Forces Medical"], q: "Naval" };
    expect((await findSeats(f)).rows.filter((r) => r.seats === 0)).toHaveLength(2);
    expect((await findSeats({ ...f, compare: true })).rows.every((r) => Object.values(r.byList).some((n) => n > 0))).toBe(true);
  });

  it("a state filter counts the matching seats it drops for having no state", async () => {
    const st = await findSeats({ ...mine, states: ["Maharashtra"] }, { page: 1, pageSize: 1 });
    const all = await findSeats(mine, { page: 1, pageSize: 100000 });
    // 0 since the round-2 bundle gives every college a state; the count still has to match the rows.
    expect(st.noState[mine.list]).toBe(all.rows.filter((r) => r.college.state == null).reduce((a, r) => a + r.seats, 0));
    expect((await findSeats(mine, { page: 1, pageSize: 1 })).noState[mine.list]).toBe(0);
  });
});
