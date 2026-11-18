import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LATEST_YEAR, PAST_YEARS } from "@/features/decide/lib/reach";
import { baseCategories, openQuotas, rounds } from "@/features/decide/types";
import { DEFAULT_EXAM, examFor, examKeys, exams, isExam, markerKey, pageNeeds, showsPage } from "./registry";

describe("exam registry", () => {
  it("neet-pg is today's constants, with every dataset", () => {
    expect(DEFAULT_EXAM).toBe("neet-pg");
    expect(exams["neet-pg"]).toMatchObject({ label: "NEET PG", latestYear: LATEST_YEAR, pastYears: PAST_YEARS, rounds, categories: baseCategories, quotas: openQuotas });
    expect(Object.values(exams["neet-pg"].has).every(Boolean)).toBe(true);
    expect(Object.keys(exams)).toEqual([...examKeys]);
  });

  it("NEET SS and MDS have results (cutoffs, allotments) and nothing else yet", () => {
    for (const k of ["neet-ss", "neet-mds"] as const) {
      const { allotments, ...rest } = exams[k].has;
      expect([allotments, Object.values(rest).some(Boolean)]).toEqual([true, false]);
    }
  });

  it("NEET PG keeps its import marker; another exam has its own", () => {
    expect(markerKey("neet-pg")).toBe("import/mcc");
    expect(markerKey("neet-ss")).toBe("import/neet-ss");
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
  it("NEET PG shows every page; NEET SS hides those without data", () => {
    for (const href of [...Object.keys(pageNeeds), "/decide", "/decide/options", "/decide/institutes"]) expect(showsPage("neet-pg", href)).toBe(true);
    expect(["/decide/residents", "/decide/seats", "/decide/counselling", "/decide/rank-tools", "/decide/fees"].map((h) => showsPage("neet-ss", h))).toEqual([false, false, false, false, false]);
    expect(["/decide", "/decide/options", "/decide/last-ranks", "/decide/allotments", "/decide/rank-scan"].every((h) => showsPage("neet-ss", h))).toBe(true);
  });

  it("every gated page exists and says so for an exam without its data (examGate)", () => {
    for (const href of Object.keys(pageNeeds)) {
      const file = `src/app${href}/page.tsx`;
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file, "utf8"), file).toContain(`examGate("${href}")`);
    }
  });
});
