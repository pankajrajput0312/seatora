import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SeatList } from "../types";
import { DataUnavailableError } from "./catalog";
import { listSeats, pickLists, seatCountsFor, seatLists, sumSeats } from "./seats";

const list = (key: string, year: number, round: SeatList["round"], kind: SeatList["kind"]): SeatList => ({ key, name: key, url: null, year, round, kind, publishedAt: null, seats: 1 });
// seatLists() order: newest year, round, then kind
const all = [list("26c", 2026, "R2", "clear"), list("26v", 2026, "R2", "virtual"), list("25c3", 2025, "R3", "clear"), list("25n2a", 2025, "R2", "new"), list("25n2b", 2025, "R2", "new"), list("25c2", 2025, "R2", "clear")];

describe("pickLists", () => {
  it("defaults to the newest clear vacancy list, one kind only", () => {
    expect(pickLists(all, {}).map((l) => l.key)).toEqual(["26c"]);
    expect(pickLists(all, { kind: "virtual" }).map((l) => l.key)).toEqual(["26v"]);
    expect(pickLists(all, { year: 2025 }).map((l) => l.key)).toEqual(["25c3"]);
  });
  it("keeps two PDFs of one kind and round as separate lists; a key picks exactly one", () => {
    expect(pickLists(all, { kind: "new" }).map((l) => l.key)).toEqual(["25n2a", "25n2b"]);
    expect(pickLists(all, { list: "25n2b", kind: "clear" }).map((l) => l.key)).toEqual(["25n2b"]);
    expect(pickLists(all, { kind: "new", year: 2026 })).toEqual([]);
  });
});

it("sumSeats adds one list's cells in a quota and categories; null when the list has none", () => {
  const cells = [
    { quota: "All India", category: "Open", seats: 2 },
    { quota: "All India", category: "OBC", seats: 1 },
    { quota: "DNB Quota", category: "OBC", seats: 4 },
  ];
  expect(sumSeats(cells, { quota: "All India", categories: ["Open", "OBC"] })).toBe(3);
  expect(sumSeats(cells, { categories: ["OBC"] })).toBe(5);
  expect(sumSeats(cells, { quota: "All India", categories: ["SC"] })).toBeNull();
  expect(sumSeats(undefined)).toBeNull();
});

describe("without a database", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("throws DataUnavailableError, never stand-in data", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(listSeats()).rejects.toThrow(DataUnavailableError);
    await expect(seatCountsFor(["x"], "mcc/2026/R2_clear_vacancy.pdf")).rejects.toThrow(DataUnavailableError);
  });
});

// Real import (npm run db:import) against the bundle it came from. Run with the local DATABASE_URL exported:
//   set -a; . ~/.config/seatora/db.env; set +a; npx vitest run src/features/decide/server/seats.test.ts
const dir = resolve(process.env.MCC_BUNDLE ?? "../neetpg-planner/data/medpath");
type FileSeat = { year: number; round: string; kind: string; ikey: string; degree: string; specialty: string; quota: string | null; category: string; seats: number; src: string };
describe.skipIf(!process.env.DATABASE_URL || !existsSync(join(dir, "seats.ndjson")))("seat lists on the real import", { timeout: 60_000 }, () => {
  const read = (f: string) => readFileSync(join(dir, f), "utf8");
  const file: FileSeat[] = read("seats.ndjson").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const sources: { key: string; url: string; kind: string }[] = JSON.parse(read("seat_sources.json"));
  const notices: { url: string; date: string }[] = JSON.parse(read("notices.json"));
  const sum = (rows: FileSeat[]) => rows.reduce((a, r) => a + r.seats, 0);

  it("has every list PDF with the file's Σ seats and its notice date", async () => {
    const lists = await seatLists();
    expect(lists.map((l) => l.key).sort()).toEqual(sources.map((s) => s.key).sort());
    for (const l of lists) {
      expect(l.seats).toBe(sum(file.filter((r) => r.src === l.key)));
      expect(l.publishedAt).toBe(notices.find((n) => n.url === l.url)?.date ?? null);
    }
  });

  it("her courses in the 2026 R2 clear vacancy list (Open + OBC seats): rows and Σ as in the file, paged", async () => {
    const key = "mcc/2026/R2_clear_vacancy.pdf";
    const f = { year: 2026, round: "R2" as const, kind: "clear" as const, specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], categories: ["Open", "OBC"] };
    const want = file.filter((r) => r.src === key && f.specialties.includes(r.specialty) && f.categories.includes(r.category));
    const res = await listSeats(f);
    expect(res.lists.map((l) => l.key)).toEqual([key]);
    expect([res.total, res.rows.length, res.seats[key]]).toEqual([want.length, want.length, sum(want)]);
    expect(res.rows.every((r) => r.list === key && f.specialties.includes(r.specialty) && f.categories.includes(r.category))).toBe(true);
    const p2 = await listSeats(f, { page: 2, pageSize: 25 });
    expect([p2.page, p2.total]).toEqual([2, want.length]);
    expect(p2.rows.map((r) => [r.college.key, r.degree, r.specialty, r.quota, r.category, r.seats])).toEqual(res.rows.slice(25, 50).map((r) => [r.college.key, r.degree, r.specialty, r.quota, r.category, r.seats]));
    // seatCountsFor agrees with the rows, per course at a college
    const cs = [...new Set(res.rows.flatMap((r) => r.cs ?? []))];
    const counts = await seatCountsFor(cs, key);
    expect(counts.list?.key).toBe(key);
    for (const id of cs) expect(sumSeats(counts.seats[id], { categories: f.categories })).toBe(res.rows.filter((r) => r.cs === id).reduce((a, r) => a + r.seats, 0));
  });

  it("one kind at a time: two newly-added lists of 2025 R2 stay separate", async () => {
    const res = await listSeats({ kind: "new", year: 2025, round: "R2" });
    const keys = sources.filter((s) => s.kind === "new" && s.key.startsWith("mcc/2025/R2")).map((s) => s.key);
    expect(res.lists.map((l) => l.key).sort()).toEqual(keys.sort());
    for (const k of keys) expect(res.seats[k]).toBe(sum(file.filter((r) => r.src === k)));
    expect(res.total).toBe(file.filter((r) => keys.includes(r.src)).length);
    expect(new Set(res.lists.map((l) => l.kind))).toEqual(new Set(["new"]));
  });

  it("filters by state, college and text; seat-list-only colleges are there too", async () => {
    const res = await listSeats({ state: "Kerala", q: "al arif" }, { page: 1, pageSize: 50 });
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows.every((r) => r.college.state === "Kerala" && /al arif/i.test(r.college.name))).toBe(true);
    const k = res.rows[0].college.key;
    const one = await listSeats({ college: k });
    expect(one.total).toBe(file.filter((r) => r.src === one.lists[0].key && r.ikey === k).length);
  });
});
