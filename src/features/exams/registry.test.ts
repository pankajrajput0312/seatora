import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LATEST_YEAR, latestRound, latestText, PAST_YEARS, pastOf, reachLabel, reachWindow } from "@/features/decide/lib/reach";
import { CHOICES_KEY, COMPARE_KEY } from "@/features/decide/lib/choices";
import { PROFILE_KEY, profileQuotas } from "@/features/decide/profile";
import { baseCategories, openQuotas, openQuotasNote, quotaScopeNote, rounds, type Source } from "@/features/decide/types";
import { completeYear, examShows, headYearOf, neetPg, quotaIn, roundIn, roundNamesOf, tidyLabel } from "./exam";
import { DEFAULT_EXAM, examFor, examKeys, exams, examYears, groupOf, groupsOf, headYearIn, isExam, latestOf, markerKey, pageNeeds, restrictedQuota, roundNameIn, scopedKey, showsPage } from "./registry";

const src = (year: number, round: Source["round"], name = "", provisional = false): Source => ({ key: `${year}/${round}`, url: null, year, round, provisional, name });

describe("exam registry", () => {
  it("neet-pg is today's constants, with every dataset", () => {
    expect(DEFAULT_EXAM).toBe("neet-pg");
    expect(exams["neet-pg"]).toMatchObject({ label: "NEET PG", latestYear: LATEST_YEAR, pastYears: PAST_YEARS, rounds, categories: baseCategories, quotas: openQuotas, quotasNote: openQuotasNote, scopeNote: quotaScopeNote, rankWord: "AIR", rankName: "All India Rank", pwd: true });
    expect(Object.values(exams["neet-pg"].has).every(Boolean)).toBe(true);
    expect(Object.keys(exams)).toEqual([...examKeys]);
    expect(examYears("neet-pg")).toEqual([2024, 2025, 2026]);
  });

  it("NEET SS and MDS: results and MCC's seat lists (fees once their data has them: active.tsx examInfo); NEET SS shows its hospitals' beds", () => {
    for (const k of ["neet-ss", "neet-mds"] as const) {
      const { allotments, seats, beds, ...rest } = exams[k].has;
      expect([allotments, seats, beds, Object.values(rest).some(Boolean)]).toEqual([true, true, k === "neet-ss", false]);
    }
  });

  it("years, rounds, categories and quotas from the bundles", () => {
    expect(examYears("neet-mds")).toEqual([2024, 2025, 2026]); // MDS results 2019-2026
    expect(examYears("neet-ss")).toEqual([2023, 2024, 2025]); // SS 2019-2025: SS 2026 not held yet
    expect(exams["neet-ss"]).toMatchObject({ categories: ["Open"], pwd: false, quotas: [], rankWord: "Rank", rounds: ["R1", "R2", "stray", "special_stray"] });
    expect(exams["neet-mds"]).toMatchObject({ categories: baseCategories, pwd: true, quotas: ["All India", "Deemed/Paid Seats"], rankWord: "AIR" });
  });

  it("NEET PG keeps its import marker and storage keys; another exam has its own", () => {
    expect(markerKey("neet-pg")).toBe("import/mcc");
    expect(markerKey("neet-ss")).toBe("import/neet-ss");
    // The browser's keys (profile, choice lists, compare tray, sync meta): NEET PG's exactly as before.
    expect([PROFILE_KEY, CHOICES_KEY, COMPARE_KEY, "profile", "choices"].map((k) => scopedKey(k, "neet-pg"))).toEqual(["medpath.profile", "medpath.choices", "medpath.compare", "profile", "choices"]);
    expect([PROFILE_KEY, CHOICES_KEY, COMPARE_KEY].map((k) => scopedKey(k, "neet-mds"))).toEqual(["medpath.profile.neet-mds", "medpath.choices.neet-mds", "medpath.compare.neet-mds"]);
    expect(scopedKey("decide:filters:/decide/options", "neet-ss")).toBe("decide:filters:/decide/options.neet-ss");
  });
});

describe("per-exam years and labels", () => {
  const ss = [src(2023, "R1"), src(2023, "stray", "MCC NEET SS 2023 Mop-Up Round allotment result (final)"), src(2024, "R1"), src(2025, "R1"), src(2025, "R2"), src(2025, "special_stray", "MCC NEET SS 2025 Special Stray Vacancy Round allotment result (final)"), src(2026, "R1")];
  it("NEET PG's latest round is exactly latestRound's (no past years carried)", () => {
    const pg = [src(2025, "R3"), src(2026, "R1", "", true)];
    expect(latestOf(pg, "neet-pg")).toEqual(latestRound(pg));
    expect(latestOf(pg, "neet-pg")).toEqual({ year: 2026, round: "R1", provisional: true });
    expect(pastOf(latestOf(pg, "neet-pg"))).toBe(PAST_YEARS);
  });
  it("NEET SS: its own latest year (2025), its past years in every label", () => {
    const l = latestOf(ss, "neet-ss");
    expect(l).toEqual({ year: 2025, round: "special_stray", provisional: false, pastYears: [2023, 2024] });
    expect(reachLabel("reached-latest", l, pastOf(l))).toBe("Reached in 2025 R1 to Special stray");
    expect(reachLabel("reached-both", l, pastOf(l))).toBe("Reached in 2023 and 2024");
    expect(reachWindow(l, pastOf(l))).toBe("2023, 2024 and 2025 R1 to Special stray");
  });
  it("NEET MDS: 2026 R3", () => {
    const l = latestOf([src(2025, "stray"), src(2026, "R1"), src(2026, "R2"), src(2026, "R3")], "neet-mds");
    expect(latestText(l)).toBe("2026 R1 to R3");
    expect(reachLabel("reached-one", l, pastOf(l))).toBe("Reached in 2024 or 2025");
  });
  it("round names as that year's MCC result calls them; NEET PG's as before", () => {
    expect(roundNameIn("neet-ss", ss, 2023, "stray")).toBe("Mop-up");
    expect(roundNameIn("neet-ss", ss, 2025, "special_stray")).toBe("Special stray");
    expect(roundNameIn("neet-ss", [src(2021, "special_stray", "MCC NEET SS 2021 Special Mop-Up Round allotment result (final)")], 2021, "special_stray")).toBe("Special mop-up");
    expect(roundNameIn("neet-mds", [src(2019, "R3", "MCC MDS 2019 Round 3 (Mop-up Round) allotment result (final)")], 2019, "R3")).toBe("R3 (Mop-up)");
    expect(roundNameIn("neet-mds", [src(2024, "R3", "MCC MDS 2024 Round 3 allotment result (final)")], 2024, "R3")).toBe("R3");
    expect(roundNameIn("neet-pg", [src(2024, "stray", "Mop-up")], 2024, "stray")).toBe("Stray");
  });
});

describe("NEET SS question groups and quotas", () => {
  it("the group rides in the quota label", () => {
    expect(groupOf("All India (Medical Group)")).toBe("Medical Group");
    expect(groupOf("Tamil Nadu All India (Surgical Group)")).toBe("Surgical Group");
    expect(groupOf("All India (Urology(Genito-Urinary Surgery))")).toBe("Urology(Genito-Urinary Surgery)");
    expect(groupOf("All India")).toBeNull();
    expect(groupsOf("neet-ss", ["All India (Medical Group)", "Tamil Nadu All India (Medical Group)"])).toEqual(["Medical Group"]);
    expect(groupsOf("neet-pg", ["All India"])).toEqual([]);
  });
  it("open quotas per exam: NEET PG's as before, NEET SS none (she picks her group)", () => {
    const none = { quotas: [] };
    expect(profileQuotas(none)).toBe(openQuotas);
    expect(profileQuotas(none, exams["neet-mds"].quotas)).toEqual(["All India", "Deemed/Paid Seats"]);
    expect(profileQuotas(none, exams["neet-ss"].quotas)).toEqual([]);
    expect(profileQuotas({ quotas: ["All India (Medical Group)"] }, exams["neet-ss"].quotas)).toEqual(["All India (Medical Group)"]);
    expect([restrictedQuota("neet-pg", "Non-Resident Indian"), restrictedQuota("neet-pg", "DNB Quota"), restrictedQuota("neet-mds", "Muslim Minority"), restrictedQuota("neet-ss", "All India (Medical Group)")]).toEqual([true, false, true, false]);
  });
});

describe("examFor: only staff get an exam other than NEET PG", () => {
  it("never for anyone else, whatever they ask", () => {
    for (const asked of [...examKeys, "x", "", null, undefined]) expect(examFor(asked, false)).toBe("neet-pg");
  });
  it("staff get a known exam, else NEET PG", () => {
    expect(examFor("neet-ss", true)).toBe("neet-ss");
    expect(examFor("neet-mds", true)).toBe("neet-mds");
    expect(examFor("NEET-SS", true)).toBe("neet-pg");
    expect(examFor("__proto__", true)).toBe("neet-pg");
    expect(examFor(undefined, true)).toBe("neet-pg");
    expect(isExam("constructor")).toBe(false);
  });
});

describe("nav and page gating (pageNeeds)", () => {
  const lacking = ["/decide/residents", "/decide/counselling", "/decide/rank-tools", "/decide/fees"];
  const shown = ["/decide", "/decide/options", "/decide/seats", "/decide/choices", "/decide/compare", "/decide/institutes", "/decide/last-ranks", "/decide/allotments", "/decide/rank-scan", "/decide/rank-journey"];
  it("NEET PG shows every page; NEET SS and MDS hide those without data and show the rest, Seats included", () => {
    for (const href of [...Object.keys(pageNeeds), ...shown]) expect(showsPage("neet-pg", href)).toBe(true);
    for (const exam of ["neet-ss", "neet-mds"] as const) {
      expect(lacking.map((h) => showsPage(exam, h))).toEqual(lacking.map(() => false));
      expect(shown.every((h) => showsPage(exam, h))).toBe(true);
    }
  });

  it("every gated page exists and says so for an exam without its data (examGate)", () => {
    for (const href of Object.keys(pageNeeds)) {
      const file = `src/app${href}/page.tsx`;
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file, "utf8"), file).toContain(`examGate("${href}")`);
    }
  });
});

describe("from the data: round names, the complete year, quota words (exams/exam.ts)", () => {
  const ss = [src(2023, "R1"), src(2023, "stray", "MCC NEET SS 2023 Mop-Up Round allotment result (final)"), src(2024, "stray"), src(2025, "R1"), src(2025, "R2"), src(2025, "special_stray", "MCC NEET SS 2025 Special Stray Vacancy Round allotment result (final)")];
  it("every round named otherwise than roundLabel, by year; roundIn falls back to roundLabel (NEET PG: always)", () => {
    const names = roundNamesOf([...ss, src(2021, "special_stray", "MCC NEET SS 2021 Special Mop-Up Round clear vacancy (list as published)")]);
    expect(names).toEqual({ "2023|stray": "Mop-up", "2021|special_stray": "Special mop-up" });
    expect([roundIn({ roundNames: names }, 2023, "stray"), roundIn({ roundNames: names }, 2024, "stray"), roundIn(neetPg, 2023, "stray")]).toEqual(["Mop-up", "Stray", "Stray"]);
  });
  it("the latest complete year: a later year has results, or it has one after Round 2", () => {
    expect(completeYear(ss)).toBe(2025); // SS 2025's special stray
    expect(completeYear([src(2025, "stray"), src(2026, "R1"), src(2026, "R2"), src(2026, "R3")])).toBe(2026); // MDS 2026 R3
    expect(completeYear([src(2025, "R3"), src(2026, "R1"), src(2026, "R2")])).toBe(2025);
    expect(completeYear([])).toBeNull();
    // NEET PG's headline year stays its later past year whatever its data; another exam's from its results
    expect(headYearIn("neet-pg", [src(2026, "R3")])).toBe(PAST_YEARS[1]);
    expect(headYearIn("neet-ss", ss)).toBe(2025);
    expect(headYearIn("neet-ss", [])).toBe(exams["neet-ss"].pastYears[1]);
    expect(headYearOf(neetPg)).toBe(PAST_YEARS[1]);
  });
  it("quota and group words as MCC prints them, display only; NEET PG's as they are", () => {
    const mds = exams["neet-mds"];
    expect([quotaIn(mds, "Deemed/Paid Seats", 2025), quotaIn(mds, "Deemed/Paid Seats", 2026), quotaIn(mds, "Deemed/Paid Seats"), quotaIn(mds, "All India")]).toEqual(["Management/Paid Seats", "Self-Financed Merit Seat", "Self-Financed Merit Seat", "All India"]);
    expect(quotaIn(exams["neet-ss"], "All India (Ent Group)")).toBe("All India (ENT Group)");
    expect(tidyLabel(exams["neet-ss"], "Plastic and Reconstructructive Surgery")).toBe("Plastic and Reconstructive Surgery");
    expect(tidyLabel(neetPg, "Plastic and Reconstructructive Surgery")).toBe("Plastic and Reconstructructive Surgery");
    expect([quotaIn(neetPg, "Deemed/Paid Seats"), quotaIn(neetPg, "All India (Ent Group)")]).toEqual(["Deemed/Paid Seats", "All India (Ent Group)"]);
  });
  it("NEET PG's client object is the registry's", () => {
    expect(exams["neet-pg"]).toBe(neetPg);
    expect(Object.entries(exams).every(([k, e]) => e.key === k)).toBe(true);
    expect(examShows(exams["neet-ss"], "/decide/fees")).toBe(false);
    expect(examShows({ has: { ...exams["neet-ss"].has, fees: true } }, "/decide/fees")).toBe(true);
  });
});
