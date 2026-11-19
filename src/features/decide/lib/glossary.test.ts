import { describe, expect, it } from "vitest";
import { glossary, quotaTerm, roundTerm, termKeys } from "./glossary";

describe("glossary", () => {
  it("every word in one or two plain sentences, for every exam", () => {
    for (const exam of ["neet-pg", "neet-ss", "neet-mds", "ini-cet"] as const) {
      const g = glossary(exam);
      for (const k of termKeys) {
        expect(g[k], `${exam} ${k}`).toBeTruthy();
        expect(g[k].split(/(?<=[.!?])\s+(?=[A-Z])/).length, `${exam} ${k}: ${g[k]}`).toBeLessThanOrEqual(2);
      }
    }
  });
  it("in the exam's words: MCC's rounds and AIQ for NEET PG, AIIMS's for INI-CET", () => {
    expect(glossary("neet-pg").aiq).toMatch(/^All India Quota: the seats MCC fills/);
    expect(glossary("ini-cet").aiq).toMatch(/^INI-CET has no All India Quota/);
    expect(glossary("ini-cet").round).toContain("Open Round");
    expect(glossary("ini-cet").forfeit).toMatch(/^AIIMS's round rules/);
  });
  it("quotas and rounds as shown map to their word", () => {
    expect([quotaTerm("All India"), quotaTerm("Deemed/Paid Seats"), quotaTerm("DNB Quota"), quotaTerm("Delhi University Quota")]).toEqual(["aiq", "deemed", "dnb-quota", null]);
    expect(["R1", "R3", "Stray", "Special stray", "Open Round", "Mop-up"].map(roundTerm)).toEqual(["round", "round", "stray", "special-stray", "open-round", "mop-up"]);
  });
});
