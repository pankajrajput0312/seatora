import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { pgOutputs, SHARED_KEY } from "./test/pg-outputs";

// Multi-exam rehearsal on a fresh, THROWAWAY local Postgres (it migrates and imports into it): NEET PG's real bundle,
// the synthetic neet-ss fixture (./test/neet-ss-bundle) and bundles made from it, then the real NEET MDS and NEET SS
// bundles when given. NEET PG's outputs and rows must not change by a byte, another exam's import must never change a
// college row that exists, and a re-import of NEET PG must leave the other exams' rows as they were.
//   createdb seatora_multi_test   (dropdb it first to run again: the test wants no other exam's rows to begin with)
//   EXAM_TEST_DATABASE_URL=postgresql://localhost/seatora_multi_test MCC_BUNDLE=../neetpg-planner/data/medpath-r3 \
//   MDS_BUNDLE=../neetpg-planner/data/exams/neet-mds/bundle SS_BUNDLE=../neetpg-planner/data/exams/neet-ss/bundle \
//   npx vitest run src/features/exams/exams.db.test.ts
const url = process.env.EXAM_TEST_DATABASE_URL;
const pgBundle = resolve(process.env.MCC_BUNDLE ?? "../neetpg-planner/data/medpath-r3");
const real = { "neet-mds": process.env.MDS_BUNDLE, "neet-ss": process.env.SS_BUNDLE } as const;
const FIXTURE = resolve("src/features/exams/test/neet-ss-bundle");
const local = !!url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
if (url && !local) throw new Error("EXAM_TEST_DATABASE_URL must be a local database: this test migrates and imports into it");
if (local) process.env.DATABASE_URL = url; // before anything loads Prisma (@/lib/db)

const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", maxBuffer: 64e6 });
const importBundle = (dir: string, exam?: string) => sh(process.execPath, ["--experimental-strip-types", "prisma/import-mcc.ts", ...(exam ? ["--exam", exam] : []), dir]);
const db = async () => (await import("@/lib/db")).db;
/** `fn` on fresh modules: no catalog or perImport cache from an earlier read. */
const fresh = async <T>(fn: () => Promise<T>) => {
  vi.resetModules();
  return fn();
};

const EXAM_TABLES = ["DataSource", "Specialty", "Cutoff", "Allotment", "CollegeTerm", "Announcement", "RoundStep", "MeritList", "ScoreRank", "MeritPosition", "ClinicalFacts", "FeesStructured", "CollegeExam"];
/** One exam's rows per table, and its colleges' whole rows. */
async function rows(exam: string) {
  const d = await db();
  const n = async (sql: string) => (await d.$queryRawUnsafe<{ n: number }[]>(sql, exam))[0].n;
  const out: Record<string, unknown> = {};
  for (const t of EXAM_TABLES) out[t] = await n(`SELECT COUNT(*)::int AS n FROM "${t}" WHERE exam = $1`);
  out.CollegeSpecialty = await n(`SELECT COUNT(*)::int AS n FROM "CollegeSpecialty" p JOIN "Specialty" s ON s.id = p."specialtyId" WHERE s.exam = $1`);
  out.SeatSource = await n(`SELECT COUNT(*)::int AS n FROM "SeatSource" x JOIN "DataSource" d ON d.id = x."sourceId" WHERE d.exam = $1`);
  out.SeatCount = await n(`SELECT COUNT(*)::int AS n FROM "SeatCount" x JOIN "DataSource" d ON d.id = x."seatSourceId" WHERE d.exam = $1`);
  out.colleges = await d.$queryRawUnsafe(`SELECT c.* FROM "College" c JOIN "CollegeExam" e ON e."collegeId" = c.id AND e.exam = $1 ORDER BY c.key`, exam);
  return JSON.parse(JSON.stringify(out));
}
/** Every college row as it is, by key. */
const colleges = async () => new Map((await (await db()).$queryRawUnsafe<{ key: string }[]>(`SELECT * FROM "College" ORDER BY key`)).map((c) => [c.key, JSON.stringify(c)]));
const shared = async () => (await db()).$queryRawUnsafe(`SELECT (SELECT COUNT(*)::int FROM "Resident") AS r, (SELECT COUNT(*)::int FROM "HiddenResident") AS h, (SELECT json_agg(k ORDER BY k."oldKey") FROM "RetiredCollegeKey" k) AS k`);
const fingerprint = async () => (await import("@/features/decide/server/snapshot")).fingerprint(await db());
const examsOf = async (key: string) =>
  (await (await db()).$queryRawUnsafe<{ exam: string }[]>(`SELECT e.exam FROM "CollegeExam" e JOIN "College" c ON c.id = e."collegeId" WHERE c.key = $1 ORDER BY 1`, key)).map((r) => r.exam);

/** Another exam's import: it must commit, and every college row that was there and still is must be exactly as it was. */
async function importOther(dir: string, exam?: string) {
  const before = await colleges();
  const out = importBundle(dir, exam);
  expect(out).toMatch(/Committed neet-(ss|mds)\. Spot checks passed/);
  const after = await colleges();
  const changed = [...before].filter(([k, row]) => after.has(k) && after.get(k) !== row).map(([k]) => k);
  expect(changed, "college rows another exam's import changed").toEqual([]);
  return out;
}

/** What staff see of a non-PG exam. */
async function examOutputs(exam: "neet-ss" | "neet-mds") {
  const svc = await import("@/features/decide/service");
  return JSON.parse(
    JSON.stringify({
      meta: await svc.getMeta(exam),
      options: await svc.listOptions(null, { view: "all" }, undefined, exam),
      institutes: await svc.listInstitutes(null, {}, undefined, exam),
      allotments: await svc.listAllotments({}, { page: 1, pageSize: 100 }, undefined, exam),
    }),
  );
}

type Row = Record<string, unknown> & { ikey: string; rank: number; prev_ikey?: string | null };
/** The fixture as `exam`'s bundle with only the colleges `keep` keeps (and their allotments and cutoffs), `rename`d. */
function bundle(exam: string, keep: (key: string) => boolean, rename: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), `${exam}-`));
  const m = JSON.parse(readFileSync(join(FIXTURE, "manifest.json"), "utf8"));
  const read = (f: string) => readFileSync(join(FIXTURE, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const allotments = (read("allotments.ndjson") as Row[]).filter((a) => keep(a.ikey) && (!a.prev_ikey || keep(a.prev_ikey)));
  const cells = Map.groupBy(allotments, (a) => [a.ikey, a.degree, a.specialty, a.year, a.round, a.quota, a.category].join("|"));
  const cutoffs = [...cells.values()].map(([a, ...more]) => {
    const ranks = [a, ...more].map((x) => x.rank);
    return { ikey: a.ikey, degree: a.degree, specialty: a.specialty, year: a.year, round: a.round, quota: a.quota, category: a.category, opening: Math.min(...ranks), closing: Math.max(...ranks), n: ranks.length, src: a.src };
  });
  const files: Record<string, unknown[]> = {
    "sources.json": JSON.parse(readFileSync(join(FIXTURE, "sources.json"), "utf8")),
    "courses.json": JSON.parse(readFileSync(join(FIXTURE, "courses.json"), "utf8")),
    "colleges.ndjson": read("colleges.ndjson")
      .filter((c) => keep(c.key))
      .map((c) => ({ ...c, name: rename[c.key] ?? c.name })),
    "cutoffs.ndjson": cutoffs,
    "allotments.ndjson": allotments,
  };
  for (const [f, xs] of Object.entries(files)) {
    const text = f.endsWith(".ndjson") ? xs.map((x) => `${JSON.stringify(x)}\n`).join("") : JSON.stringify(xs);
    writeFileSync(join(dir, f), text);
    m.files[f] = { count: xs.length, sha256: createHash("sha256").update(text).digest("hex") };
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...m, exam }));
  return dir;
}
const ONE = "SSFIXTUREINSTITUTEONE#110001";
const TWO = "SSFIXTUREINSTITUTETWO#600001";

describe.skipIf(!local || !existsSync(join(pgBundle, "manifest.json")))("multi-exam import on a local database", { timeout: 900_000 }, () => {
  let golden: { out: Record<string, unknown>; rows: unknown; shared: unknown; fp: string };
  const now = () => fresh(async () => ({ out: await pgOutputs(), rows: await rows("neet-pg"), shared: await shared(), fp: (await fingerprint()).fp }));

  it("migrates, imports NEET PG and records its outputs", async () => {
    sh("npx", ["prisma", "migrate", "deploy"]);
    const others = await (await db()).$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM "CollegeExam" WHERE exam <> 'neet-pg'`);
    expect(others[0].n, "a fresh database: dropdb and createdb it").toBe(0);
    expect(importBundle(pgBundle, "neet-pg")).toContain("Committed. Spot checks passed (Kokilaben");
    golden = await now();
    expect((golden.out["obc.options"] as { total: number }).total).toBeGreaterThan(0);
  });

  const unchanged = async () => {
    const n = await now();
    expect(n.rows).toEqual(golden.rows); // NEET PG's colleges included, whole rows
    expect(n.shared).toEqual(golden.shared);
    expect(n.fp).toBe(golden.fp); // the build reuses its NEET PG snapshot
    expect(JSON.stringify(n.out) === JSON.stringify(golden.out), "NEET PG outputs byte-identical").toBe(true);
  };

  let ss: unknown;
  it("imports neet-ss beside it: NEET PG byte-identical, NEET SS on its own", async () => {
    await importOther(FIXTURE); // exam from the manifest
    await unchanged();
    // the shared college: one row, NEET PG's (the fixture names it otherwise), in both exams
    expect(await examsOf(SHARED_KEY)).toEqual(["neet-pg", "neet-ss"]);
    ss = await fresh(() => examOutputs("neet-ss"));
    const { meta, options, institutes } = ss as Awaited<ReturnType<typeof examOutputs>>;
    expect(meta.courses.map((c: { slug: string }) => c.slug)).toEqual(["dm-cardiology", "mch-neuro-surgery"]);
    expect(meta.years.map((y: { label: string }) => y.label)).toEqual(["2025 (R1, R2)"]);
    expect(options.total).toBe(6);
    expect(institutes.rows.map((r: { college: { name: string } }) => r.college.name)).toEqual(["Seth Gordhandas Sunderdas Medical College", "SS Fixture Institute One (synthetic)", "SS Fixture Institute Two (synthetic)"]);
    expect((await rows("neet-ss")).Cutoff).toBe(7);
  });

  it("another exam only creates colleges; a college goes only when no exam has it", async () => {
    // neet-mds with institute One, renamed: One exists (NEET SS made it), so it stays as it is
    await importOther(bundle("neet-mds", (k) => k === ONE, { [ONE]: "Renamed by NEET MDS" }));
    // neet-ss now without One and Two: Two goes (no exam has it), One stays for NEET MDS, unchanged (its source too)
    await importOther(bundle("neet-ss", (k) => k === SHARED_KEY));
    expect(await examsOf(TWO)).toEqual([]);
    expect(await (await db()).college.count({ where: { key: TWO } })).toBe(0);
    expect(await examsOf(ONE)).toEqual(["neet-mds"]);
    const one = await (await db()).college.findUnique({ where: { key: ONE }, select: { name: true, source: { select: { exam: true, key: true } } } });
    expect(one).toEqual({ name: "SS Fixture Institute One (synthetic)", source: { exam: "neet-ss", key: "mcc/2025/R1_final.pdf" } });
    expect(await examsOf(SHARED_KEY)).toEqual(["neet-pg", "neet-ss"]);
    await unchanged();
    ss = await fresh(() => examOutputs("neet-ss"));
  });

  for (const exam of ["neet-mds", "neet-ss"] as const) {
    it.skipIf(!real[exam])(`imports the real ${exam} bundle: NEET PG byte-identical`, async () => {
      const dir = resolve(real[exam]!);
      const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      const pgKeys = new Set(((await rows("neet-pg")).colleges as { key: string }[]).map((c) => c.key));
      await importOther(dir, exam);
      await unchanged();
      const mine = await rows(exam);
      expect([mine.Cutoff, mine.Allotment, mine.SeatCount]).toEqual([m.files["cutoffs.ndjson"].count, m.files["allotments.ndjson"].count, m.files["seats.ndjson"]?.count ?? 0]);
      const keys = [...readFileSync(join(dir, "colleges.ndjson"), "utf8").split("\n").filter(Boolean), ...(existsSync(join(dir, "seat_colleges.ndjson")) ? readFileSync(join(dir, "seat_colleges.ndjson"), "utf8").split("\n").filter(Boolean) : [])].map((l) => JSON.parse(l).key as string);
      expect(mine.CollegeExam).toBe(keys.length);
      // colleges it shares with NEET PG: NEET PG's rows (checked above), in both exams
      for (const k of keys.filter((x) => pgKeys.has(x))) expect(await examsOf(k)).toContain("neet-pg");
      const out = await fresh(() => examOutputs(exam));
      expect(out.options.total).toBeGreaterThan(0);
      if (exam === "neet-ss") {
        ss = out;
        // A rank is within one question group: her group's options only, labelled; no group, nothing labelled.
        const svc = await import("@/features/decide/service");
        expect(await svc.examGroups(exam)).toContain("Medical Group");
        const p = { rank: 300, category: "Open" as const, pwd: false, specialties: ["CARDIOLOGY"], degrees: [], quotas: [] as string[], states: [], maxFeeLakh: null, maxBondYears: null };
        const quotas = out.meta.quotas.filter((q: string) => q.endsWith("(Medical Group)"));
        const mine = await svc.listOptions({ ...p, quotas }, { view: "all" }, undefined, exam);
        expect(mine.total).toBeGreaterThan(0);
        expect(mine.rows.every((r) => quotas.includes(r.quota))).toBe(true);
        expect(mine.rows.some((r) => r.reach.startsWith("reached"))).toBe(true);
        expect((await svc.listOptions(p, { view: "all" }, undefined, exam)).total).toBe(0);
      }
    });
  }

  it("re-importing NEET PG leaves the other exams' rows as they were", async () => {
    // colleges' updatedAt aside: NEET PG writes its colleges again, the ones it shares too
    const strip = (r: { colleges: Record<string, unknown>[] }) => ({ ...r, colleges: r.colleges.map((c) => ({ ...c, updatedAt: null })) });
    const others = async () => ({ ss: strip(await rows("neet-ss")), mds: strip(await rows("neet-mds")) });
    const before = await others();
    expect(importBundle(pgBundle)).toContain("Committed. Spot checks passed (Kokilaben"); // no --exam, no manifest.exam: NEET PG
    expect(await others()).toEqual(before);
    expect(await fresh(() => examOutputs("neet-ss"))).toEqual(ss);
    expect(strip(await rows("neet-pg"))).toEqual(strip(golden.rows as never));
    await (await db()).$disconnect();
  });
});
