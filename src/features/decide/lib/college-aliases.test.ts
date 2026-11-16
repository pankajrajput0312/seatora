import { describe, expect, it } from "vitest";
import { iniCetIn, searchAlternatives, searchMatcher } from "./college-aliases";

const kem = "Seth Gordhandas Sunderdas Medical College Maharashtra Mumbai, Acharya Donde Marg Parel MUMBAI, 400012 MD Radio-Diagnosis";

describe("college search", () => {
  it("knows short names: KEM is Seth GS Medical College", () => {
    expect(searchMatcher("KEM")!(kem)).toBe(true);
    expect(searchMatcher("kem radio")!(kem)).toBe(true);
    expect(searchMatcher("kem ortho")!(kem)).toBe(false);
  });
  it("keeps each word as typed too (a name with those letters still matches)", () => {
    expect(searchAlternatives("kem")).toEqual([["kem"], ["gordhandas", "sunderdas"]]);
    expect(searchMatcher("kem")!("Kemisha Rao")).toBe(true);
  });
  it("finds a college by its city in the address", () => expect(searchMatcher("Mumbai")!(kem)).toBe(true));
  it("needs every word, in any order and case", () => {
    expect(searchMatcher("radio seth")!(kem)).toBe(true);
    expect(searchMatcher("radio delhi")!(kem)).toBe(false);
  });
  it("an ambiguous short name stands for each college", () => {
    const mmc = searchMatcher("MMC")!;
    expect(mmc("MADRAS MEDICAL COLLEGE")).toBe(true);
    expect(mmc("MYSORE MEDICAL COLLEGE AND RESEARCH INSTITUTE")).toBe(true);
  });
  it("is null without a search", () => {
    expect(searchMatcher("")).toBeNull();
    expect(searchMatcher("  ")).toBeNull();
  });
  it("names an INI-CET institute (not in MCC's lists)", () => {
    expect(iniCetIn("AIIMS Delhi")).toBe("AIIMS");
    expect(iniCetIn("maulana")).toBeNull();
  });
});
