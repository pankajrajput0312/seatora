import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LATEST_YEAR, latestRound, latestText, PAST_YEARS, pastOf, reachLabel, reachWindow, resultsSpan, seatsBelowNotes } from "@/features/decide/lib/reach";
import { CHOICES_KEY, COMPARE_KEY } from "@/features/decide/lib/choices";
import { PROFILE_KEY, profileQuotas } from "@/features/decide/profile";
import { baseCategories, openQuotas, openQuotasNote, quotaScopeNote, rounds, type Source } from "@/features/decide/types";
import { completeYear, examShows, headYearOf, neetPg, quotaIn, roundIn, roundNamesOf, tidyLabel } from "./exam";
import { DEFAULT_EXAM, examFor, examKeys, exams, examYears, groupOf, groupsOf, headYearIn, isExam, latestOf, markerKey, pageNeeds, restrictedQuota, roundNameIn, scopedKey, rankListIn, rankListParam, showsPage, yearName } from "./registry";
import { authorityOf, inExamWords, rankListOf, seatCategoriesFor, sessionOf } from "./keys";
import { instituteGroupOf } from "./exam";
import { kindName, roundShort, seatCategoryName } from "@/features/decide/types";
import { normalizeProgramme, yearsInWords } from "@/features/decide/server/terms";
import { lowestRisk } from "@/features/decide/lib/term-filters";
import { yearsOf } from "@/features/decide/server/catalog";

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
    // "Reached" never counts a stray round: its label stops at the round before (main).
    expect(l).toEqual({ year: 2025, round: "special_stray", main: "R2", provisional: false, pastYears: [2023, 2024], exam: "neet-ss" });
    expect(reachLabel("reached-latest", l, pastOf(l))).toBe("Reached in 2025 R1 to R2");
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
    expect(examFor("ini-cet", true)).toBe("ini-cet");
    expect(examFor("INI-CET", true)).toBe("neet-pg");
    expect(examFor("NEET-SS", true)).toBe("neet-pg");
    expect(examFor("__proto__", true)).toBe("neet-pg");
    expect(examFor(undefined, true)).toBe("neet-pg");
    expect(isExam("constructor")).toBe(false);
  });
});

describe("nav and page gating (pageNeeds)", () => {
  const lacking = ["/decide/residents", "/decide/rank-tools", "/decide/fees"];
  // Schedule too: every exam has one (its round status once its data has it, else where its counselling body publishes it).
  const shown = ["/decide", "/decide/options", "/decide/seats", "/decide/choices", "/decide/compare", "/decide/counselling", "/decide/institutes", "/decide/last-ranks", "/decide/allotments", "/decide/rank-scan", "/decide/rank-journey"];
  it("NEET PG shows every page; NEET SS and MDS hide those without data and show the rest, Seats and Schedule included", () => {
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
    expect([quotaIn(mds, "Deemed/Paid Seats"), quotaIn(mds, "All India")]).toEqual(["Self-Financed Merit Seat", "All India"]);
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

describe("INI-CET: two sessions a year, a year is a session code", () => {
  const E = exams["ini-cet"];
  it("owner-only like SS and MDS: AIIMS's results, its words and scope", () => {
    expect(E).toMatchObject({ label: "INI-CET", rankWord: "Rank", rankName: "INI-CET rank", categories: baseCategories, pwd: true, perGroup: false });
    expect(E.scopeNote).toBe("Seatora covers INI-CET counselling by AIIMS New Delhi (AIIMS, JIPMER, PGIMER, NIMHANS, SCTIMST seats).");
    expect(E.quotasNote).toContain(E.scopeNote);
    expect(E.has.allotments && E.has.seats && E.has.notices && !E.has.residents && !E.has.scoreRank && !E.has.merit && !E.has.beds).toBe(true);
    // its bundle (19 Nov 2026): January 2023 to July 2026, each session's 1st, 2nd and Open Round
    expect([E.latestYear, E.pastYears, E.rounds]).toEqual([20267, [20257, 20261], ["R1", "R2", "R3"]]);
    for (const h of ["/decide/residents", "/decide/rank-tools"]) expect(showsPage("ini-cet", h)).toBe(false);
    expect(showsPage("ini-cet", "/decide/counselling")).toBe(true); // its notices and round status (the Schedule)
    expect([E.site?.name, E.roundWords?.R3]).toEqual(["AIIMS exams site", "Open Round"]);
    expect(restrictedQuota("ini-cet", "Sponsored")).toBe(true);
    expect(E.quotas.every((q) => !restrictedQuota("ini-cet", q))).toBe(true);
  });
  it("yearName: a session's name; every other exam's year exactly as before", () => {
    expect([yearName("ini-cet", 20261), yearName("ini-cet", 20267), yearName("ini-cet", 20261, true), yearName("ini-cet", 20267, true)]).toEqual(["Jan 2026", "Jul 2026", "January 2026 session", "July 2026 session"]);
    for (const k of ["neet-pg", "neet-ss", "neet-mds"] as const) for (const y of [2019, 2025, 2026, 20261]) expect(yearName(k, y)).toBe(String(y));
    expect(yearName("ini-cet", 2026)).toBe("2026"); // not a session code
    expect([sessionOf(20267), sessionOf(2026), sessionOf(20260)]).toEqual([[2026, 7], null, null]);
  });
  it("its years are session codes in time order (examYears), never a year ± 1", () => {
    const ys = examYears("ini-cet");
    expect(ys.every((y) => sessionOf(y))).toBe(true);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(new Set(ys.map((y) => y % 10))).toEqual(new Set([1, 7]));
  });
  it("labels, windows, year lists and spans name sessions; round names from the source (AIIMS's Open Round)", () => {
    const [p0, p1] = E.pastYears;
    const y = E.latestYear;
    const ini = [src(p0, "R1"), src(p0, "R3", "INI-CET Open Round seat allocation"), src(p1, "R1"), src(p1, "R2"), src(y, "R1"), src(y, "R2")];
    const l = latestOf(ini, "ini-cet");
    expect(l).toMatchObject({ year: y, round: "R2", pastYears: [p0, p1], exam: "ini-cet" });
    const [n0, n1, n] = [p0, p1, y].map((x) => yearName("ini-cet", x));
    expect(latestText(l)).toBe(`${n} R1 to R2`);
    expect(reachLabel("reached-both", l, pastOf(l))).toBe(`Reached in ${n0} and ${n1}`);
    expect(reachLabel("reached-one", l, pastOf(l))).toBe(`Reached in ${n0} or ${n1}`);
    expect(reachWindow(l, pastOf(l))).toBe(`${n0}, ${n1} and ${n} R1 to R2`);
    expect(seatsBelowNotes([{ kind: "clear", on: [{ category: "Open", reach: "closed-before", at: { year: p1, round: "R1", closing: 90, stray: { year: p0, closing: 120 } } }] }], l, pastOf(l))[0]).toContain(`90 in ${n1} R1, before your rank. Stray: 120 in ${n0}.`);
    const years = yearsOf(ini, "ini-cet");
    expect(years.map((x) => x.label)).toEqual([`${n} (R1, R2)`, n1, n0]);
    expect(resultsSpan(years, "ini-cet")).toBe(`${n0} to ${n} R2`);
    expect(roundNameIn("ini-cet", ini, p0, "R3")).toBe("Open Round");
    expect(roundNameIn("ini-cet", [src(p0, "stray", "INI-CET Open Round 2 seat allocation")], p0, "stray")).toBe("Open Round 2");
    // NEET PG's: its years, labels and round names as ever
    expect(yearsOf([src(2025, "R1"), src(2026, "R1", "", true)]).map((x) => x.label)).toEqual(["2026 (R1, provisional)", "2025"]);
    expect(resultsSpan([{ year: 2026, rounds: ["R1"] }, { year: 2024, rounds: ["R1"] }])).toBe("2024 to 2026 R1");
  });
});

describe("INI-CET's MDS rank list (keys.ts separateRankList)", () => {
  it("MDS is a list of its own on INI-CET only", () => {
    expect([rankListOf("ini-cet", "MDS"), rankListOf("ini-cet", "MD"), rankListOf("ini-cet", "DM"), rankListOf("neet-mds", "MDS"), rankListOf("neet-pg", "MD")]).toEqual(["MDS", "", "", "", ""]);
  });
  it("her list: asked, else her courses' when all are MDS, else the main one; none for other exams", () => {
    expect([rankListIn("ini-cet", "mds", []), rankListIn("ini-cet", "main", ["MDS"]), rankListIn("ini-cet", null, ["MDS"]), rankListIn("ini-cet", null, ["MDS", "MD"]), rankListIn("ini-cet", null, [])]).toEqual(["MDS", "", "MDS", "", ""]);
    expect([rankListIn("neet-pg", "mds", ["MDS"]), rankListIn("neet-mds", null, ["MDS"])]).toEqual([null, null]);
  });
});

describe("the counselling body's words (keys.ts authorityOf, inExamWords)", () => {
  it("INI-CET: AIIMS and its prospectus; NEET PG, SS and MDS text exactly as written", () => {
    const s = "Fee in the MCC profile's own words; MCC's result PDFs; the college's MCC institute profile; MCC institute profile, read";
    expect(inExamWords("ini-cet", s)).toBe("Fee in the INI-CET prospectus's own words; AIIMS's result PDFs; the INI-CET prospectus; INI-CET prospectus, read");
    for (const k of ["neet-pg", "neet-ss", "neet-mds"] as const) expect([inExamWords(k, s), authorityOf(k)]).toEqual([s, "MCC"]);
    expect(authorityOf("ini-cet")).toBe("AIIMS");
  });
});

describe("INI-CET's words for seat lists, rounds, seats and institutes (tester fixes)", () => {
  it("one seat position a session, R3 the Open Round, JIPMER's totals; NEET PG's words as ever", () => {
    expect([kindName("clear", "ini-cet"), kindName("clear", "neet-pg"), kindName("virtual", "neet-mds")]).toEqual(["Seat position", "Clear vacancy", "Virtual vacancy"]);
    expect([roundShort("R3", "ini-cet"), roundShort("R3", "neet-pg"), roundShort("stray", "ini-cet")]).toEqual(["Open Round", "R3", "Stray"]);
    expect([seatCategoriesFor("ini-cet", ["Open", "OBC"]), seatCategoriesFor("neet-pg", ["Open", "OBC"])]).toEqual([["Open", "OBC", "All"], ["Open", "OBC"]]);
    expect([seatCategoryName("All"), seatCategoryName("OBC PwD")]).toEqual(["Categories not split", "OBC PwD"]);
  });
  it("MDS's own list on links; institute groups by key", () => {
    expect([rankListParam("ini-cet", "MDS"), rankListParam("ini-cet", "MS"), rankListParam("neet-pg", "MDS")]).toEqual(["mds", "main", undefined]);
    const E = exams["ini-cet"];
    expect(["AIIMSNEWDELHI#110029", "AIIMSBHOPAL#462020", "AIIMSRISHIKESH#249203", "AIIMSNAGPUR#441124", "JIPMERPUDUCHERRY#605006", "PGIMERCHANDIGARH#160012", "NIMHANSBENGALURU#560029", "SCTIMSTTRIVANDRUM#695011", "X"].map((k) => instituteGroupOf(E, k))).toEqual(["AIIMS New Delhi", "AIIMS (2012)", "AIIMS (2012)", "New AIIMS", "JIPMER", "PGIMER", "NIMHANS", "SCTIMST", null]);
    expect(instituteGroupOf(exams["neet-pg"], "AIIMSNEWDELHI#110029")).toBeNull();
  });
  it("a contract's years in words; the lowest leaving penalty where no bond penalty exists (INI-CET only)", () => {
    expect([yearsInWords("Each Junior Resident will be on contract service for a period of three years."), yearsInWords("2 years"), yearsInWords("no figure")]).toEqual([[3], [2], null]);
    const t = (leave: number | null) => ({ ...normalizeProgramme("MD/MS", []), bond: { ...normalizeProgramme("MD/MS", []).bond, leavingAmount: { ...normalizeProgramme("MD/MS", []).bond.leavingAmount, state: leave == null ? "none" : "figure", max: leave, min: leave } } }) as never;
    expect(lowestRisk([{ name: "A", t: t(300000) }, { name: "B", t: t(500000) }], true)).toMatch(/^Lowest leaving penalty here: A/);
    expect(lowestRisk([{ name: "A", t: t(300000) }, { name: "B", t: t(500000) }])).toMatch(/^Can't tell/);
    // ranges: a tie said as one, overlapping ones as can't tell
    const r = (lo: number, hi: number) => { const x = t(hi) as unknown as { bond: { leavingAmount: { min: number } } }; x.bond.leavingAmount.min = lo; return x as never; };
    expect(lowestRisk([{ name: "A", t: r(300000, 500000) }, { name: "B", t: r(300000, 500000) }], true)).toMatch(/^Leaving penalty: all the same \(₹3/);
    expect(lowestRisk([{ name: "A", t: r(200000, 600000) }, { name: "B", t: r(300000, 500000) }], true)).toMatch(/^Can't tell: their leaving penalties overlap/);
    // the same range in other steps (JIPMER's from depositing the originals): not "all the same", the extra step named
    const steps = (ws: [number, string][]) => { const x = r(300000, 500000) as unknown as { bond: { leaving: unknown[] } }; x.bond.leaving = ws.map(([inr, text]) => ({ inr, text })); return x as never; };
    const aiims = steps([[300000, "MD/MS (6 yr), leaving within six months of joining"], [500000, "MD/MS (6 yr), leaving after six months of joining"]]);
    const jipmer = steps([[300000, "all, from deposit of original certificates to joining"], [300000, "all, within six months of joining, plus that month's salary"], [500000, "all, after six months of joining, plus that month's salary"]]);
    expect(lowestRisk([{ name: "A", t: aiims }, { name: "B", t: aiims }], true)).toMatch(/^Leaving penalty: all the same \(₹3 L within six months of joining, ₹5 L after six months of joining\)/);
    expect(lowestRisk([{ name: "A", t: aiims }, { name: "J", t: jipmer }], true)).toBe("Leaving penalty: ₹3 L–₹5 L at each, not in the same steps (J also has ₹3 L from deposit of original certificates to joining); none of these publishes a bond penalty figure.");
    expect(lowestRisk([{ name: "A", t: r(200000, 400000) }, { name: "B", t: r(300000, 500000) }], true)).toMatch(/^Lowest leaving penalty here: A/);
  });
});

describe("JIPMER's course total in a seat note (category All)", () => {
  it("its own sentence, never 'All seats'", () => {
    const l = latestOf([src(20267, "R1"), src(20267, "R3")], "ini-cet");
    const [only] = seatsBelowNotes([{ kind: "clear", on: [{ category: "All", reach: "no-data" }] }], l, pastOf(l));
    expect(only).toMatch(/course total AIIMS doesn't split by category/);
    expect(only).not.toMatch(/All seats/);
    const [mixed] = seatsBelowNotes([{ kind: "clear", on: [{ category: "Open", reach: "closed-before", at: { year: 20267, round: "R1", closing: 90 } }, { category: "All", reach: "no-data" }] }], l, pastOf(l));
    expect(mixed).toMatch(/Open seats only, besides a course total not split by category/);
  });
});
