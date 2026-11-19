import { describe, expect, it } from "vitest";
import { crossover } from "./crossover";
import raw from "./ini-cet-crossover.json";

describe("INI-CET's 'Also in NEET PG counselling?' guide (crossover.ts)", () => {
  it("every rule is in one stage, MCC's first, each with its document", () => {
    const ids = [...crossover.stages.flatMap((s) => s.rules.map((r) => r.id)), ...crossover.over.map((r) => r.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(raw.rules.map((r) => r.id).sort());
    expect(crossover.stages[0].rules.every((r) => r.body === "MCC")).toBe(true);
    for (const s of crossover.stages) for (const r of s.rules) expect(crossover.sources[r.doc], r.id).toBeDefined();
  });
  it("words without rule ids; July 2026 and as-of rules marked; disagreements and gaps kept", () => {
    expect(crossover.words("Deposit forfeiture starts only from Round 2 (mcc_deposit_forfeit_r2_onwards).")).toBe("Deposit forfeiture starts only from Round 2.");
    const r = (id: string) => crossover.stages.flatMap((s) => s.rules).find((x) => x.id === id)!;
    expect([crossover.fromJuly2026(r("aiims_no_refusal_r1")), crossover.fromJuly2026(r("aiims_pursuing_pg_excluded")), crossover.timeBound(r("mcc_r2_on_hold"))]).toEqual([true, false, true]);
    expect(crossover.contradictions.length).toBeGreaterThan(0);
    expect(crossover.notFound.length).toBe(raw.not_found.length);
  });
  it("a bottom line of linked rules; Round 1's over rules last; her own deposit; no words beyond the document", () => {
    expect(crossover.bottomLine.length).toBe(4);
    expect(crossover.bottomLine[0].refs.map(([id]) => id)).toEqual(["aiims_pursuing_pg_excluded", "aiims_pursuing_definition"]);
    expect(crossover.bottomLine.map((l) => l.july2026)).toEqual([false, true, false, false]);
    expect(crossover.over.map((r) => r.id)).toEqual(["mcc_r1_free_exit", "mcc_r1_free_exit_faq", "mcc_r1_resign_window_2026"]);
    expect(crossover.timeBound(crossover.over[2])).toBe(false);
    expect([crossover.depositOf("OBC", false), crossover.depositOf("Open", false), crossover.depositOf("EWS", true)]).toEqual([
      { aiq: "10,000", deemed: "2,00,000", reserved: true },
      { aiq: "25,000", deemed: "2,00,000", reserved: false },
      null,
    ]);
    const afms = crossover.stages.flatMap((s) => s.rules).find((r) => r.id === "mcc_afms_debarment")!;
    expect(afms.rule).not.toMatch(/NEET PG/);
    expect(afms.rule).toMatch(/three years\.$/);
  });
});
