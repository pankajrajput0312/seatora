import { describe, expect, it } from "vitest";
import { riskLines, type RiskInput } from "./held-risk";
import raw from "./ini-cet-crossover.json";

const pg: RiskInput = { exam: "neet-pg", round: "R1", quota: "All India", category: "EWS", pwd: false, deemed: false, college: "Grant Government Medical College, Mumbai", pending: ["R2", "R3", "stray"] };
const keys = (i: Partial<RiskInput>) => riskLines({ ...pg, ...i }).lines.map((l) => l.key);
const line = (i: Partial<RiskInput>, key: string) => riskLines({ ...pg, ...i }).lines.find((l) => l.key === key);
const ids = (i: Partial<RiskInput>, key: string) => line(i, key)?.rules.map((r) => r.id);

describe("What you risk (held-risk.ts riskLines): only the documents' rules, by exam, round, quota, category and deemed", () => {
  it("NEET PG, a Round 1 seat while Round 2's result is held: the Round 2 upgrade first, then Round 3's no-resign and join rules", () => {
    expect(keys({}).slice(0, 4)).toEqual(["r2-upgrade", "r3-no-resign", "r3-join", "deposit"]);
    expect(ids({}, "r2-upgrade")).toEqual(["mcc_r2_upgrade_loses_r1"]);
    expect(ids({}, "r3-no-resign")).toEqual(["mcc_r3_no_resign", "mcc_r3_no_resign_annexure"]);
    expect(line({}, "r2-hold")?.asOf).toBe(true);
    // Round 3 cancelling her seat at once is not in the extracted rules: said so, never claimed.
    expect(line({}, "r3-cancel")?.gap).toBeDefined();
    expect(line({}, "r3-cancel")?.text).toMatch(/^Whether .*not stated/);
  });
  it("Round 2's result out: no Round 2 upgrade or hold lines", () => {
    expect(keys({ pending: ["R3", "stray"] })).not.toContain("r2-upgrade");
    expect(keys({ pending: ["R3", "stray"] })).not.toContain("r2-hold");
  });
  it("a Round 2 seat: Round 3's rules and the exit-with-forfeiture rule, never Round 1's", () => {
    const k = keys({ round: "R2" });
    expect(k).toEqual(expect.arrayContaining(["r3-no-resign", "r3-join", "r3-eligible", "r2-exit", "resign"]));
    expect(k).not.toContain("r2-upgrade");
    expect(k).not.toContain("r1-window");
    expect(line({ round: "R2" }, "r3-eligible")?.text).toContain("Round 2 seat");
  });
  it("a Round 3 seat: no resigning, no later round; leaving after the windows not stated", () => {
    const k = keys({ round: "R3" });
    expect(k[0]).toBe("r3-held");
    expect(k).not.toContain("r3-join");
    expect(k).not.toContain("resign");
    expect(line({ round: "R3" }, "leave-late")?.gap?.note).toMatch(/^Not stated/);
  });
  it("a stray seat: resigning it is not stated; the stray round's eligibility no longer applies", () => {
    const k = keys({ round: "stray" });
    expect(k).toContain("stray-resign");
    expect(k).not.toContain("stray");
    expect(line({ round: "stray" }, "stray-resign")?.gap?.checked.length).toBeGreaterThan(0);
  });
  it("the deposit by category, PwD and a deemed seat, from the rule's own figures", () => {
    expect(line({}, "deposit")?.text).toContain("Rs 25,000 for AIQ (UR/EWS)");
    expect(line({ category: "OBC" }, "deposit")?.text).toContain("Rs 10,000 for AIQ (reserved categories)");
    expect(line({ deemed: true, quota: "Deemed/Paid Seats" }, "deposit")?.text).toContain("Rs 2,00,000: you registered for Deemed Universities");
    // UR/EWS PwD: the rule doesn't say which applies, so its own words, every figure.
    expect(line({ pwd: true }, "deposit")?.text).toMatch(/Rs 25,000 \(AIQ, UR\/EWS\), Rs 10,000 \(AIQ, reserved\)/);
  });
  it("an Armed Forces Medical seat adds AFMS's own debarment", () => {
    expect(keys({ quota: "Armed Forces Medical" })).toContain("afms");
    expect(keys({})).not.toContain("afms");
  });
  it("INI-CET: AIIMS's round rules and her institute's Part B penalty; never MCC's", () => {
    const ini = { exam: "ini-cet" as const, college: "All India Institute of Medical Sciences, New Delhi" };
    const all = riskLines({ ...pg, ...ini }).lines.flatMap((l) => l.rules.map((r) => r.body));
    expect(new Set(all)).toEqual(new Set(["AIIMS"]));
    expect(ids(ini, "leaving")).toEqual(["aiims_leaving_penalty"]);
    expect(ids({ ...ini, college: "AIIMS Jodhpur" }, "leaving")).toEqual(["aiims_jodhpur_penalty"]);
    expect(ids({ ...ini, college: "JIPMER, Puducherry" }, "leaving")).toEqual(["jipmer_leaving_penalty"]);
    expect(ids({ ...ini, college: "JIPMER, Puducherry" }, "open-round")).toEqual(["aiims_open_round_deemed_resignation", "jipmer_open_round_penalty"]);
    expect(ids({ ...ini, college: "Post Graduate Institute of Medical Education and Research, Chandigarh" }, "leaving")).toEqual(["pgimer_leaving_penalty"]);
    // Joined in the Open Round (R3): no open-round lines.
    expect(keys({ ...ini, round: "R3" })).not.toContain("open-round");
  });
  it("NEET SS and MDS: not covered yet (no lines, never MCC's NEET PG rules)", () => {
    expect(riskLines({ ...pg, exam: "neet-ss" })).toEqual({ covered: false, lines: [] });
    expect(riskLines({ ...pg, exam: "neet-mds" })).toEqual({ covered: false, lines: [] });
  });
  it("every line rests on rules the file has (each with its quote and page) or says what is not stated", () => {
    const inFile = new Set(raw.rules.map((r) => r.id));
    for (const round of ["R1", "R2", "R3", "stray"] as const)
      for (const exam of ["neet-pg", "ini-cet"] as const)
        for (const l of riskLines({ ...pg, exam, round }).lines) {
          expect(l.rules.length > 0 || !!l.gap, l.key).toBe(true);
          for (const r of l.rules) expect([inFile.has(r.id), r.quote.length > 0, r.page > 0], `${exam} ${round} ${l.key} ${r.id}`).toEqual([true, true, true]);
        }
  });
});
