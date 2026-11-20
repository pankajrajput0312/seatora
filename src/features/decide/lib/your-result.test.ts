import { describe, expect, it } from "vitest";
import type { Profile } from "../profile";
import { roundName } from "./round-status";
import { provisionalNote, yourResult, type ResultRow, type ResultWords } from "./your-result";

// AIR 31,214 in MCC's NEET PG 2026 results: Round 1 SGPGI Lucknow MD Anaesthesiology (SC seat), not reported; the
// provisional Round 2 result (20 Nov) a fresh MS Obstetrics and Gynaecology seat at Gajra Raja Medical College, Gwalior.
const SGPGI = { college: "SANJAYGANDHIPOSTGARDUATEINSTITUTEOFMEDIC#226014", collegeName: "SGPGI Lucknow", degree: "MD", specialty: "ANAESTHESIOLOGY", courseName: "MD Anaesthesiology", quota: "All India" };
const GRMC = { college: "GAJRARAJAMEDICALCOLLEGEGWALIORMADHYAPRAD#474009", collegeName: "Gajra Raja Medical College, Gwalior", degree: "MS", specialty: "OBG", courseName: "MS Obstetrics and Gynaecology", quota: "All India" };
const r1: ResultRow = { ...SGPGI, round: "R1", category: "SC", status: "allotted", candidateCategory: "SC", prev: null };
const r2: ResultRow = { ...GRMC, round: "R2", category: "SC", status: "fresh", candidateCategory: "SC", prev: { ...SGPGI, remark: "not_reported" } };
const her: Profile = { rank: 31214, category: "SC", pwd: false, specialties: [], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };
const w: ResultWords = { rankWord: "AIR", by: "MCC", round: "R2", roundName: (r) => roundName[r], provisional: true, quota: (q) => q };

describe("Your Round 2 result (lib/your-result.ts)", () => {
  it("found: the seat, her Round 1 seat with its remark, nothing flagged", () => {
    const x = yourResult(her, [r1, r2], w);
    expect(x.kind).toBe("found");
    expect(x.head).toBe("MCC's provisional Round 2 result lists AIR 31,214 (SC): MS Obstetrics and Gynaecology, Gajra Raja Medical College, Gwalior · All India · SC seat · Fresh allotment");
    expect(x.before).toBe("Round 1: MD Anaesthesiology, SGPGI Lucknow — not reported");
    expect([x.flag, x.held]).toEqual([null, null]);
    expect(x.row).toBe(r2);
    // the final result: not "provisional"; an upgrade says so
    expect(yourResult(her, [r1, { ...r2, status: "upgraded" }], { ...w, provisional: false }).head).toMatch(/^MCC's Round 2 result lists .* · Upgraded$/);
  });

  it("a candidate category not hers: 'If AIR … is yours', flagged; PwD and General read as MCC prints them", () => {
    const x = yourResult({ ...her, category: "OBC" }, [r1, r2], w);
    expect(x.head).toMatch(/^If AIR 31,214 is yours: MCC's provisional/);
    expect(x.flag).toBe("MCC lists AIR 31,214's candidate as SC; your profile says OBC. Check the rank and category in your profile.");
    const pwd = { ...r2, candidateCategory: "SC PwD" };
    expect(yourResult({ ...her, pwd: true }, [pwd], w).flag).toBeNull();
    expect(yourResult(her, [pwd], w).flag).toMatch(/as SC PwD; your profile says SC\./);
    expect(yourResult({ ...her, category: "Open" }, [{ ...r2, candidateCategory: "General" }], w).flag).toBeNull();
    // an Armed Forces (AFMS) row: its rank is the AIR, read as any other
    expect(yourResult(her, [{ ...r2, quota: "Armed Forces Medical" }], w).head).toContain("· Armed Forces Medical · SC seat");
    // no candidate category printed: nothing to compare
    expect(yourResult({ ...her, category: "EWS" }, [{ ...r2, candidateCategory: null }], w).flag).toBeNull();
  });

  it("kept: not in Round 2's new allotments but in Round 1; none: in neither", () => {
    const k = yourResult(her, [r1], w);
    expect(k.kind).toBe("kept");
    expect(k.head).toBe("Not among Round 2's new allotments: you kept your Round 1 seat, weren't allotted, or didn't opt to upgrade — MCC's PDF says which.");
    expect(k.before).toBe("Your Round 1 seat: MD Anaesthesiology, SGPGI Lucknow · All India · SC seat");
    expect(yourResult({ ...her, category: "ST" }, [r1], w).head).toMatch(/^If AIR 31,214 is yours: not among/);
    const n = yourResult({ ...her, rank: 31215 }, [], w);
    expect(n.kind).toBe("none");
    expect(n.head).toBe("AIR 31,215 isn't in MCC's Round 2 list of new allotments, or in an earlier round's result this year.");
  });

  it("several rows for one rank: none picked", () => {
    const x = yourResult(her, [r2, { ...r2, quota: "DNB Quota" }], w);
    expect([x.kind, x.row]).toEqual(["several", null]);
  });

  it("I already hold a seat: upgraded from it, the same seat, or not this rank's", () => {
    const held = (s: typeof SGPGI) => ({ id: `${s.college}~${s.degree}~${s.specialty}~${s.quota}`, round: "R1" as const });
    const up = { ...r2, status: "upgraded" as const, prev: { ...SGPGI, remark: "reported" as const } };
    expect(yourResult({ ...her, held: held(SGPGI) }, [r1, up], { ...w, heldName: "MD Anaesthesiology, SGPGI Lucknow" }).held).toBe("Upgraded from the seat you hold (MD Anaesthesiology, SGPGI Lucknow).");
    expect(yourResult({ ...her, held: held(SGPGI) }, [r1, r2], w).held).toBe("MCC's result marks the seat you hold not reported in Round 1.");
    expect(yourResult({ ...her, held: held(GRMC) }, [r1, r2], w).held).toBe("This is the seat you hold.");
    expect(yourResult({ ...her, held: held({ ...GRMC, quota: "DNB Quota" }) }, [r1, r2], w).held).toMatch(/^The seat you saved as held isn't AIR 31,214's Round 1 seat/);
    expect(yourResult({ ...her, held: held(SGPGI) }, [r1], w).held).toBe("That is the seat you hold: no Round 2 seat replaces it.");
  });

  it("the provisional result's instruction from MCC's round status note", () => {
    const note = "hold of 17 Nov (Notice No. 10) lifted for every college except Sri Venkateshwaraa, Puducherry, whose 161 PG seats are not in Round 2 (Notice No. 11, 20 Nov); provisional result 20 Nov: discrepancies to MCC until 6 PM on 20 Nov, approach the college only after the final result (Notice No. 12)";
    expect(provisionalNote(note)).toBe("Provisional result 20 Nov: discrepancies to MCC until 6 PM on 20 Nov, approach the college only after the final result (Notice No. 12)");
    expect(provisionalNote("closed per schedule")).toBeNull();
    expect(provisionalNote(null)).toBeNull();
  });
});
