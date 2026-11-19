import { describe, expect, it } from "vitest";
import { crossover } from "./crossover";
import raw from "./ini-cet-crossover.json";

describe("INI-CET's 'Also in NEET PG counselling?' guide (crossover.ts)", () => {
  it("every rule is in one stage, MCC's first, each with its document", () => {
    const ids = crossover.stages.flatMap((s) => s.rules.map((r) => r.id));
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
});
