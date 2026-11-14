// Imports the MCC export bundle (neetpg-planner `python3 -I tools/export_medpath.py` → data/medpath/).
// Usage: npm run db:import [-- <bundle dir>]   (default ../neetpg-planner/data/medpath, or MCC_BUNDLE)
// Validates everything first and aborts on any error; then, in one transaction, makes the database match the bundle:
// upserts sources, colleges (incl. the seat-list-only ones) and specialties, replaces cutoffs, allotments, terms, seat
// lists, notices, round steps and the NBEMS score/merit aggregates, and removes the colleges, courses and sources the
// bundle no longer has. Spot checks run before the commit. Re-running the same bundle is a no-op in effect. Every file
// and summary file is hash- and count-checked against the manifest.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  mccAllotmentSchema,
  mccCategories,
  mccCollegeSchema,
  mccCourseSchema,
  mccCutoffSchema,
  mccManifestSchema,
  mccRounds,
  mccSourceSchema,
  mccTermSchema,
} from "../src/features/cutoffs/lib/import-schema.ts";
import { noticeKinds, roundSteps, seatKinds, stepStatuses } from "../src/features/decide/types.ts";

const dir = resolve(process.argv[2] ?? process.env.MCC_BUNDLE ?? "../neetpg-planner/data/medpath");
const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// ---------- 1. verify and validate the whole bundle before touching the database ----------
const manifestJson = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const manifest = mccManifestSchema.parse(manifestJson);
const fileEntry = z.object({ count: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const summaryFiles = z.object({ "round_status.json": fileEntry, "score_rank.json": fileEntry, "merit_position.json": fileEntry }).strict().parse(manifestJson.summary_files);
const raw: Record<string, Buffer> = {};
for (const [file, { count, sha256 }] of Object.entries({ ...manifest.files, ...summaryFiles })) {
  raw[file] = readFileSync(join(dir, file));
  if (createHash("sha256").update(raw[file]).digest("hex") !== sha256) fail(`${file}: sha256 does not match manifest`);
  if (file in summaryFiles) continue; // not row lists: counted after parsing, below
  const rows = file.endsWith(".ndjson") ? raw[file].toString("utf8").split("\n").filter(Boolean).length : JSON.parse(raw[file].toString("utf8")).length;
  if (rows !== count) fail(`${file}: ${rows} rows, manifest says ${count}`);
}

function parse<S extends z.ZodType>(file: string, schema: S): z.infer<S>[] {
  const text = raw[file]?.toString("utf8");
  if (text == null) {
    fail(`${file}: missing from manifest`);
    return [];
  }
  const items: { line: number; value: unknown }[] = file.endsWith(".ndjson")
    ? text.split("\n").flatMap((l, i) => (l ? [{ line: i + 1, value: JSON.parse(l) }] : []))
    : (JSON.parse(text) as unknown[]).map((value, i) => ({ line: i + 1, value }));
  const out: z.infer<S>[] = [];
  for (const { line, value } of items) {
    const r = schema.safeParse(value);
    if (r.success) out.push(r.data);
    else fail(`${file}:${line}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  return out;
}

const sources = parse("sources.json", mccSourceSchema);
const colleges = parse("colleges.ndjson", mccCollegeSchema);
const courses = parse("courses.json", mccCourseSchema);
const cutoffs = parse("cutoffs.ndjson", mccCutoffSchema);
const terms = parse("terms.ndjson", mccTermSchema);
const allotments = parse("allotments.ndjson", mccAllotmentSchema);

// Seat lists, notices, round steps, NBEMS aggregates. Strict like import-schema.ts: an extra key aborts.
const year = z.number().int().min(2000).max(2100);
const pos = z.number().int().positive();
const ikey = z.string().regex(/^[A-Z0-9]{1,40}(#(\d{6})?)?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const when = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\+05:30)?$/); // a date, or a date-time in IST, as printed
const nbemsKey = z.string().regex(/^nbems\/\d{4}\/[\w.-]+\.pdf$/);
const seatSourceSchema = z
  .object({ key: z.string().regex(/^mcc\/\d{4}\/[\w.-]+\.pdf$/), url: z.url(), year, round: z.enum(mccRounds), kind: z.enum(seatKinds), name: z.string().min(1) })
  .strict();
const seatSchema = z
  .object({
    year,
    round: z.enum(mccRounds),
    kind: z.enum(seatKinds),
    ikey,
    degree: z.string().min(1),
    specialty: z.string().regex(/^[A-Z0-9]+$/),
    quota: z.string().min(1).nullable(),
    category: z.enum(mccCategories),
    seats: z.number().int().nonnegative(),
    src: z.string().min(1),
  })
  .strict();
const noticeSchema = z
  .object({ title: z.string().min(1).max(500), date: isoDate, url: z.url(), authority: z.string().min(1), kind: z.enum(noticeKinds), year, round: z.enum(mccRounds).nullable() })
  .strict();
const stepStatus = z.enum(stepStatuses);
const stepSchema = z
  .object({
    status: stepStatus,
    date: isoDate.nullable(),
    url: z.url().nullable(),
    title: z.string().min(1).nullable(),
    note: z.string().min(1).optional(),
    scheduled: z.object({ from: when.optional(), to: when.optional(), on: when.optional(), tentative: z.boolean().optional() }).strict().optional(),
    events: z.array(z.object({ date: isoDate, status: stepStatus, title: z.string().min(1), url: z.url() }).strict()),
  })
  .strict();
const roundStatusSchema = z
  .object({
    year,
    authority: z.string().min(1),
    as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/),
    latest_notice: isoDate,
    notes: z.record(z.string(), z.string()),
    rounds: z.partialRecord(z.enum(mccRounds), z.object({ seat_matrix: stepSchema, choice_filling: stepSchema, provisional_result: stepSchema, final_result: stepSchema }).strict()),
  })
  .strict();
const nbemsYear = { source: nbemsKey, source_url: z.url(), notice_url: z.url() };
const scoreRankSchema = z
  .object({
    built: z.string(),
    years: z.record(
      z.string().regex(/^\d{4}$/),
      z
        .object({
          ...nbemsYear,
          max_marks: pos,
          candidates: pos,
          cols: z.tuple([z.literal("score"), z.literal("best_rank"), z.literal("worst_rank"), z.literal("count")]),
          rows: z.array(z.tuple([z.number().int(), pos, pos, pos])).min(1),
        })
        .strict(),
    ),
    notes: z.object({ rank: z.string(), coverage: z.string(), max_marks: z.string() }).strict(),
  })
  .strict();
const meritPositionSchema = z
  .object({
    built: z.string(),
    years: z.record(
      z.string().regex(/^\d{4}$/),
      z
        .object({
          ...nbemsYear,
          step: pos,
          qualified: z.record(z.string().min(1), z.number().int().nonnegative()),
          cols: z.array(z.string().min(1)).min(3),
          rows: z.array(z.array(z.number().int().nonnegative())).min(1),
        })
        .strict(),
    ),
    notes: z.record(z.string(), z.string()),
  })
  .strict();
function parseOne<S extends z.ZodType>(file: string, schema: S): z.infer<S> | null {
  const r = schema.safeParse(JSON.parse(raw[file].toString("utf8")));
  if (!r.success) fail(`${file}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return r.success ? r.data : null;
}

const seatSources = parse("seat_sources.json", seatSourceSchema);
const seats = parse("seats.ndjson", seatSchema);
const seatColleges = parse("seat_colleges.ndjson", mccCollegeSchema);
const notices = parse("notices.json", noticeSchema);
const roundStatus = parseOne("round_status.json", roundStatusSchema);
const scoreRank = parseOne("score_rank.json", scoreRankSchema);
const meritPosition = parseOne("merit_position.json", meritPositionSchema);

const sourceKeys = new Set(sources.map((s) => s.key));
const collegeKeys = new Set(colleges.map((c) => c.key));
const courseSlug = new Map(courses.map((c) => [`${c.degree}|${c.specialty}`, c.slug]));
const roundKey = (y: number, r: string) => `${y}|${r}`;
const srcOfRound = new Map<string, string>();
for (const s of sources) {
  if (srcOfRound.has(roundKey(s.year, s.round))) fail(`sources.json: two sources for ${s.year} ${s.round}`);
  srcOfRound.set(roundKey(s.year, s.round), s.key);
}
cutoffs.forEach((c, i) => {
  const at = `cutoffs.ndjson:${i + 1}`;
  if (!collegeKeys.has(c.ikey)) fail(`${at}: unknown college ${c.ikey}`);
  if (!courseSlug.has(`${c.degree}|${c.specialty}`)) fail(`${at}: unknown course ${c.degree} ${c.specialty}`);
  if (!sourceKeys.has(c.src) || srcOfRound.get(roundKey(c.year, c.round)) !== c.src) fail(`${at}: source ${c.src} does not match ${c.year} ${c.round}`);
});
// every allotment belongs to a cutoff cell, and each cell's count, best and worst rank agree with its allotments
const cellKey = (c: { ikey: string; degree: string; specialty: string; year: number; round: string; quota: string; category: string }) =>
  [c.ikey, c.degree, c.specialty, c.year, c.round, c.quota, c.category].join("|");
const cells = new Map(cutoffs.map((c) => [cellKey(c), { n: 0, min: Infinity, max: 0, want: c }]));
allotments.forEach((a, i) => {
  const at = `allotments.ndjson:${i + 1}`;
  if (!sourceKeys.has(a.src) || srcOfRound.get(roundKey(a.year, a.round)) !== a.src) fail(`${at}: source ${a.src} does not match ${a.year} ${a.round}`);
  const cell = cells.get(cellKey(a));
  if (!cell) return fail(`${at}: no cutoff for ${cellKey(a)}`);
  cell.n++;
  cell.min = Math.min(cell.min, a.rank);
  cell.max = Math.max(cell.max, a.rank);
});
for (const [k, { n, min, max, want }] of cells)
  if (n !== want.n || min !== want.opening || max !== want.closing) fail(`cutoff ${k}: n/opening/closing ${want.n}/${want.opening}/${want.closing}, allotments give ${n}/${min}/${max}`);
const termKeys = new Set<string>();
terms.forEach((t, i) => {
  if (!collegeKeys.has(t.ikey)) fail(`terms.ndjson:${i + 1}: unknown college ${t.ikey}`);
  const k = `${t.ikey}|${t.program}|${t.kind}`;
  if (termKeys.has(k)) fail(`terms.ndjson:${i + 1}: duplicate ${t.program} ${t.kind} for ${t.ikey}`);
  termKeys.add(k);
});

// seat lists: each row in its list's year/round/kind, at a known college; Σ seats per list = what the list gets in the DB
const seatSourceOf = new Map(seatSources.map((s) => [s.key, s]));
if (seatSourceOf.size !== seatSources.length) fail("seat_sources.json: duplicate key");
const seatCollegeKeys = new Set(seatColleges.map((c) => c.key));
for (const k of seatCollegeKeys) if (collegeKeys.has(k)) fail(`seat_colleges.ndjson: ${k} is also in colleges.ndjson`);
const allCollegeKeys = new Set([...collegeKeys, ...seatCollegeKeys]);
// One institute under a name key and the same key with "#PIN" splits its seat lines from its closing ranks (2026 R2: Karpaga Vinayaga).
for (const k of allCollegeKeys) if (k.includes("#") && allCollegeKeys.has(k.split("#")[0])) fail(`colleges: both ${k.split("#")[0]} and ${k} are keys; one institute must have one key`);
const listTotal = new Map(seatSources.map((s) => [s.key, 0]));
const usedSeatColleges = new Set<string>();
seats.forEach((s, i) => {
  const at = `seats.ndjson:${i + 1}`;
  const src = seatSourceOf.get(s.src);
  if (!src || src.year !== s.year || src.round !== s.round || src.kind !== s.kind) fail(`${at}: source ${s.src} does not match ${s.year} ${s.round} ${s.kind}`);
  if (!allCollegeKeys.has(s.ikey)) fail(`${at}: unknown college ${s.ikey}`);
  if (seatCollegeKeys.has(s.ikey)) usedSeatColleges.add(s.ikey);
  listTotal.set(s.src, (listTotal.get(s.src) ?? 0) + s.seats);
});
for (const s of seatSources) if (!seats.some((x) => x.src === s.key)) fail(`seat_sources.json: ${s.key} has no rows`);
for (const k of seatCollegeKeys) if (!usedSeatColleges.has(k)) fail(`seat_colleges.ndjson: ${k} is in no seat list`);
const unknownCourses = new Set(seats.filter((s) => !courseSlug.has(`${s.degree}|${s.specialty}`)).map((s) => `${s.degree} ${s.specialty}`));

// notices: DataSource key = URL, so URLs are unique and never a term document's
const termUrls = new Set(terms.map((t) => t.src_url));
const noticeByUrl = new Map(notices.map((n) => [n.url, n]));
if (noticeByUrl.size !== notices.length) fail("notices.json: duplicate url");
for (const n of notices) if (termUrls.has(n.url)) fail(`notices.json: ${n.url} is also a term document`);

// round steps
const steps = roundStatus
  ? Object.entries(roundStatus.rounds).flatMap(([round, st]) => roundSteps.map((step) => ({ round, step, ...st![step] })))
  : [];
if (roundStatus && steps.length !== summaryFiles["round_status.json"].count) fail(`round_status.json: ${steps.length} steps, manifest says ${summaryFiles["round_status.json"].count}`);

// NBEMS aggregates: ranks and counts consistent row by row; one result PDF per year behind both files
type NbemsList = { year: number; key: string; url: string; noticeUrl: string; maxMarks: number; candidates: number; coverage: string; step: number | null; qualified: Record<string, number> | null };
const nbems = new Map<number, NbemsList>();
const coverageOf = new Map((scoreRank?.notes.coverage ?? "").split("; ").map((s) => [s.slice(0, 4), s.replace(/^\d{4}: /, "")]));
const scoreRows: { year: number; score: number; bestRank: number; worstRank: number; count: number }[] = [];
for (const [y, v] of Object.entries(scoreRank?.years ?? {})) {
  const at = `score_rank.json ${y}`;
  const coverage = coverageOf.get(y);
  if (!coverage) fail(`${at}: notes.coverage has no "${y}: ..." part`);
  nbems.set(+y, { year: +y, key: v.source, url: v.source_url, noticeUrl: v.notice_url, maxMarks: v.max_marks, candidates: v.candidates, coverage: coverage ?? "", step: null, qualified: null });
  v.rows.forEach(([score, bestRank, worstRank, count], i) => {
    const prev = v.rows[i - 1];
    if (bestRank > worstRank || count > worstRank - bestRank + 1) fail(`${at} score ${score}: ranks ${bestRank}-${worstRank} for ${count}`);
    if (prev && (score >= prev[0] || bestRank <= prev[2])) fail(`${at} score ${score}: not below score ${prev[0]} (scores falling, ranks rising)`);
    scoreRows.push({ year: +y, score, bestRank, worstRank, count });
  });
  const n = v.rows.reduce((a, r) => a + r[3], 0);
  if (n !== v.candidates) fail(`${at}: counts add up to ${n}, candidates ${v.candidates}`);
}
if (scoreRows.length !== summaryFiles["score_rank.json"].count) fail(`score_rank.json: ${scoreRows.length} rows, manifest says ${summaryFiles["score_rank.json"].count}`);
const meritRows: { year: number; aiqRank: number; maxAir: number; category: string; count: number }[] = [];
let meritRowCount = 0;
for (const [y, v] of Object.entries(meritPosition?.years ?? {})) {
  const at = `merit_position.json ${y}`;
  const list = nbems.get(+y);
  if (!list || list.key !== v.source || list.url !== v.source_url || list.noticeUrl !== v.notice_url) fail(`${at}: source differs from score_rank.json ${y}`);
  const [c0, c1, ...cats] = v.cols;
  if (c0 !== "aiq_rank" || c1 !== "max_air" || cats.length !== Object.keys(v.qualified).length || !cats.every((c) => c in v.qualified) || !("ALL" in v.qualified))
    fail(`${at}: cols ${v.cols.join(",")} do not match qualified ${Object.keys(v.qualified).join(",")}`);
  if (list && v.qualified.ALL !== list.candidates) fail(`${at}: qualified ALL ${v.qualified.ALL}, score_rank candidates ${list.candidates}`);
  v.rows.forEach((r, i) => {
    const prev = v.rows[i - 1];
    const last = i === v.rows.length - 1;
    if (r.length !== v.cols.length) return fail(`${at} row ${i + 1}: ${r.length} values for ${v.cols.length} cols`);
    if (last ? r[0] <= i * v.step || r[0] > (i + 1) * v.step : r[0] !== (i + 1) * v.step) fail(`${at} row ${i + 1}: AIQ rank ${r[0]} is not step ${v.step}`);
    if (prev && r.some((x, j) => j > 0 && x < prev[j])) fail(`${at} row ${i + 1}: a value falls`);
    if (r[2] > r[0]) fail(`${at} row ${i + 1}: ALL ${r[2]} above AIQ rank ${r[0]}`);
    if (last && cats.some((c, j) => r[j + 2] !== v.qualified[c])) fail(`${at}: last row is not the qualified totals`);
    cats.forEach((category, j) => meritRows.push({ year: +y, aiqRank: r[0], maxAir: r[1], category, count: r[j + 2] }));
  });
  meritRowCount += v.rows.length;
  if (list) Object.assign(list, { step: v.step, qualified: v.qualified });
}
if (meritRowCount !== summaryFiles["merit_position.json"].count) fail(`merit_position.json: ${meritRowCount} rows, manifest says ${summaryFiles["merit_position.json"].count}`);

if (errors.length) {
  console.error(`Import aborted: ${errors.length} error(s)\n${errors.slice(0, 200).join("\n")}`);
  process.exit(1);
}

// ---------- 2. write, in ONE transaction: the app sees the old data or the new, never a mix ----------
const db = new PrismaClient();
const kebab = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const shortHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 6);
const roundOrder = ["R1", "R2", "R3", "stray", "special_stray"];
const sourceRank = (k: string) => {
  const s = sources.find((x) => x.key === k) ?? seatSourceOf.get(k)!;
  return s.year * 10 + roundOrder.indexOf(s.round);
};
// Written last in the transaction, so it changes only when an import commits: the data version that
// src/features/decide/server/catalog.ts checks on every request.
const MARKER = "import/mcc";

async function main() {
  const result = await db.$transaction(
    async (tx) => {
      // Accounts are never touched by this import; counted so a bug here rolls back instead of costing one.
      const accounts = async () => (await Promise.all([tx.user.count(), tx.session.count(), tx.waitlistEntry.count()])).join("/");
      const accountsBefore = await accounts();

      // remove what the bundle replaces or no longer has. Cutoffs, allotments, terms, seat lists, notices, round steps and
      // the NBEMS aggregates have no other source.
      // Key diffs are done here, not as NOT IN in SQL: that plan (NOT IN + nested NOT EXISTS over 133k cutoffs) can run for many minutes.
      await tx.cutoff.deleteMany({});
      await tx.allotment.deleteMany({});
      await tx.collegeTerm.deleteMany({});
      await tx.seatCount.deleteMany({});
      await tx.announcement.deleteMany({});
      await tx.roundStep.deleteMany({});
      await tx.scoreRank.deleteMany({});
      await tx.meritPosition.deleteMany({});
      const slugs = new Set(courses.map((c) => c.slug));
      const pairKeys = new Set(cutoffs.map((c) => `${c.ikey}|${courseSlug.get(`${c.degree}|${c.specialty}`)}`));
      const oldPairs = await tx.collegeSpecialty.findMany({ select: { id: true, college: { select: { key: true } }, specialty: { select: { slug: true } } } });
      const gonePairs = oldPairs.filter((p) => !pairKeys.has(`${p.college.key}|${p.specialty.slug}`)).map((p) => p.id);
      const goneColleges = (await tx.college.findMany({ select: { id: true, key: true } })).filter((c) => !allCollegeKeys.has(c.key)).map((c) => c.id);
      const goneSpecialties = (await tx.specialty.findMany({ select: { id: true, slug: true } })).filter((s) => !slugs.has(s.slug)).map((s) => s.id);
      // Residents of a removed college (cascade) or course go too; import-residents re-adds them under the new key or course,
      // and their hides live on in HiddenResident.
      const goneResidents = await tx.resident.count({ where: { OR: [{ collegeId: { in: goneColleges } }, { specialtyId: { in: goneSpecialties } }] } });
      await tx.collegeSpecialty.deleteMany({ where: { id: { in: gonePairs } } });
      await tx.college.deleteMany({ where: { id: { in: goneColleges } } }); // their Resident rows cascade
      await tx.resident.deleteMany({ where: { specialtyId: { in: goneSpecialties } } });
      await tx.specialty.deleteMany({ where: { id: { in: goneSpecialties } } });

      // sources: allotment PDFs, plus one per distinct term URL
      const sourceId = new Map<string, string>();
      for (const s of sources) {
        const data = { name: s.name, url: s.url, type: "OFFICIAL" as const, counsellingYear: s.year, round: s.round, provisional: s.provisional };
        const row = await tx.dataSource.upsert({ where: { key: s.key }, create: { key: s.key, ...data }, update: data, select: { id: true } });
        sourceId.set(s.key, row.id);
      }
      for (const url of new Set(terms.map((t) => t.src_url))) {
        const host = new URL(url).hostname;
        const name = host.includes("mcc.admissions") ? "MCC institute profile (college declaration)" : host.includes("natboard") ? "NBEMS notice" : `Official document (${host})`;
        const row = await tx.dataSource.upsert({ where: { key: url }, create: { key: url, name, url, type: "OFFICIAL" }, update: { name, url }, select: { id: true } });
        sourceId.set(url, row.id);
      }
      // seat list PDFs: round stays null on the DataSource (year, round, kind on SeatSource), so the catalog never takes
      // one for an allotment result. Dated by the MCC notice that links the PDF, else no date.
      for (const s of seatSources) {
        const date = noticeByUrl.get(s.url)?.date;
        const data = { name: s.name, url: s.url, type: "OFFICIAL" as const, counsellingYear: s.year, round: null, provisional: false, publishedAt: date ? new Date(`${date}T00:00:00Z`) : null };
        const row = await tx.dataSource.upsert({ where: { key: s.key }, create: { key: s.key, ...data }, update: data, select: { id: true } });
        const list = { year: s.year, round: s.round, kind: s.kind, total: listTotal.get(s.key)! };
        await tx.seatSource.upsert({ where: { sourceId: row.id }, create: { sourceId: row.id, ...list }, update: list });
        sourceId.set(s.key, row.id);
      }
      // notices: one DataSource per notice (key = its URL), as for term documents
      for (const n of notices) {
        const data = { name: n.title, url: n.url, type: "OFFICIAL" as const, counsellingYear: n.year, publishedAt: new Date(`${n.date}T00:00:00Z`) };
        const row = await tx.dataSource.upsert({ where: { key: n.url }, create: { key: n.url, ...data }, update: data, select: { id: true } });
        sourceId.set(n.url, row.id);
      }
      // NBEMS result PDFs behind score→rank and merit position; name from the exporter's coverage note ("AIQ 50% merit list")
      for (const l of nbems.values()) {
        const data = { name: `NBEMS NEET PG ${l.year} ${l.coverage.split(",")[0]}`, url: l.url, type: "OFFICIAL" as const, counsellingYear: l.year };
        const row = await tx.dataSource.upsert({ where: { key: l.key }, create: { key: l.key, ...data }, update: data, select: { id: true } });
        const list = { year: l.year, maxMarks: l.maxMarks, candidates: l.candidates, coverage: l.coverage, noticeUrl: l.noticeUrl, step: l.step, qualified: l.qualified ?? Prisma.DbNull };
        await tx.meritList.upsert({ where: { sourceId: row.id }, create: { sourceId: row.id, ...list }, update: list });
        sourceId.set(l.key, row.id);
      }

      // colleges: slug is set once at creation and never changed, so URLs stay stable. Seat-list-only colleges get the
      // earliest seat list they appear in as source.
      const firstSource = new Map<string, string>();
      for (const c of [...cutoffs, ...seats.filter((s) => seatCollegeKeys.has(s.ikey))]) {
        const cur = firstSource.get(c.ikey);
        if (!cur || sourceRank(c.src) < sourceRank(cur) || (sourceRank(c.src) === sourceRank(cur) && c.src < cur)) firstSource.set(c.ikey, c.src);
      }
      const baseSlug = (c: (typeof colleges)[number]) => `${kebab(c.name)}-${c.pincode ?? shortHash(c.key)}`;
      const slugCount = new Map<string, number>();
      for (const c of [...colleges, ...seatColleges]) slugCount.set(baseSlug(c), (slugCount.get(baseSlug(c)) ?? 0) + 1);
      // a slug held by a college under another key also gets the hash suffix (removed colleges are gone by now, so a
      // renamed key with the same name and PIN keeps its URL)
      const slugOwner = new Map((await tx.college.findMany({ select: { slug: true, key: true } })).map((r) => [r.slug, r.key]));
      const collegeId = new Map<string, string>();
      for (const c of [...colleges, ...seatColleges]) {
        const taken = slugOwner.has(baseSlug(c)) && slugOwner.get(baseSlug(c)) !== c.key;
        const slug = taken || slugCount.get(baseSlug(c))! > 1 ? `${baseSlug(c)}-${shortHash(c.key)}` : baseSlug(c);
        const data = { name: c.name, state: c.state, pincode: c.pincode, address: c.address, sourceId: sourceId.get(firstSource.get(c.key)!)! };
        const row = await tx.college.upsert({ where: { key: c.key }, create: { key: c.key, slug, ...data }, update: data, select: { id: true } });
        collegeId.set(c.key, row.id);
      }

      // result PDFs and term documents no longer in the bundle (e.g. a provisional result the final one replaced): nothing
      // references them any more. Admitted-list sources (no round, written by import-residents) and the marker stay.
      const goneSources = await tx.dataSource.deleteMany({
        where: { OR: [{ round: { not: null } }, { key: { startsWith: "http" } }, { seatSource: { isNot: null } }, { meritList: { isNot: null } }], key: { notIn: [...sourceId.keys()] } },
      });

      const specialtyId = new Map<string, string>();
      for (const c of courses) {
        const data = { name: c.name, degree: c.degree, code: c.specialty };
        const row = await tx.specialty.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...data }, update: data, select: { id: true } });
        specialtyId.set(`${c.degree}|${c.specialty}`, row.id);
      }

      const pairs = new Map<string, { collegeId: string; specialtyId: string }>();
      for (const c of cutoffs) {
        const p = { collegeId: collegeId.get(c.ikey)!, specialtyId: specialtyId.get(`${c.degree}|${c.specialty}`)! };
        pairs.set(`${p.collegeId}|${p.specialtyId}`, p);
      }
      await tx.collegeSpecialty.createMany({ data: [...pairs.values()], skipDuplicates: true });
      const csId = new Map(
        (await tx.collegeSpecialty.findMany({ select: { id: true, collegeId: true, specialtyId: true } })).map((r) => [`${r.collegeId}|${r.specialtyId}`, r.id]),
      );

      const csOf = (c: { ikey: string; degree: string; specialty: string }) => csId.get(`${collegeId.get(c.ikey)}|${specialtyId.get(`${c.degree}|${c.specialty}`)}`)!;
      for (const s of sources) {
        const rows = cutoffs.filter((c) => c.src === s.key);
        const seats = allotments.filter((a) => a.src === s.key);
        const id = sourceId.get(s.key)!;
        for (let i = 0; i < rows.length; i += 5000) {
          await tx.cutoff.createMany({
            data: rows.slice(i, i + 5000).map((c) => ({
              collegeSpecialtyId: csOf(c),
              counsellingYear: c.year,
              round: c.round,
              quota: c.quota,
              category: c.category,
              openingRank: c.opening,
              closingRank: c.closing,
              n: c.n,
              sourceId: id,
              lastVerifiedAt: new Date(manifest.built),
              verificationStatus: s.provisional ? "PENDING" : "VERIFIED",
            })),
          });
        }
        for (let i = 0; i < seats.length; i += 3000) {
          await tx.allotment.createMany({
            data: seats.slice(i, i + 3000).map((a) => ({
              collegeSpecialtyId: csOf(a),
              counsellingYear: a.year,
              round: a.round,
              rank: a.rank,
              quota: a.quota,
              category: a.category,
              status: a.status,
              sourceId: id,
            })),
          });
        }
        console.log(`${s.key}: ${rows.length} cutoffs, ${seats.length} allotments`);
      }

      // ponytail: this bundle is the only term source today; scope the delete above by source once a second one exists.
      await tx.collegeTerm.createMany({
        data: terms.map((t) => ({
          collegeId: collegeId.get(t.ikey)!,
          program: t.program,
          kind: t.kind,
          text: t.text,
          amountInr: t.amount_inr,
          sourceId: sourceId.get(t.src_url)!,
        })),
      });

      // seat lists, row by row as the file has them; linked to the course at the college where Decide has it (an option)
      for (const s of seatSources) {
        const rows = seats.filter((x) => x.src === s.key);
        for (let i = 0; i < rows.length; i += 5000) {
          await tx.seatCount.createMany({
            data: rows.slice(i, i + 5000).map((x) => {
              const sp = specialtyId.get(`${x.degree}|${x.specialty}`) ?? null;
              const college = collegeId.get(x.ikey)!;
              return {
                seatSourceId: sourceId.get(s.key)!,
                collegeId: college,
                specialtyId: sp,
                collegeSpecialtyId: (sp && csId.get(`${college}|${sp}`)) ?? null,
                degree: x.degree,
                code: x.specialty,
                quota: x.quota,
                category: x.category,
                seats: x.seats,
              };
            }),
          });
        }
      }
      await tx.announcement.createMany({
        data: notices.map((n) => ({ title: n.title, authority: n.authority, category: n.kind, counsellingYear: n.year, round: n.round, publishedAt: new Date(`${n.date}T00:00:00Z`), officialUrl: n.url, sourceId: sourceId.get(n.url)! })),
      });
      await tx.roundStep.createMany({
        data: steps.map((st) => ({
          year: roundStatus!.year,
          round: st.round,
          step: st.step,
          status: st.status,
          date: st.date,
          url: st.url,
          title: st.title,
          note: st.note ?? null,
          scheduledFrom: st.scheduled?.from ?? null,
          scheduledTo: st.scheduled?.to ?? null,
          scheduledOn: st.scheduled?.on ?? null,
          tentative: st.scheduled?.tentative ?? false,
          events: st.events,
          asOf: new Date(roundStatus!.as_of),
        })),
      });
      const listIdOf = (y: number) => sourceId.get(nbems.get(y)!.key)!;
      await tx.scoreRank.createMany({ data: scoreRows.map((r) => ({ ...r, listId: listIdOf(r.year) })) });
      await tx.meritPosition.createMany({ data: meritRows.map((r) => ({ ...r, listId: listIdOf(r.year) })) });

      // ---------- 3. re-assert known values before committing; any failure rolls the whole import back ----------
      const closingOf = async (prefix: string, slug: string, year: number, round: string, quota: string, category?: string) =>
        tx.cutoff.findMany({
          where: { counsellingYear: year, round, quota, category, collegeSpecialty: { college: { key: { startsWith: prefix } }, specialty: { slug } } },
          select: { closingRank: true, category: true, n: true },
        });
      const kokila = "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8";
      const expected: [number, string, number][] = [[2025, "R1", 21699], [2025, "R2", 25059], [2025, "R3", 29892], [2025, "stray", 33685], [2026, "R1", 20132]];
      const dnbAnaes = courseSlug.get("DNB|ANAESTHESIOLOGY")!;
      const mdAnaes = courseSlug.get("MD|ANAESTHESIOLOGY")!;
      const bad: string[] = [];
      for (const [y, r, want] of expected) {
        const got = await closingOf(kokila, dnbAnaes, y, r, "DNB Quota", "Open");
        if (got.length !== 1 || got[0].closingRank !== want) bad.push(`Kokilaben ${y} ${r}: expected ${want}, got ${JSON.stringify(got)}`);
      }
      const nagpur = await closingOf("GOVERNMENTMEDICALCOLLEGENAGPUR", mdAnaes, 2026, "R1", "All India");
      const total = nagpur.reduce((a, c) => a + c.n, 0);
      const obc = nagpur.filter((c) => c.category === "OBC").map((c) => c.closingRank);
      if (total !== 12 || obc.length !== 1 || obc[0] !== 17213) bad.push(`GMC Nagpur 2026 R1: n=${total}, OBC=${obc}`);
      const kokilaStray = await tx.allotment.count({
        where: { counsellingYear: 2025, round: "stray", quota: "DNB Quota", category: "Open", rank: 33685, collegeSpecialty: { college: { key: { startsWith: kokila } }, specialty: { slug: dnbAnaes } } },
      });
      if (kokilaStray !== 1) bad.push(`Kokilaben 2025 stray Open allotment at rank 33685: ${kokilaStray} rows`);
      const nagpurSeats = await tx.allotment.count({
        where: { counsellingYear: 2026, round: "R1", collegeSpecialty: { college: { key: { startsWith: "GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT" } }, specialty: { slug: mdAnaes } } },
      });
      if (nagpurSeats !== 12) bad.push(`GMC Nagpur 2026 R1 MD Anaesthesiology: ${nagpurSeats} allotment rows, expected 12`);
      const provisional2026R1 = await tx.dataSource.count({ where: { counsellingYear: 2026, round: "R1", provisional: true } });
      if (provisional2026R1) bad.push(`2026 R1: ${provisional2026R1} provisional source(s) left`);
      // every seat list adds up to the file's total, one list (one kind) at a time; links exactly where the course exists
      const dbLists = await tx.$queryRaw<{ key: string; total: number; sum: number | null; n: number }[]>`
        SELECT d.key, s.total, SUM(c.seats)::int AS sum, COUNT(c.id)::int AS n
        FROM "SeatSource" s JOIN "DataSource" d ON d.id = s."sourceId" LEFT JOIN "SeatCount" c ON c."seatSourceId" = s."sourceId" GROUP BY 1, 2`;
      for (const s of seatSources) {
        const got = dbLists.find((l) => l.key === s.key);
        const want = { total: listTotal.get(s.key), rows: seats.filter((x) => x.src === s.key).length };
        if (!got || got.total !== want.total || got.sum !== want.total || got.n !== want.rows) bad.push(`seat list ${s.key}: file Σ ${want.total} in ${want.rows} rows, DB ${JSON.stringify(got)}`);
      }
      // A virtual vacancy of the newest round is a seat someone holds from an earlier round of that year, so it has an
      // allotment there on its own college, course, quota and seat category; one institute under two keys breaks this.
      const order = (s: (typeof seatSources)[number]) => s.year * 10 + mccRounds.indexOf(s.round);
      const newest = seatSources.filter((s) => s.kind === "virtual").sort((a, b) => order(b) - order(a))[0];
      if (newest) {
        const earlier = mccRounds.slice(0, mccRounds.indexOf(newest.round));
        const [{ n, seats: held }] = await tx.$queryRaw<{ n: number; seats: number | null }[]>`
          SELECT COUNT(*)::int AS n, SUM(x.seats)::int AS seats
          FROM "SeatCount" x JOIN "DataSource" d ON d.id = x."seatSourceId"
          WHERE d.key = ${newest.key} AND NOT EXISTS (
            SELECT 1 FROM "Cutoff" u JOIN "CollegeSpecialty" p ON p.id = u."collegeSpecialtyId"
            WHERE p."collegeId" = x."collegeId" AND p."specialtyId" = x."specialtyId" AND u.quota = x.quota AND u.category = x.category
              AND u."counsellingYear" = ${newest.year} AND u.round = ANY(${earlier}))`;
        if (n) bad.push(`${newest.key}: ${n} virtual vacancy rows (${held} seats) have no ${newest.year} ${earlier.join("/")} allotment on their college, course, quota and seat category (one institute under two keys?)`);
      }
      const wantLinked = seats.filter((x) => pairKeys.has(`${x.ikey}|${courseSlug.get(`${x.degree}|${x.specialty}`)}`)).length;
      const linked = await tx.seatCount.count({ where: { collegeSpecialtyId: { not: null } } });
      if (linked !== wantLinked) bad.push(`seat rows linked to a course at a college: ${linked}, expected ${wantLinked}`);
      for (const [y, v] of Object.entries(scoreRank?.years ?? {})) {
        const [score, best] = v.rows[0];
        const got = await tx.scoreRank.findUnique({ where: { year_score: { year: +y, score } } });
        if (got?.bestRank !== best) bad.push(`score_rank ${y}: top score ${score} → rank ${got?.bestRank}, file ${best}`);
      }

      const counts = {
        resultSources: await tx.dataSource.count({ where: { round: { not: null } } }),
        sources: await tx.dataSource.count(),
        colleges: await tx.college.count(),
        specialties: await tx.specialty.count(),
        collegeSpecialties: await tx.collegeSpecialty.count(),
        cutoffs: await tx.cutoff.count(),
        terms: await tx.collegeTerm.count(),
        allotments: await tx.allotment.count(),
        seatSources: await tx.seatSource.count(),
        seatCounts: await tx.seatCount.count(),
        announcements: await tx.announcement.count(),
        roundSteps: await tx.roundStep.count(),
        meritLists: await tx.meritList.count(),
        scoreRanks: await tx.scoreRank.count(),
        meritPositions: await tx.meritPosition.count(),
      };
      const want = {
        resultSources: sources.length,
        colleges: colleges.length + seatColleges.length,
        specialties: courses.length,
        collegeSpecialties: pairs.size,
        cutoffs: cutoffs.length,
        terms: terms.length,
        allotments: allotments.length,
        seatSources: seatSources.length,
        seatCounts: seats.length,
        announcements: notices.length,
        roundSteps: steps.length,
        meritLists: nbems.size,
        scoreRanks: scoreRows.length,
        meritPositions: meritRows.length,
      };
      for (const [k, n] of Object.entries(want)) if (counts[k as keyof typeof counts] !== n) bad.push(`${k} in DB ${counts[k as keyof typeof counts]} != bundle ${n}`);
      const accountsAfter = await accounts();
      if (accountsAfter !== accountsBefore) bad.push(`User/Session/WaitlistEntry counts changed: ${accountsBefore} -> ${accountsAfter}`);
      if (bad.length) throw new Error(`Spot checks FAILED, import rolled back (nothing written):\n${bad.join("\n")}`);

      const marker = { name: `MCC export bundle (built ${manifest.built})`, type: "OFFICIAL" as const, createdAt: new Date() };
      await tx.dataSource.upsert({ where: { key: MARKER }, create: { key: MARKER, ...marker }, update: marker });
      return { ...counts, removed: { colleges: goneColleges.length, specialties: goneSpecialties.length, collegeSpecialties: gonePairs.length, sources: goneSources.count, residents: goneResidents }, accounts: accountsAfter };
    },
    // RepeatableRead: the account counts are this transaction's own view, so a sign-in meanwhile doesn't abort it.
    { timeout: 1_800_000, maxWait: 60_000, isolationLevel: "RepeatableRead" },
  );
  console.log(result);
  if (unknownCourses.size) console.log(`Seat rows with a course not in courses.json (kept, no Specialty link): ${[...unknownCourses].join(", ")}`);
  if (result.removed.residents) console.warn(`${result.removed.residents} resident row(s) went with their college or course: run npm run db:import-residents.`);
  console.log("Committed. Spot checks passed (Kokilaben DNB Anaesthesiology 2025 R1–stray + 2026 R1 and its stray allotment; GMC Nagpur 2026 R1 closing and 12 allotments; no provisional 2026 R1; every seat list adds up to its file; every newest virtual vacancy has an earlier allotment; NBEMS top scores).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
