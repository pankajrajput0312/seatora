import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataUnavailableError } from "./catalog";
import { meritLists, meritPosition, nbemsCategory, rankToScore, scoreToRank } from "./merit";

it("maps MCC seat categories to NBEMS merit-list labels", () => {
  expect(["Open", "OBC", "EWS", "SC", "ST", "Open PwD", "OBC PwD", "EWS PwD"].map(nbemsCategory)).toEqual(["GENERAL", "OBC", "GENERAL-EWS", "SC", "ST", "GENERAL PwBD", "OBC PwBD", "GENERAL-EWS PwBD"]);
  expect(nbemsCategory("GENERAL-EWS PwBD")).toBe("GENERAL-EWS PwBD");
});

describe("without a database", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("throws DataUnavailableError", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(scoreToRank(2025, 600)).rejects.toThrow(DataUnavailableError);
    await expect(meritPosition(2025, "OBC", 42284)).rejects.toThrow(DataUnavailableError);
  });
});

// Real import against the bundle it came from (local DATABASE_URL exported, see seats.test.ts).
const dir = resolve(process.env.MCC_BUNDLE ?? "../neetpg-planner/data/medpath");
type Years<T> = { years: Record<string, T> };
describe.skipIf(!process.env.DATABASE_URL || !existsSync(join(dir, "score_rank.json")))("NBEMS aggregates on the real import", { timeout: 60_000 }, () => {
  const sr: Years<{ max_marks: number; candidates: number; rows: [number, number, number, number][] }> = JSON.parse(readFileSync(join(dir, "score_rank.json"), "utf8"));
  const mp: Years<{ cols: string[]; rows: number[][]; qualified: Record<string, number> }> = JSON.parse(readFileSync(join(dir, "merit_position.json"), "utf8"));
  const row = (r: [number, number, number, number]) => ({ score: r[0], bestRank: r[1], worstRank: r[2], count: r[3] });

  it("lists the years with their totals; only years with a category merit list have categories", async () => {
    const lists = await meritLists();
    expect(lists.map((l) => [l.year, l.maxMarks, l.candidates, l.hasCategories])).toEqual(
      Object.entries(sr.years).map(([y, v]) => [+y, v.max_marks, v.candidates, y in mp.years]).sort((a, b) => +b[0] - +a[0]),
    );
    expect(lists.every((l) => l.url && l.noticeUrl && l.type === "OFFICIAL" && l.coverage)).toBe(true);
  });

  it("score → rank and rank → score match the file, with neighbours around gaps", async () => {
    for (const [y, v] of Object.entries(sr.years)) {
      for (let i = 0; i < v.rows.length; i += 37) {
        const r = row(v.rows[i]);
        expect((await scoreToRank(+y, r.score))!.at).toEqual(r);
        expect((await rankToScore(+y, r.worstRank))!.at).toEqual(r);
      }
    }
    // 2025: nobody scored 706 (707 → rank 1, 705 → ranks 2–3)
    const s = (await scoreToRank(2025, 706))!;
    expect([s.at, s.above?.score, s.below?.score]).toEqual([null, 707, 705]);
    // a rank between two scores' ranks (2025 lists AIQ-eligible candidates only, so ranks have gaps)
    const v = sr.years["2025"].rows;
    const i = v.findIndex((r, j) => j > 0 && r[1] > v[j - 1][2] + 1);
    const gap = (await rankToScore(2025, v[i][1] - 1))!;
    expect([gap.at, gap.above?.score, gap.below?.score]).toEqual([null, v[i - 1][0], v[i][0]]);
    expect(await scoreToRank(1999, 500)).toBeNull();
  });

  it("merit position of AIR 42,284 among OBC candidates in 2025, bracketed by the file's rows", async () => {
    const v = mp.years["2025"];
    const j = v.cols.indexOf("OBC");
    const from = v.rows.filter((r) => r[1] <= 42284).at(-1)!;
    const to = v.rows.find((r) => r[1] > 42284)!;
    const p = (await meritPosition(2025, "OBC", 42284))!;
    expect(p).toMatchObject({ category: "OBC", min: from[j], max: to[j], from: { aiqRank: from[0], maxAir: from[1] }, to: { aiqRank: to[0], maxAir: to[1] }, qualified: v.qualified.OBC });
    expect((await meritPosition(2025, "Open PwD", 42284))!.category).toBe("GENERAL PwBD");
    // past the last row: every candidate of the category is ahead
    const last = (await meritPosition(2025, "OBC", 10_000_000))!;
    expect([last.min, last.max, last.to]).toEqual([v.qualified.OBC, v.qualified.OBC, null]);
    expect(await meritPosition(2026, "OBC", 42284)).toBeNull(); // the 2026 result prints no category
  });
});
