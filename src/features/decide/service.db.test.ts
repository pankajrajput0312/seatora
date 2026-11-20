import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { optionsCsv, roundViewNote } from "@/app/api/v1/options/export/csv";
import { GET as collegeApi } from "@/app/api/v1/colleges/[slug]/route";
import { GET as optionsApi } from "@/app/api/v1/options/route";
import { db } from "@/lib/db";
import { eligibleCategories, latestRound, reachOrder, resultsSpan, roundReachOrder } from "./lib/reach";
import { profileHasCourse, profileQuotas, profileToParams, type Profile } from "./profile";
import { clinicalFactsFor, feesFor } from "./server/facts";
import { listSeats, seatLists } from "./server/seats";
import * as svc from "./service";
import { optionId, type SeatKind } from "./types";

// Real MCC data in Postgres (npm run db:import). Run with DATABASE_URL set, e.g.
//   set -a; . ./.env; set +a; npx vitest run src/features/decide/service.db.test.ts
const KOKILA_NM = "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8";
const GMC_NAGPUR = "GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT";
const SETH_GS = "SETHGORDHANDASSUNDERDASMEDICALCOLLEGEMUM";
const her: Profile = { rank: 42284, category: "OBC", pwd: false, specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };

const timed = async <T>(label: string, fn: () => Promise<T>) => {
  const t = performance.now();
  const out = await fn();
  console.log(`${label}: ${Math.round(performance.now() - t)} ms`);
  return out;
};
const collegeKey = async (prefix: string) => (await svc.getDecideData()).colleges.find((c) => c.key.startsWith(prefix))!;

// (importing ./service loads Prisma, which reads .env, so the guard sees DATABASE_URL from .env too)
describe.skipIf(!process.env.DATABASE_URL)("service on real MCC data", { timeout: 120_000 }, () => {
  it("loads the catalog with the MCC result PDFs (2026 R1 final, R2 provisional)", async () => {
    const meta = await timed("catalog (cold)", () => svc.getMeta());
    expect(meta.years[0]).toMatchObject({ year: 2026, rounds: ["R1", "R2"], provisional: true, label: "2026 (R1, R2, provisional)" });
    expect(meta.years.find((y) => y.year === 2025)?.label).toBe("2025");
  });

  it("Kokilaben Navi Mumbai DNB Anaesthesiology, DNB Quota, Open seat: 2025 R1–stray and 2026 R1", async () => {
    const rows = await timed("lastRanks DNB anaesthesiology Open", () => svc.lastRanks({ specialty: "ANAESTHESIOLOGY", degree: "DNB", quota: "DNB Quota", category: "Open" }));
    const g = rows.rows.find((r) => r.college.key.startsWith(KOKILA_NM))!.grid;
    expect([g[2025].R1?.closing, g[2025].R2?.closing, g[2025].R3?.closing, g[2025].stray?.closing]).toEqual([21699, 25059, 29892, 33685]);
    expect(g[2026].R1).toMatchObject({ closing: 20132, provisional: false });
    expect(g[2025].R1?.provisional).toBe(false);
  });

  it("GMC Nagpur 2026 R1 MD Anaesthesiology: 12 allotments, OBC closing 17,213", async () => {
    const c = await collegeKey(GMC_NAGPUR);
    const a = await svc.listAllotments({ year: 2026, round: "R1", course: "md-anaesthesiology" }, { page: 1, pageSize: 50 }, c.key);
    expect(a.total).toBe(12);
    expect(a.rows.every((r) => !r.provisional && r.remark === "Allotted" && r.status === "allotted")).toBe(true);
    // her grid (Open + OBC seats): closing from her categories, bracketed count = allotments in every category
    const inst = (await svc.getInstitute(c.slug, her))!;
    const md = inst.options.find((o) => o.course.slug === "md-anaesthesiology" && o.quota === "All India")!;
    expect(md.grid[2026].R1).toMatchObject({ closing: 17213, category: "OBC", n: 12, provisional: false });
  });

  it("Seth GS MD Anaesthesiology 2026 R1: OBC 11,842, Open 8,502, 20 allotments", async () => {
    const c = await collegeKey(SETH_GS);
    const inst = (await timed("getInstitute Seth GS", () => svc.getInstitute(c.slug, { ...her, rank: 1 })))!;
    const md = inst.options.find((o) => o.course.slug === "md-anaesthesiology" && o.quota === "All India")!;
    expect(md.grid[2026].R1).toMatchObject({ closing: 11842, category: "OBC", n: 20, provisional: false });
    const open = await svc.lastRanks({ specialty: "ANAESTHESIOLOGY", degree: "MD", quota: "All India", category: "Open" });
    // closing on Open seats; the bracketed count is every allotment that round (all categories)
    expect(open.rows.find((r) => r.college.key === c.key)!.grid[2026].R1).toMatchObject({ closing: 8502, n: 20 });
    expect((await svc.listAllotments({ year: 2026, round: "R1", course: "md-anaesthesiology" }, { page: 1, pageSize: 50 }, c.key)).total).toBe(20);
  });

  it("her options (AIR 42,284 OBC, Anaesthesiology + Family Medicine) in under a second", async () => {
    // The view of every option with past allotments (view=all); the round view is tested in round-view.db.test.ts.
    const v = { view: "all" } as const;
    await svc.listOptions(her, v); // warm the catalog
    const all = await timed("listOptions her (showClosed)", () => svc.listOptions(her, { ...v, showClosed: true }));
    const shown = await timed("listOptions her (all view)", () => svc.listOptions(her, v));
    console.log("her options", all.rows.length, all.counts, "shown", shown.rows.length, "hidden closed", shown.hiddenClosed);
    // Every quota ticked: every option in both specialties (cutoffs.ndjson with 2026 R2 provisional: 1,356 college ×
    // course × quota). The round-2 bundle's merged colleges hold one option where two keys held two.
    const every = await svc.listOptions({ ...her, quotas: (await svc.getMeta()).quotas }, { ...v, showClosed: true });
    expect(every.total).toBe(1356);
    expect(every.counts).toMatchObject({ "reached-latest": 334, "reached-both": 48, "reached-one": 100, "within-10": 80, "stray-only": 40, "closed-before": 695, "no-data": 59 });
    // None ticked: the open quotas only (31 options in restricted quotas left out).
    expect(all.total).toBe(1325);
    expect(all.rows.every((r) => ["All India", "DNB Quota", "Deemed/Paid Seats"].includes(r.quota))).toBe(true);
    expect(shown.total + shown.hiddenClosed).toBe(1325);
    const page2 = await svc.listOptions(her, v, { page: 2, pageSize: 50 });
    expect(page2.rows.map((r) => r.id)).toEqual(shown.rows.slice(50, 100).map((r) => r.id));
    const t = performance.now();
    await svc.listOptions(her, v);
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it("her exact courses (Family Medicine only as DNB) leave MD and NBEMS Diploma Family Medicine out, in memory and in SQL", async () => {
    const mine: Profile = { ...her, pairs: [...["Diploma", "DNB", "MD", "NBEMS Diploma"].map((d) => `${d}~ANAESTHESIOLOGY`), "DNB~FAMILYMEDICINE"] };
    const ok = (c: { degree: string; specialty: string }) => c.specialty !== "FAMILYMEDICINE" || c.degree === "DNB";
    const [all, exact] = await Promise.all([svc.listOptions(her, { view: "all", showClosed: true }), svc.listOptions(mine, { view: "all", showClosed: true })]);
    expect(exact.rows.every((r) => ok(r.course))).toBe(true);
    expect(exact.total).toBe(all.rows.filter((r) => ok(r.course)).length);
    expect(exact.total).toBeLessThan(all.total);
    expect((await svc.dashboard(mine)).summary.every((s) => ok(s.course))).toBe(true);
    const list = (await seatLists())[0];
    if (!list) return;
    const [byPair, byProduct] = await Promise.all([
      listSeats({ list: list.key, pairs: ["DNB~FAMILYMEDICINE"] }),
      listSeats({ list: list.key, specialties: ["FAMILYMEDICINE"], degrees: ["DNB"] }),
    ]);
    expect(byPair.total).toBe(byProduct.total);
    expect(byPair.rows.every((r) => r.degree === "DNB" && r.specialty === "FAMILYMEDICINE")).toBe(true);
  });

  it("rank scan, trends, institutes, fees answer from SQL", async () => {
    const scan = await timed("rankScan 42284 2025 ±500", () => svc.rankScan(42284, 2025, 500));
    expect(scan.flatMap((g) => g.rows).every((r) => Math.abs(r.rank - 42284) <= 500 && r.year === 2025)).toBe(true);
    const trends = await timed("allotmentTrends all", () => svc.allotmentTrends({}, { page: 1, pageSize: 50 }));
    expect(trends.total).toBeGreaterThan(10000);
    expect(trends.rows).toHaveLength(50);
    const inst = await timed("listInstitutes her", () => svc.listInstitutes(her, {}));
    const files = JSON.parse(read("manifest.json")).files; // (no bundle here: not checked)
    if (files) expect(inst.total).toBe(files["colleges.ndjson"].count + files["seat_colleges.ndjson"].count); // every college of the bundle
    const firstPage = await timed("listInstitutes her, page 1", () => svc.listInstitutes(her, {}, { page: 1, pageSize: 48 }));
    expect(firstPage.rows).toHaveLength(48);
    // best reach (per-year maxima in SQL) agrees with the institute page, over the options in her profile only
    for (const prefix of [KOKILA_NM, GMC_NAGPUR, SETH_GS]) {
      const row = inst.rows.find((r) => r.college.key.startsWith(prefix))!;
      const yours = (await svc.getInstitute(row.college.slug, her))!.yours.map((o) => o.reach);
      expect(row.bestReach).toBe(reachOrder.find((r) => yours.includes(r)) ?? "no-data");
      if (row.best) expect(her.specialties).toContain(row.best.course.specialty);
    }
    const fees = await timed("listFees", () => svc.listFees({}, { page: 1, pageSize: 50 }));
    expect(fees.total).toBeGreaterThan(0);
    expect(await svc.getNotices()).toEqual([]);
  });
});

// Options' round view on the real import, reconciled with the bundle's seats.ndjson (the MCC lists of 12–13 Nov 2026).
const dir = resolve(process.env.MCC_BUNDLE ?? "../neetpg-planner/data/medpath-r3");
type FileSeat = { kind: SeatKind; ikey: string; degree: string; specialty: string; quota: string | null; category: string; seats: number; src: string };
// A skipped suite's body still runs (vitest collects its tests): read the bundle only when it is there.
const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "[]");
describe.skipIf(!process.env.DATABASE_URL || !existsSync(join(dir, "seats.ndjson")))("Options' round view on real MCC data", { timeout: 120_000 }, () => {
  const file: FileSeat[] = read("seats.ndjson").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  // An import older than the bundle can hold college keys the bundle has since retired: compare through key_aliases.json.
  const aliases: { old?: string; old_sha256?: string; new: string | null }[] = JSON.parse(read("key_aliases.json"));
  const renamed = new Map(aliases.map((a) => [a.old ?? a.old_sha256!, a.new]));
  const fileId = (id: string) => {
    const [k, ...rest] = id.split("~");
    const now = renamed.get(k) ?? renamed.get(createHash("sha256").update(k).digest("hex"));
    return [now ?? k, ...rest].join("~");
  };
  // Her saved profile (Anaesthesiology MD/DNB/NBEMS Diploma/Diploma + Family Medicine) and another one.
  const herR2: Profile = { ...her, degrees: ["MD", "DNB", "NBEMS Diploma", "Diploma"] };
  const gm: Profile = { rank: 15000, category: "Open", pwd: false, specialties: ["GENERALMEDICINE"], degrees: ["MD"], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };

  /** Per option id, seats per list kind in her courses, open quotas and seat categories, straight from the file. */
  const fromFile = (p: Profile, keys: string[]) => {
    const cats: string[] = eligibleCategories(p.category, p.pwd);
    const out = new Map<string, Partial<Record<SeatKind, number>>>();
    for (const r of file) {
      if (!keys.includes(r.src) || !r.quota || !profileQuotas(p).includes(r.quota) || !cats.includes(r.category) || !profileHasCourse(p, r)) continue;
      const id = optionId({ college: r.ikey, degree: r.degree, specialty: r.specialty, quota: r.quota });
      const by = out.get(id) ?? out.set(id, {}).get(id)!;
      by[r.kind] = (by[r.kind] ?? 0) + r.seats;
    }
    return new Map([...out].filter(([, by]) => Object.values(by).some((n) => n! > 0)));
  };

  for (const [name, p, want] of [
    ["her (AIR 42,284 OBC)", herR2, { options: 1065, clear: 708, virtualOnly: 357, newOnly: 0, withNew: 103 }],
    ["AIR 15,000 Open, MD General Medicine", gm, null],
  ] as const) {
    it(`${name}: every option with 2026 R2 seats, new ones included, as in seats.ndjson; sorted; API and CSV the same`, async () => {
      // The 2026 R2 result is in: the default view is every option with past allotments; the round view on asking.
      const R = { view: "round" } as const;
      expect((await svc.listOptions(p, {}, { page: 1, pageSize: 1 })).view).toBe("all");
      const lists = await svc.currentSeatLists();
      expect(lists.map((l) => l.key)).toEqual(["mcc/2026/R2_clear_vacancy.pdf", "mcc/2026/R2_virtual_vacancy.pdf", "mcc/2026/R2_new_seats.pdf"]);
      const expected = fromFile(p, lists.map((l) => l.key));
      const r = await timed(`listOptions ${name} (round view, every row)`, () => svc.listOptions(p, R, { page: 1, pageSize: 100000 }));
      const page1 = await timed(`listOptions ${name} (round view, page 1)`, () => svc.listOptions(p, R, { page: 1, pageSize: 25 }));
      expect([r.view, r.seats, r.showClosed, r.hiddenClosed]).toEqual(["round", "any", true, 0]);
      expect(new Set(r.rows.map((x) => fileId(x.id)))).toEqual(new Set(expected.keys()));
      expect(page1.rows.map((x) => x.id)).toEqual(r.rows.slice(0, 25).map((x) => x.id));
      // Seats per row = the file's, list by list.
      for (const x of r.rows) for (const l of lists) expect([x.id, l.kind, x.seatsBy?.[l.kind] ?? 0]).toEqual([x.id, l.kind, expected.get(fileId(x.id))![l.kind] ?? 0]);
      // Summary counts from the file; new = no option in the view of every option with past allotments (in the import:
      // a bundle newer than the import can have merged a seat-list college into one with history since).
      const history = new Set((await svc.listOptions(p, { view: "all", showClosed: true })).rows.map((x) => x.id));
      const has = (by: Partial<Record<SeatKind, number>>, k: SeatKind) => (by[k] ?? 0) > 0;
      const xs = [...expected];
      const summary = {
        options: xs.length,
        clear: xs.filter(([, by]) => has(by, "clear")).length,
        virtualOnly: xs.filter(([, by]) => !has(by, "clear") && has(by, "virtual")).length,
        newOnly: xs.filter(([, by]) => !has(by, "clear") && !has(by, "virtual")).length,
        withNew: xs.filter(([, by]) => has(by, "new")).length,
        fresh: r.rows.filter((x) => !history.has(x.id)).length,
      };
      expect(r.summary).toEqual(summary);
      if (want) expect(r.summary).toMatchObject(want);
      console.log(name, "summary", r.summary, "counts", r.counts);
      // Chips add up to the list.
      expect(reachOrder.reduce((a, x) => a + r.counts[x], 0)).toBe(r.total);
      expect(r.total).toBe(summary.options);
      expect(r.counts.new).toBe(summary.fresh);
      // Label first (round order: new and no-data before closed-before), then clear vacancy seats, then the deepest 2025 closing.
      const key = (x: (typeof r.rows)[number]) => [roundReachOrder.indexOf(x.reach), -(x.seatsBy?.clear ?? 0), -(x.byYear[2025]?.closing ?? 0)];
      const keys = r.rows.map(key);
      expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]));
      // New rows: an option id like any other, no history, and Choices and Compare find them by id.
      const fresh = r.rows.filter((x) => x.reach === "new");
      expect(fresh.every((x) => x.id === optionId({ college: x.college.key, degree: x.course.degree, specialty: x.course.specialty, quota: x.quota }) && !history.has(x.id))).toBe(true);
      expect(fresh.every((x) => !Object.keys(x.grid).length && x.seatsBelow?.length === 0)).toBe(true);
      if (fresh.length) {
        const ids = [fresh[0].id, r.rows[0].id, "NO~SUCH~OPTION~HERE"];
        const ch = await svc.choiceOptions(ids, p);
        expect(ch.rows.map((x) => [x.id, x.reach, x.seatsBy])).toEqual([fresh[0], r.rows[0]].map((x) => [x.id, x.reach, x.seatsBy]));
        expect((await svc.getOptionsByIds(ids, p)).map((x) => x.id)).toEqual(ids.slice(0, 2));
      }
      // Toggles: every option with or without R2 seats; closed hidden.
      const wide = await svc.listOptions(p, { ...R, hasSeats: false }, { page: 1, pageSize: 1 });
      expect(wide.total).toBe(history.size + summary.fresh);
      const hide = await svc.listOptions(p, { ...R, showClosed: false }, { page: 1, pageSize: 1 });
      expect([hide.total, hide.hiddenClosed]).toEqual([r.total - r.counts["closed-before"], r.counts["closed-before"]]);
      // Every state ticked leaves out only the options at institutes with no state, and noState counts exactly those.
      const states = await svc.listOptions({ ...p, states: (await svc.getMeta()).states }, R, { page: 1, pageSize: 1 });
      expect([r.noState, states.total + states.noState]).toEqual([0, r.total]);
      // The API and the CSV follow the same view and params; older params keep their meaning.
      const qs = profileToParams(p);
      const api = async (extra: string) => (await (await optionsApi(new Request(`http://x/api/v1/options?${qs}&pageSize=25${extra}`))).json()) as { data: typeof r; page: { total: number } };
      expect((await api("")).data.view).toBe("all");
      const a = await api("&view=round");
      expect([a.data.view, a.data.summary, a.page.total, a.data.rows.map((x) => x.id)]).toEqual(["round", r.summary, r.total, page1.rows.map((x) => x.id)]);
      expect((await api("&view=round&hasSeats=1&showClosed=1")).page.total).toBe(summary.clear);
      expect((await api("&view=all")).data.view).toBe("all");
      // (the export route itself renders JSX-free code but imports a page caption; checked on the build) its rows and note:
      const csv = optionsCsv(r.rows, { lists: r.seatLists, latest: latestRound((await svc.getMeta()).sources), includeLatest: true, notes: [roundViewNote(lists[0], r.summary!, r.seats, resultsSpan((await svc.getMeta()).years))], sources: [] });
      const lines = csv.slice(1).split("\r\n");
      expect(lines.indexOf("")).toBe(r.total + 1);
      expect(lines.slice(1, 4).map((l) => l.split(",")[1])).toEqual(r.rows.slice(0, 3).map((x) => `"${x.college.name.replace(/"/g, '""')}"`));
      expect(csv).toContain(`${summary.options} options have 2026 R2 seats`);
    });
  }
});

// College keys the bundle retired (key_aliases.json → RetiredCollegeKey): old links and saved ids reach the college now.
describe.skipIf(!process.env.DATABASE_URL || !existsSync(join(dir, "key_aliases.json")))("retired college keys on real MCC data", { timeout: 60_000 }, () => {
  const aliases: { old?: string; old_sha256?: string; new: string | null }[] = JSON.parse(read("key_aliases.json"));
  it("every retired key of the bundle maps to its college; option ids and old slugs follow it", async () => {
    const map = await svc.retiredKeys();
    const colleges = (await svc.getDecideData()).colleges;
    for (const a of aliases) {
      const r = map[a.old ?? `sha256:${a.old_sha256}`];
      if (a.new == null) expect(r).toBeUndefined();
      else expect(r).toEqual({ key: a.new, slug: colleges.find((c) => c.key === a.new)!.slug, name: colleges.find((c) => c.key === a.new)!.name });
    }
    const plain = aliases.find((a) => a.old && a.new)!;
    const keep = `${KOKILA_NM}#400710~DNB~ANAESTHESIOLOGY~DNB Quota`;
    expect(await svc.currentOptionIds([`${plain.old}~DNB~ANAESTHESIOLOGY~DNB Quota`, keep])).toEqual([`${plain.new}~DNB~ANAESTHESIOLOGY~DNB Quota`, keep]);
    // An old slug (recorded when an import removed its college: a database that had the earlier bundle) redirects.
    const [old] = await db.$queryRaw<{ oldSlug: string; newKey: string }[]>`SELECT "oldSlug", "newKey" FROM "RetiredCollegeKey" WHERE "oldSlug" NOT LIKE 'sha256:%' LIMIT 1`;
    if (old) {
      const to = colleges.find((c) => c.key === old.newKey)!;
      expect(await svc.renamedCollege(old.oldSlug)).toMatchObject({ key: old.newKey });
      const res = await collegeApi(new Request(`http://x/api/v1/colleges/${old.oldSlug}?rank=42284`), { params: Promise.resolve({ slug: old.oldSlug }) });
      expect([res.status, res.headers.get("Location")]).toEqual([308, `/api/v1/colleges/${to.slug}?rank=42284`]);
    }
    expect(await svc.renamedCollege("no-such-college-000000")).toBeNull();
  });
});

// Bundle schema 2: allotment status / option no / previous seat, clinical facts, the per-year fee table.
describe.skipIf(!process.env.DATABASE_URL)("bundle schema 2 on real MCC data", { timeout: 60_000 }, () => {
  it("rank 23 in 2023: R1 at LTMMC Mumbai, upgraded in R2 to Seth GS on choice 1, the R1 seat reported", async () => {
    const j = await svc.rankJourney(2023, 23);
    expect(j.map((a) => [a.round, a.college.slice(0, 20), a.courseName, a.status, a.optionNo, a.candidateCategory])).toEqual([
      ["R1", "LOKMANYATILAKMEDICAL", "MD General Medicine", "allotted", null, "General"],
      ["R2", "SETHGORDHANDASSUNDER", "MD General Medicine", "upgraded", 1, "General"],
    ]);
    expect(j[0].prev).toBeNull();
    expect(j[1].prev).toMatchObject({ college: j[0].college, collegeName: j[0].collegeName, degree: "MD", specialty: "GENERALMEDICINE", quota: "All India", remark: "reported" });
    expect(await svc.rankJourney(2023, 999_999)).toEqual([]);
  });

  it("allotment rows carry status, candidate category, option no and previous seat (R1: none)", async () => {
    const c = await collegeKey(GMC_NAGPUR);
    const a = await svc.listAllotments({ year: 2026, round: "R1", course: "md-anaesthesiology" }, { page: 1, pageSize: 50 }, c.key);
    expect(a.rows.every((r) => r.status === "allotted" && r.optionNo === null && r.prev === null && !!r.candidateCategory)).toBe(true);
  });

  it("clinical facts: self-reported values with their sources, and the NBEMS disclosure check", async () => {
    const key = (await collegeKey("AADHARHEALTHINSTITUTEAUNITOFVLCOMHEALTHC")).key;
    const f = (await clinicalFactsFor(key))!;
    expect(f.facts?.beds_total).toBe(400);
    expect(f.values_meta?.["facts.beds_total"]).toMatchObject({ source_type: "hospital_site", flags: ["self_reported"] });
    expect(f.disclosure).toEqual({ status: "not_found", url: null, checked: "2026-11-15" });
    expect(await clinicalFactsFor("NOSUCHCOLLEGE")).toBeNull();
  });

  it("fee table: an NBEMS ceiling and floor are flagged, verbatim groups never carry figures, groups in seat-group order", async () => {
    const [dnb] = await feesFor(`${KOKILA_NM}#400710`, "DNB");
    expect(dnb.fee).toMatchObject({ display: "numbers", perYear: [{ amount: 125000, kind: "nbems_ceiling", maximum: true }, {}, {}] });
    expect(dnb.stipendPerMonth[0]).toMatchObject({ inr: 43000, kind: "nbems_minimum", minimum: true });
    const md = await feesFor((await collegeKey("AARUPADAIVEEDUMEDICALCOLLEGEANDHOSPITALP")).key, "MD/MS");
    expect(md.map((g) => [g.quotaGroup, g.fee.display, "perYear" in g.fee])).toEqual([["Deemed/Paid", "numbers", true], ["NRI", "verbatim", false]]); // the R2 bundle's deemed fee figures (2026-27 fee sheet)
    expect(await feesFor(`${KOKILA_NM}#400710`, "MCh")).toEqual([]);
  });
});
