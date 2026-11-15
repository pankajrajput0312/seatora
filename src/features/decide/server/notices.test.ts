import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataUnavailableError } from "./catalog";
import { listNotices, roundStatus } from "./notices";

describe("without a database", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("throws DataUnavailableError", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(listNotices()).rejects.toThrow(DataUnavailableError);
    await expect(roundStatus(2026)).rejects.toThrow(DataUnavailableError);
  });
});

// Real import against the bundle it came from (local DATABASE_URL exported, see seats.test.ts).
const dir = resolve(process.env.MCC_BUNDLE ?? "../neetpg-planner/data/medpath-r3");
// A skipped suite's body still runs (vitest collects its tests): read the bundle only when it is there.
const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "[]");
describe.skipIf(!process.env.DATABASE_URL || !existsSync(join(dir, "notices.json")))("MCC notices on the real import", { timeout: 60_000 }, () => {
  type FileNotice = { title: string; date: string; url: string; kind: string; year: number; round: string | null };
  const notices: FileNotice[] = JSON.parse(read("notices.json"));
  const rs = JSON.parse(read("round_status.json"));

  it("has every notice, newest first, filterable by kind, round and year", async () => {
    const all = await listNotices();
    expect(all).toHaveLength(notices.length);
    expect(all.map((n) => n.date)).toEqual([...all.map((n) => n.date)].sort().reverse());
    for (const n of all) expect(notices.find((x) => x.url === n.url)).toMatchObject({ title: n.title, date: n.date, kind: n.kind, year: n.year, round: n.round });
    const r2 = await listNotices({ kind: "seat_matrix", round: "R2", year: 2026 });
    expect(r2.map((n) => n.url).sort()).toEqual(notices.filter((n) => n.kind === "seat_matrix" && n.round === "R2" && n.year === 2026).map((n) => n.url).sort());
  });

  it("round status as round_status.json gives it (2026 R2 choice filling until 15 Nov 23:55 IST)", async () => {
    const s = (await roundStatus(rs.year))!;
    expect(s.asOf).toBe(new Date(rs.as_of).toISOString());
    expect(s.rounds.map((r) => r.round)).toEqual(Object.keys(rs.rounds));
    for (const r of s.rounds)
      for (const st of r.steps) {
        const want = rs.rounds[r.round][st.step];
        expect({ status: st.status, date: st.date, url: st.url, title: st.title, events: st.events }).toEqual({ status: want.status, date: want.date, url: want.url, title: want.title, events: want.events });
        expect(st.scheduled).toEqual(want.scheduled ? { from: null, to: null, on: null, tentative: false, ...want.scheduled } : null);
      }
    expect(s.rounds.find((r) => r.round === "R2")!.steps.map((x) => x.step)).toEqual(["seat_matrix", "choice_filling", "provisional_result", "final_result"]);
    // The 15 Nov 23:55 end is printed in the Round-2 schedule, not in the suspension notice the status cites.
    const choice = s.rounds.find((r) => r.round === "R2")!.steps.find((x) => x.step === "choice_filling")!;
    const schedule = notices.find((n) => n.kind === "schedule" && n.year === 2026 && n.round === "R2")!;
    expect(choice.scheduledBy).toEqual({ url: schedule.url, title: schedule.title });
    expect(choice.url).not.toBe(schedule.url);
    for (const r of s.rounds) for (const st of r.steps) if (st.scheduled && st.url && notices.some((n) => n.kind === "schedule" && n.url === st.url)) expect(st.scheduledBy?.url).toBe(st.url);
    expect(await roundStatus(1999)).toBeNull();
  });
});
