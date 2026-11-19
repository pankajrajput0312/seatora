// Imports the MCC export bundle (neetpg-planner `python3 -I tools/export_medpath.py` → data/medpath-r3/; schema 2, or 1;
// schema 3 = 2 plus manifest.exam).
// Usage: npm run db:import [-- [--exam <key>] <bundle dir>]   (default ../neetpg-planner/data/medpath-r3, or MCC_BUNDLE;
// exam: --exam, else manifest.exam, else neet-pg; src/features/exams/keys.ts)
// One exam per run: everything below is that exam's rows only, so importing one exam leaves every other exam's as it was.
// Colleges are shared (one row per institute): NEET PG's import writes its colleges' fields; another exam's writes only
// the colleges no other exam has (new, or its own alone), never a row another exam has. An exam's colleges are its CollegeExam rows, and a
// college goes only when no exam has it. Exams other than neet-pg may leave out the optional files (seats, terms, fees,
// clinical facts, notices, round status, NBEMS aggregates, aliases), and leave a choice number or candidate category null
// where their PDFs print none.
// Validates everything first and aborts on any error; then, in one transaction, makes the database match the bundle:
// upserts sources, colleges (incl. the seat-list-only ones) and specialties, replaces cutoffs, allotments, terms, seat
// lists, notices, round steps, the NBEMS score/merit aggregates and (schema 2) clinical facts and the per-year fee table,
// removes the colleges, courses and sources the
// bundle no longer has, and records the college keys it retired (key_aliases.json → RetiredCollegeKey, kept across
// imports: old links and saved option ids reach the college they became). Spot checks run before the commit.
// Re-running the same bundle is a no-op in effect. Every file and summary file is hash- and count-checked against the manifest.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  citedSources,
  clinicalValuePaths,
  mccAllotmentSchema,
  mccAllotmentV2LooseSchema,
  mccAllotmentV2Schema,
  mccCategories,
  mccClinicalFactsSchema,
  mccCollegeSchema,
  mccCollegeV2LooseSchema,
  mccCollegeV2Schema,
  mccProfileSnapshots,
  mccCourseSchema,
  mccCutoffSchema,
  mccFeesStructuredSchema,
  mccManifestSchema,
  mccRounds,
  mccSourceSchema,
  mccTermSchema,
  movedPlaces,
  sessionSchemas,
  sourceKey,
  termSourceName,
  yearSchema,
  type MccAllotment,
  type MccAllotmentV2,
  type MccCollege,
  type MccCollegeV2,
} from "../src/features/cutoffs/lib/import-schema.ts";
import { noticeKinds, roundSteps, seatKinds, stepStatuses } from "../src/features/decide/types.ts";
import { DEFAULT_EXAM, examKeys, isExam, markerKey, ranksPerGroup, sessionExams } from "../src/features/exams/keys.ts";

const args = process.argv.slice(2);
const examAt = args.indexOf("--exam");
const examArg = examAt >= 0 ? args.splice(examAt, 2)[1] : undefined;
const dir = resolve(args[0] ?? process.env.MCC_BUNDLE ?? "../neetpg-planner/data/medpath-r3");
const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// ---------- 1. verify and validate the whole bundle before touching the database ----------
const manifestJson = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const manifest = mccManifestSchema.parse(manifestJson);
const exam = examArg ?? manifest.exam ?? DEFAULT_EXAM;
if (!isExam(exam)) throw new Error(`Unknown exam "${exam}": one of ${examKeys.join(", ")}`);
if (examArg && manifest.exam && examArg !== manifest.exam) throw new Error(`--exam ${examArg}, but the bundle is ${manifest.exam}'s`);
const pg = exam === DEFAULT_EXAM;
/** Its years are session codes (INI-CET: 20261 = January 2026); every other exam's are calendar years, as before. */
const sessions = sessionExams.includes(exam);
/** Schema 2 adds college MCC ids / profile / type / website, allotment candidate category / option no / previous seat, clinical facts, the fee table. */
const v2 = manifest.schema_version >= 2;
const fileEntry = z.object({ count: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const summarySchema = z.object({ "round_status.json": fileEntry, "score_rank.json": fileEntry, "merit_position.json": fileEntry }).strict();
// NEET PG's bundle has every file, as before; another exam's may leave the optional ones out (manifest and files alike).
const summaryFiles = pg ? summarySchema.parse(manifestJson.summary_files) : summarySchema.partial().parse(manifestJson.summary_files ?? {});
const REQUIRED = new Set(["sources.json", "colleges.ndjson", "courses.json", "cutoffs.ndjson", "allotments.ndjson"]);
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
    if (pg || REQUIRED.has(file)) fail(`${file}: missing from manifest`);
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

const sources = parse("sources.json", sessions ? sessionSchemas.source : mccSourceSchema);
// Partial: a schema 1 college has none of the schema 2 fields.
const parseColleges = (file: string): (MccCollege & Partial<MccCollegeV2>)[] => (v2 ? parse(file, pg ? mccCollegeV2Schema : mccCollegeV2LooseSchema) : parse(file, mccCollegeSchema));
const colleges = parseColleges("colleges.ndjson");
const courses = parse("courses.json", mccCourseSchema);
const cutoffs = parse("cutoffs.ndjson", sessions ? sessionSchemas.cutoff : mccCutoffSchema);
const terms = parse("terms.ndjson", mccTermSchema);
// A BOND whose status is unknown and has no document (src_url null): imported with its words (not checked yet, other
// colleges' terms, ask the college), its source the bond check itself (no document, no URL).
const BOND_CHECK = { key: "seatora/bond-check", name: "Seatora bond check (no document yet)", type: "THIRD_PARTY_RESEARCH" as const };
const allotments: (MccAllotment | MccAllotmentV2)[] = v2 ? parse("allotments.ndjson", pg ? mccAllotmentV2Schema : sessions ? sessionSchemas.allotment : mccAllotmentV2LooseSchema) : parse("allotments.ndjson", mccAllotmentSchema);
const clinical = v2 ? parse("clinical_facts.ndjson", mccClinicalFactsSchema) : [];
const feeTable = v2 ? parse("fees_structured.ndjson", mccFeesStructuredSchema) : [];

// Seat lists, notices, round steps, NBEMS aggregates. Strict like import-schema.ts: an extra key aborts.
const year = yearSchema(sessions);
const pos = z.number().int().positive();
const ikey = z.string().regex(/^[A-Z0-9]{1,40}(#(\d{6})?)?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const when = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\+05:30)?$/); // a date, or a date-time in IST, as printed
const nbemsKey = z.string().regex(/^nbems\/\d{4}\/[\w.-]+\.pdf$/);
const seatSourceSchema = z
  .object({ key: sourceKey(sessions), url: z.url(), year, round: z.enum(mccRounds), kind: z.enum(seatKinds), name: z.string().min(1) })
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
  if (!raw[file]) return null; // optional for this exam (summaryFiles)
  const r = schema.safeParse(JSON.parse(raw[file].toString("utf8")));
  if (!r.success) fail(`${file}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return r.success ? r.data : null;
}

const seatSources = parse("seat_sources.json", seatSourceSchema);
const seats = parse("seats.ndjson", seatSchema);
const seatColleges = parseColleges("seat_colleges.ndjson");
const notices = parse("notices.json", noticeSchema);
const roundStatus = parseOne("round_status.json", roundStatusSchema);
const scoreRank = parseOne("score_rank.json", scoreRankSchema);
const meritPosition = parseOne("merit_position.json", meritPositionSchema);
// Retired college keys → the key the college has now (null: gone). A key that held a person's name or e-mail comes only
// as its sha256, and is stored and matched as "sha256:<hex>" (its slug too), never in clear.
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const aliases = parse(
  "key_aliases.json",
  z.union([z.object({ old: ikey, new: ikey.nullable() }).strict(), z.object({ old_sha256: hex64, new: ikey.nullable() }).strict()]),
).map((a) => ({ oldKey: "old" in a ? a.old : `sha256:${a.old_sha256}`, newKey: a.new }));

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
// Schema 2: one candidate per rank, year and round; a previous seat (R2: R1's, R3: R2's) is that round's allotment of the same rank.
// NEET SS ranks are per question group (in the quota label): a candidate is a rank in a group, and one who moved to
// another group's course held a rank of the old group, so the previous seat must then be one allotted a round back.
const grouped = ranksPerGroup.includes(exam);
const PREV_ROUND: Record<string, string> = { R2: "R1", R3: "R2" };
const seatOf = (a: { ikey: string; degree: string; specialty: string; quota: string }) => [a.ikey, a.degree, a.specialty, a.quota].join("|");
const who = (a: { year: number; rank: number }, round: string, quota: string) => `${a.year}|${round}|${a.rank}${grouped ? `|${quota}` : ""}`;
const byRank = new Map(allotments.map((a) => [who(a, a.round, a.quota), a]));
const allottedSeats = new Set(grouped ? allotments.map((a) => `${a.year}|${a.round}|${seatOf(a)}`) : []);
if (v2 && byRank.size !== allotments.length) fail(`allotments.ndjson: ${allotments.length - byRank.size} rank(s) allotted twice in one year and round`);
allotments.forEach((a, i) => {
  if (!("prev_ikey" in a) || a.prev_ikey == null) return;
  const at = `allotments.ndjson:${i + 1}`;
  const prev = { ikey: a.prev_ikey, degree: a.prev_degree!, specialty: a.prev_specialty!, quota: a.prev_quota! };
  if (!collegeKeys.has(prev.ikey)) fail(`${at}: unknown previous college ${prev.ikey}`);
  if (!courseSlug.has(`${prev.degree}|${prev.specialty}`)) fail(`${at}: unknown previous course ${prev.degree} ${prev.specialty}`);
  const held = byRank.get(who(a, PREV_ROUND[a.round], prev.quota));
  if (grouped && !held && allottedSeats.has(`${a.year}|${PREV_ROUND[a.round]}|${seatOf(prev)}`)) return; // moved group
  if (!held || seatOf(held) !== seatOf(prev)) fail(`${at}: previous seat ${seatOf(prev)} is not rank ${a.rank}'s ${a.year} ${PREV_ROUND[a.round]} allotment (${held ? seatOf(held) : "none"})`);
});
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

// clinical facts: one per college of the bundle; every value has its source (values_meta), and every source a value
const clinicalKeys = new Set<string>();
clinical.forEach((r, i) => {
  const at = `clinical_facts.ndjson:${i + 1}`;
  if (!allCollegeKeys.has(r.key)) fail(`${at}: unknown college ${r.key}`);
  if (clinicalKeys.has(r.key)) fail(`${at}: ${r.key} twice`);
  clinicalKeys.add(r.key);
  const values = clinicalValuePaths(r);
  const meta = Object.keys(r.values_meta ?? {});
  for (const p of values) if (!meta.includes(p) && !meta.includes(p.split(".")[0])) fail(`${at}: ${p} has no values_meta`);
  for (const p of meta) if (!values.some((v) => v === p || v.startsWith(`${p}.`) || p.startsWith(`${v}.`))) fail(`${at}: values_meta ${p} has no value`);
});
// fee table: one per college × programme × seat-type group, each seat group once per programme, every cited source listed
const feeKeys = new Set<string>();
const feeGroups = new Set<string>();
feeTable.forEach((r, i) => {
  const at = `fees_structured.ndjson:${i + 1}`;
  if (!allCollegeKeys.has(r.key)) fail(`${at}: unknown college ${r.key}`);
  if (feeKeys.has(r.id)) fail(`${at}: ${r.id} twice`);
  feeKeys.add(r.id);
  for (const g of r.seat_groups) {
    if (feeGroups.has(`${r.key}|${r.programme}|${g}`)) fail(`${at}: seat group ${g} in two records of ${r.key} ${r.programme}`);
    feeGroups.add(`${r.key}|${r.programme}|${g}`);
  }
  const ns = new Set(r.sources.map((s) => s.n));
  if (ns.size !== r.sources.length) fail(`${at}: two sources with one n`);
  const missing = citedSources(r).filter((n) => !ns.has(n));
  if (missing.length) fail(`${at}: cites source(s) ${[...new Set(missing)].join(", ")} not in sources`);
});
// Schema 2 FEE / STIPEND terms are made from fees_structured.ndjson (the planner's fee_terms): a term must have fee-table
// records for its college + program, which are stored once, in FeesStructured, and attached back by the catalog. If a term
// still carries details.records (older exports), they must be exactly those records.
const BUCKET: Record<string, string> = { "MD/MS": "MD", Diploma: "MD", DNB: "DNB", "NBEMS Diploma": "DNB", MDS: "MD", "DM/MCh": "MD", "DrNB SS": "DNB" };
const feeById = new Map(feeTable.map((r) => [r.id, JSON.stringify(r)]));
const feeIdsOf = Map.groupBy(feeTable, (r) => `${r.key}|${BUCKET[r.programme]}`);
terms.forEach((t, i) => {
  const at = `terms.ndjson:${i + 1}`;
  if (v2 && (t.kind === "FEE" || t.kind === "STIPEND") && !feeIdsOf.get(`${t.ikey}|${t.program}`)?.length) fail(`${at}: a schema 2 ${t.kind} has no fee-table records for ${t.ikey} ${t.program}`);
  if (!t.details || !("records" in t.details)) return;
  const ids = t.details.records.map((r) => r.id);
  const want = (feeIdsOf.get(`${t.ikey}|${t.program}`) ?? []).map((r) => r.id);
  if (ids.length !== want.length || !want.every((id) => ids.includes(id))) fail(`${at}: details.records are not ${t.ikey} ${t.program}'s fee-table records (${ids.length} of ${want.length})`);
  for (const r of t.details.records) if (feeById.get(r.id) !== JSON.stringify(r)) fail(`${at}: details.records ${r.id} differs from fees_structured.ndjson`);
});

// retired keys: each once, none a key of this bundle (in clear or hashed), each pointing at a college this bundle has
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const retiredTo = new Map(aliases.map((a) => [a.oldKey, a.newKey]));
if (retiredTo.size !== aliases.length) fail("key_aliases.json: a retired key twice");
const hashedKeys = new Set([...allCollegeKeys].map((k) => `sha256:${sha(k)}`));
for (const a of aliases) {
  if (allCollegeKeys.has(a.oldKey) || hashedKeys.has(a.oldKey)) fail(`key_aliases.json: ${a.oldKey} is retired but still a college key`);
  if (a.newKey != null && !allCollegeKeys.has(a.newKey)) fail(`key_aliases.json: ${a.oldKey} -> unknown college ${a.newKey}`);
}
/** RetiredCollegeKey.oldKey of a key this bundle retired (the key, or its hash), else null. */
const retiredAs = (k: string) => (retiredTo.has(k) ? k : retiredTo.has(`sha256:${sha(k)}`) ? `sha256:${sha(k)}` : null);

// notices: DataSource key = URL, so URLs are unique. A notice may also be a term document (the PG Information Bulletin
// holds the AFMS bond): both share that one DataSource row, named and dated as the notice.
const termUrls = new Set(terms.flatMap((t) => (t.src_url ? [t.src_url] : [])));
const noticeByUrl = new Map(notices.map((n) => [n.url, n]));
if (noticeByUrl.size !== notices.length) fail("notices.json: duplicate url");

// round steps
const steps = roundStatus
  ? Object.entries(roundStatus.rounds).flatMap(([round, st]) => roundSteps.map((step) => ({ round, step, ...st![step] })))
  : [];
if (roundStatus && steps.length !== summaryFiles["round_status.json"]?.count) fail(`round_status.json: ${steps.length} steps, manifest says ${summaryFiles["round_status.json"]?.count}`);

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
if (scoreRows.length !== (summaryFiles["score_rank.json"]?.count ?? 0)) fail(`score_rank.json: ${scoreRows.length} rows, manifest says ${summaryFiles["score_rank.json"]?.count}`);
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
if (meritRowCount !== (summaryFiles["merit_position.json"]?.count ?? 0)) fail(`merit_position.json: ${meritRowCount} rows, manifest says ${summaryFiles["merit_position.json"]?.count}`);

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
// Written last in the transaction, so it changes only when an import commits: the data version (one per exam) that
// src/features/decide/server/catalog.ts checks on every request.
const MARKER = markerKey(exam);
/** DataSource keys are unique per exam. */
const sk = (key: string) => ({ exam_key: { exam, key } });

async function main() {
  const result = await db.$transaction(
    async (tx) => {
      // Accounts are never touched by this import; counted so a bug here rolls back instead of costing one.
      const accounts = async () => (await Promise.all([tx.user.count(), tx.session.count(), tx.waitlistEntry.count()])).join("/");
      const accountsBefore = await accounts();

      // Every college with the exams that have it. One another exam has stays whatever this bundle says (live).
      const dbColleges = (await tx.college.findMany({ select: { id: true, key: true, slug: true, pincode: true, exams: { select: { exam: true } } } })).map((c) => ({
        ...c,
        exams: c.exams.map((e) => e.exam),
      }));
      const othersHave = (c: { exams: string[] }) => c.exams.some((e) => e !== exam);
      const liveKeys = new Set([...allCollegeKeys, ...dbColleges.filter(othersHave).map((c) => c.key)]);
      const liveHashed = [...liveKeys].map((k) => `sha256:${sha(k)}`);
      // A key this bundle retires that another exam still has: that exam's bundle must retire it too (one key per institute).
      const stillUsed = aliases.filter((a) => liveKeys.has(a.oldKey) || liveHashed.includes(a.oldKey)).map((a) => a.oldKey);
      // Colleges under a key this bundle retired, before their rows go: their slugs (old links redirect) and what the
      // bundle now has under the new key instead (cutoffs, allotments, seat lines, residents moved).
      const retiredNow = dbColleges.flatMap((c) => {
        const oldKey = !liveKeys.has(c.key) && retiredAs(c.key);
        return oldKey ? [{ ...c, oldKey }] : [];
      });
      const ofRetired = { collegeId: { in: retiredNow.map((c) => c.id) } };
      const moved = {
        colleges: retiredNow.length,
        cutoffs: await tx.cutoff.count({ where: { exam, collegeSpecialty: ofRetired } }),
        allotments: await tx.allotment.count({ where: { exam, collegeSpecialty: ofRetired } }),
        seatCounts: await tx.seatCount.count({ where: ofRetired }),
        residents: await tx.resident.count({ where: ofRetired }),
      };

      // remove what the bundle replaces or no longer has, of this exam only. Cutoffs, allotments, terms, seat lists,
      // notices, round steps and the NBEMS aggregates have no other source.
      // Key diffs are done here, not as NOT IN in SQL: that plan (NOT IN + nested NOT EXISTS over 133k cutoffs) can run for many minutes.
      await tx.cutoff.deleteMany({ where: { exam } });
      await tx.allotment.deleteMany({ where: { exam } });
      await tx.collegeTerm.deleteMany({ where: { exam } });
      await tx.$executeRaw`DELETE FROM "SeatCount" x USING "DataSource" d WHERE d.id = x."seatSourceId" AND d.exam = ${exam}`;
      await tx.announcement.deleteMany({ where: { exam } });
      await tx.roundStep.deleteMany({ where: { exam } });
      await tx.scoreRank.deleteMany({ where: { exam } });
      await tx.meritPosition.deleteMany({ where: { exam } });
      await tx.$executeRaw`DELETE FROM "ClinicalFacts" WHERE exam = ${exam}`;
      await tx.$executeRaw`DELETE FROM "FeesStructured" WHERE exam = ${exam}`;
      const slugs = new Set(courses.map((c) => c.slug));
      const pairKeys = new Set(cutoffs.map((c) => `${c.ikey}|${courseSlug.get(`${c.degree}|${c.specialty}`)}`));
      const oldPairs = await tx.collegeSpecialty.findMany({ where: { specialty: { exam } }, select: { id: true, college: { select: { key: true } }, specialty: { select: { slug: true } } } });
      const gonePairs = oldPairs.filter((p) => !pairKeys.has(`${p.college.key}|${p.specialty.slug}`)).map((p) => p.id);
      const goneColleges = dbColleges.filter((c) => !liveKeys.has(c.key)).map((c) => c.id);
      // Colleges this exam had that only other exams keep now (their CollegeExam row of this exam goes below).
      const leftColleges = dbColleges.filter((c) => c.exams.includes(exam) && !allCollegeKeys.has(c.key) && othersHave(c)).map((c) => c.id);
      const goneSpecialties = (await tx.specialty.findMany({ where: { exam }, select: { id: true, slug: true } })).filter((s) => !slugs.has(s.slug)).map((s) => s.id);
      // Residents (NEET PG's) of a removed college (cascade), of one NEET PG no longer has, or of a removed course go too;
      // import-residents re-adds them under the new key or course, and their hides live on in HiddenResident.
      const residentsOut = { OR: [{ collegeId: { in: pg ? [...goneColleges, ...leftColleges] : goneColleges } }, { specialtyId: { in: goneSpecialties } }] };
      const goneResidents = await tx.resident.count({ where: residentsOut });
      await tx.collegeSpecialty.deleteMany({ where: { id: { in: gonePairs } } });
      await tx.resident.deleteMany({ where: residentsOut });
      await tx.college.deleteMany({ where: { id: { in: goneColleges } } });
      await tx.specialty.deleteMany({ where: { id: { in: goneSpecialties } } });

      // sources: allotment PDFs, plus one per distinct term URL
      const sourceId = new Map<string, string>();
      for (const s of sources) {
        const data = { name: s.name, url: s.url, type: "OFFICIAL" as const, counsellingYear: s.year, round: s.round, provisional: s.provisional };
        const row = await tx.dataSource.upsert({ where: sk(s.key), create: { exam, key: s.key, ...data }, update: data, select: { id: true } });
        sourceId.set(s.key, row.id);
      }
      for (const url of termUrls) {
        const name = termSourceName(url);
        const row = await tx.dataSource.upsert({ where: sk(url), create: { exam, key: url, name, url, type: "OFFICIAL" }, update: { name, url }, select: { id: true } });
        sourceId.set(url, row.id);
      }
      const check = await tx.dataSource.upsert({ where: sk(BOND_CHECK.key), create: { exam, ...BOND_CHECK }, update: { name: BOND_CHECK.name, type: BOND_CHECK.type }, select: { id: true } });
      sourceId.set(BOND_CHECK.key, check.id);
      // Another exam's fee table: the MCC institute-profile snapshots it was made from (manifest.sources), as its fee source.
      if (!pg && feeTable.length)
        for (const s of mccProfileSnapshots(manifestJson.sources)) {
          const data = { name: s.name, url: s.url, type: "OFFICIAL" as const, counsellingYear: s.year, round: null, publishedAt: s.fetched ? new Date(`${s.fetched}T00:00:00Z`) : null };
          const row = await tx.dataSource.upsert({ where: sk(s.key), create: { exam, key: s.key, ...data }, update: data, select: { id: true } });
          sourceId.set(s.key, row.id);
        }
      // seat list PDFs: round stays null on the DataSource (year, round, kind on SeatSource), so the catalog never takes
      // one for an allotment result. Dated by the MCC notice that links the PDF, else no date.
      for (const s of seatSources) {
        const date = noticeByUrl.get(s.url)?.date;
        const data = { name: s.name, url: s.url, type: "OFFICIAL" as const, counsellingYear: s.year, round: null, provisional: false, publishedAt: date ? new Date(`${date}T00:00:00Z`) : null };
        const row = await tx.dataSource.upsert({ where: sk(s.key), create: { exam, key: s.key, ...data }, update: data, select: { id: true } });
        const list = { year: s.year, round: s.round, kind: s.kind, total: listTotal.get(s.key)! };
        await tx.seatSource.upsert({ where: { sourceId: row.id }, create: { sourceId: row.id, ...list }, update: list });
        sourceId.set(s.key, row.id);
      }
      // notices: one DataSource per notice (key = its URL), as for term documents
      for (const n of notices) {
        const data = { name: n.title, url: n.url, type: "OFFICIAL" as const, counsellingYear: n.year, publishedAt: new Date(`${n.date}T00:00:00Z`) };
        const row = await tx.dataSource.upsert({ where: sk(n.url), create: { exam, key: n.url, ...data }, update: data, select: { id: true } });
        sourceId.set(n.url, row.id);
      }
      // NBEMS result PDFs behind score→rank and merit position; name from the exporter's coverage note ("AIQ 50% merit list")
      for (const l of nbems.values()) {
        const data = { name: `NBEMS NEET PG ${l.year} ${l.coverage.split(",")[0]}`, url: l.url, type: "OFFICIAL" as const, counsellingYear: l.year };
        const row = await tx.dataSource.upsert({ where: sk(l.key), create: { exam, key: l.key, ...data }, update: data, select: { id: true } });
        const list = { exam, year: l.year, maxMarks: l.maxMarks, candidates: l.candidates, coverage: l.coverage, noticeUrl: l.noticeUrl, step: l.step, qualified: l.qualified ?? Prisma.DbNull };
        await tx.meritList.upsert({ where: { sourceId: row.id }, create: { sourceId: row.id, ...list }, update: list });
        sourceId.set(l.key, row.id);
      }

      // colleges: slug is set once at creation and never changed, so URLs stay stable. Seat-list-only colleges get the
      // earliest seat list they appear in as source. Another exam than NEET PG writes only the colleges no other exam has
      // (new ones, and its own: corrected names and types); a row another exam has (NEET PG's above all) is never changed
      // by it, only its id taken.
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
      const byKey = new Map(dbColleges.map((c) => [c.key, c]));
      const kept = (k: string) => !pg && byKey.has(k) && othersHave(byKey.get(k)!);
      const written = [...colleges, ...seatColleges].filter((c) => !kept(c.key));
      for (const c of [...colleges, ...seatColleges]) if (kept(c.key)) collegeId.set(c.key, byKey.get(c.key)!.id);
      for (const c of written) {
        const taken = slugOwner.has(baseSlug(c)) && slugOwner.get(baseSlug(c)) !== c.key;
        const slug = taken || slugCount.get(baseSlug(c))! > 1 ? `${baseSlug(c)}-${shortHash(c.key)}` : baseSlug(c);
        const data = { name: c.name, state: c.state, pincode: c.pincode, address: c.address, sourceId: sourceId.get(firstSource.get(c.key)!)! };
        const row = await tx.college.upsert({ where: { key: c.key }, create: { key: c.key, slug, ...data }, update: data, select: { id: true } });
        collegeId.set(c.key, row.id);
      }
      // Schema 2 college fields (a schema 1 bundle has none: cleared). Raw SQL: the shared generated client needn't know them.
      const extras = written.map((c) => ({
        id: collegeId.get(c.key)!,
        mccIds: c.mcc_ids ?? [],
        mccProfileUrl: c.mcc_profile_url ?? null,
        type: c.type?.value ?? null,
        typeBasis: c.type?.basis ?? null,
        website: c.website ?? null,
      }));
      await tx.$executeRaw`
        UPDATE "College" c SET "mccIds" = d."mccIds", "mccProfileUrl" = d."mccProfileUrl", type = d.type, "typeBasis" = d."typeBasis", website = d.website
        FROM jsonb_to_recordset(${JSON.stringify(extras)}::jsonb) AS d(id text, "mccIds" text[], "mccProfileUrl" text, type text, "typeBasis" text, website text)
        WHERE c.id = d.id`;
      // This exam's colleges (CollegeExam; College.updatedAt, the snapshot's fingerprint, stays as it is).
      const ids = [...collegeId.values()];
      await tx.collegeExam.deleteMany({ where: { exam, collegeId: { notIn: ids } } });
      await tx.collegeExam.createMany({ data: ids.map((collegeId) => ({ exam, collegeId })), skipDuplicates: true });
      // A college NEET PG no longer has that another exam keeps, whose source is NEET PG's: that source may go below, so it
      // takes the other exam's earliest result PDF. Another exam's import never changes a shared college: its source stays (below).
      if (pg && leftColleges.length)
        await tx.$executeRaw`
          UPDATE "College" c SET "sourceId" = (
            SELECT d.id FROM "DataSource" d JOIN "CollegeExam" e ON e.exam = d.exam AND e."collegeId" = c.id
            WHERE d.round IS NOT NULL ORDER BY d."counsellingYear", d.key LIMIT 1)
          WHERE c.id = ANY(${leftColleges}) AND c."sourceId" IN (SELECT id FROM "DataSource" WHERE exam = ${exam})`;

      // Retired keys, kept across imports (raw SQL: the shared generated client needn't know the table). A slug is
      // recorded once, when its college goes; a slug recorded before for another key moves to this one.
      const slugOf = new Map(retiredNow.map((c) => [c.oldKey, c.oldKey.startsWith("sha256:") ? `sha256:${sha(c.slug)}` : c.slug]));
      await tx.$executeRaw`UPDATE "RetiredCollegeKey" SET "oldSlug" = NULL WHERE "oldSlug" = ANY(${[...slugOf.values()]})`;
      await tx.$executeRaw`
        INSERT INTO "RetiredCollegeKey" ("oldKey", "oldSlug", "newKey")
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(aliases.map((a) => ({ ...a, oldSlug: slugOf.get(a.oldKey) ?? null })))}::jsonb) AS d("oldKey" text, "oldSlug" text, "newKey" text)
        ON CONFLICT ("oldKey") DO UPDATE SET "newKey" = EXCLUDED."newKey", "oldSlug" = COALESCE(EXCLUDED."oldSlug", "RetiredCollegeKey"."oldSlug")`;
      // Keys retired by earlier bundles: one that is a key again (of any exam) is not retired; the rest point at the key
      // their college has now (it was retired too) or at none (gone).
      await tx.$executeRaw`DELETE FROM "RetiredCollegeKey" WHERE "oldKey" = ANY(${[...liveKeys, ...liveHashed]})`;
      const stale = (await tx.$queryRaw<{ oldKey: string; newKey: string }[]>`SELECT "oldKey", "newKey" FROM "RetiredCollegeKey" WHERE "newKey" IS NOT NULL`)
        .filter((r) => !liveKeys.has(r.newKey))
        .map((r) => ({ oldKey: r.oldKey, newKey: retiredTo.get(retiredAs(r.newKey) ?? "") ?? null }));
      await tx.$executeRaw`
        UPDATE "RetiredCollegeKey" r SET "newKey" = d."newKey"
        FROM jsonb_to_recordset(${JSON.stringify(stale)}::jsonb) AS d("oldKey" text, "newKey" text) WHERE r."oldKey" = d."oldKey"`;
      // HiddenResident is by place (PIN code, or the key of a college without one): a hide at a college's old place also
      // covers its new one when that differs (a kept college given a PIN, or a retired college's successor elsewhere;
      // the old row stays: it may cover others too).
      const placeOf = new Map(written.map((c) => [c.key, c.pincode ?? c.key]));
      const moves = movedPlaces(dbColleges, placeOf, (k) => {
        const old = retiredAs(k);
        return old ? retiredTo.get(old) : k;
      });
      const hidesCopied = await tx.$executeRaw`
        INSERT INTO "HiddenResident" ("name", "place")
        SELECT h."name", d."to" FROM "HiddenResident" h JOIN jsonb_to_recordset(${JSON.stringify(moves)}::jsonb) AS d("from" text, "to" text) ON h."place" = d."from"
        ON CONFLICT DO NOTHING`;

      // result PDFs and term documents no longer in the bundle (e.g. a provisional result the final one replaced): nothing
      // references them any more. Admitted-list sources (no round, written by import-residents), the marker and a source
      // a college another exam keeps still names stay.
      const goneSources = await tx.dataSource.deleteMany({
        where: { exam, OR: [{ round: { not: null } }, { key: { startsWith: "http" } }, { key: { startsWith: "raw/profiles_" } }, { seatSource: { isNot: null } }, { meritList: { isNot: null } }], key: { notIn: [...sourceId.keys()] }, colleges: { none: {} } },
      });

      const specialtyId = new Map<string, string>();
      for (const c of courses) {
        const data = { name: c.name, degree: c.degree, code: c.specialty };
        const row = await tx.specialty.upsert({ where: { exam_slug: { exam, slug: c.slug } }, create: { exam, slug: c.slug, ...data }, update: data, select: { id: true } });
        specialtyId.set(`${c.degree}|${c.specialty}`, row.id);
      }

      const pairs = new Map<string, { collegeId: string; specialtyId: string }>();
      for (const c of cutoffs) {
        const p = { collegeId: collegeId.get(c.ikey)!, specialtyId: specialtyId.get(`${c.degree}|${c.specialty}`)! };
        pairs.set(`${p.collegeId}|${p.specialtyId}`, p);
      }
      await tx.collegeSpecialty.createMany({ data: [...pairs.values()], skipDuplicates: true });
      const csId = new Map(
        (await tx.collegeSpecialty.findMany({ where: { specialty: { exam } }, select: { id: true, collegeId: true, specialtyId: true } })).map((r) => [`${r.collegeId}|${r.specialtyId}`, r.id]),
      );

      const csOf = (c: { ikey: string; degree: string; specialty: string }) => csId.get(`${collegeId.get(c.ikey)}|${specialtyId.get(`${c.degree}|${c.specialty}`)}`)!;
      for (const s of sources) {
        const rows = cutoffs.filter((c) => c.src === s.key);
        const seats = allotments.filter((a) => a.src === s.key);
        const id = sourceId.get(s.key)!;
        for (let i = 0; i < rows.length; i += 5000) {
          await tx.cutoff.createMany({
            data: rows.slice(i, i + 5000).map((c) => ({
              exam,
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
        // Raw SQL with the schema 2 columns (null from a schema 1 bundle), which the shared generated client needn't know.
        for (let i = 0; i < seats.length; i += 3000) {
          const data = seats.slice(i, i + 3000).map((a) => {
            const v = "candidate_category" in a ? a : null;
            return {
              cs: csOf(a),
              y: a.year,
              r: a.round,
              k: a.rank,
              q: a.quota,
              c: a.category,
              st: a.status,
              cc: v?.candidate_category ?? null,
              o: v?.option_no ?? null,
              pc: v?.prev_ikey ? collegeId.get(v.prev_ikey)! : null,
              ps: v?.prev_ikey ? specialtyId.get(`${v.prev_degree}|${v.prev_specialty}`)! : null,
              pq: v?.prev_quota ?? null,
              pr: v?.prev_remark ?? null,
            };
          });
          await tx.$executeRaw`
            INSERT INTO "Allotment" (id, exam, "collegeSpecialtyId", "counsellingYear", round, rank, quota, category, status, "sourceId",
              "candidateCategory", "optionNo", "prevCollegeId", "prevSpecialtyId", "prevQuota", "prevRemark")
            SELECT gen_random_uuid()::text, ${exam}, d.cs, d.y, d.r, d.k, d.q, d.c, d.st, ${id}, d.cc, d.o, d.pc, d.ps, d.pq, d.pr
            FROM jsonb_to_recordset(${JSON.stringify(data)}::jsonb)
              AS d(cs text, y int, r text, k int, q text, c text, st text, cc text, o int, pc text, ps text, pq text, pr text)`;
        }
        console.log(`${s.key}: ${rows.length} cutoffs, ${seats.length} allotments`);
      }

      // ponytail: this bundle is its exam's only term source; scope the delete above by source once a second one exists.
      await tx.collegeTerm.createMany({
        data: terms.map((t) => ({
          exam,
          collegeId: collegeId.get(t.ikey)!,
          program: t.program,
          kind: t.kind,
          text: t.text,
          amountInr: t.amount_inr,
          sourceId: sourceId.get(t.src_url ?? BOND_CHECK.key)!,
        })),
      });
      // BOND / PENALTY details (validated above): raw SQL, so the shared generated client needn't know the column yet.
      // FEE / STIPEND records are the fee table's (checked above), stored there only.
      const details = terms.flatMap((t) => (t.details && !("records" in t.details) ? [{ collegeId: collegeId.get(t.ikey)!, program: t.program, kind: t.kind, details: t.details }] : []));
      await tx.$executeRaw`
        UPDATE "CollegeTerm" t SET details = d.details
        FROM jsonb_to_recordset(${JSON.stringify(details)}::jsonb) AS d("collegeId" text, program text, kind text, details jsonb)
        WHERE t.exam = ${exam} AND t."collegeId" = d."collegeId" AND t.program = d.program AND t.kind::text = d.kind`;

      // schema 2: clinical facts (one row per college) and the fee table (per programme and seat-type group), as JSONB
      const facts = clinical.map(({ key, nbems_disclosure: d, ...data }) => ({ collegeId: collegeId.get(key)!, data, status: d.status, url: d.url ?? null, checked: d.checked ?? null }));
      await tx.$executeRaw`
        INSERT INTO "ClinicalFacts" (exam, "collegeId", data, "disclosureStatus", "disclosureUrl", "checkedAt")
        SELECT ${exam}, d."collegeId", d.data, d.status, d.url, d.checked::date
        FROM jsonb_to_recordset(${JSON.stringify(facts)}::jsonb) AS d("collegeId" text, data jsonb, status text, url text, checked text)`;
      for (let i = 0; i < feeTable.length; i += 500) {
        // data: the record without what the row's own columns and College hold
        const rows = feeTable.slice(i, i + 500).map((r) => ({
          collegeId: collegeId.get(r.key)!,
          programme: r.programme,
          quotaGroup: r.seat_groups.join("+"),
          data: Object.fromEntries(Object.entries(r).filter(([k]) => !["id", "key", "college", "state", "programme", "seat_groups"].includes(k))),
        }));
        await tx.$executeRaw`
          INSERT INTO "FeesStructured" (exam, "collegeId", programme, "quotaGroup", data)
          SELECT ${exam}, d."collegeId", d.programme, d."quotaGroup", d.data
          FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS d("collegeId" text, programme text, "quotaGroup" text, data jsonb)`;
      }

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
        data: notices.map((n) => ({ exam, title: n.title, authority: n.authority, category: n.kind, counsellingYear: n.year, round: n.round, publishedAt: new Date(`${n.date}T00:00:00Z`), officialUrl: n.url, sourceId: sourceId.get(n.url)! })),
      });
      await tx.roundStep.createMany({
        data: steps.map((st) => ({
          exam,
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
      await tx.scoreRank.createMany({ data: scoreRows.map((r) => ({ exam, ...r, listId: listIdOf(r.year) })) });
      await tx.meritPosition.createMany({ data: meritRows.map((r) => ({ exam, ...r, listId: listIdOf(r.year) })) });

      // ---------- 3. re-assert known values before committing; any failure rolls the whole import back ----------
      const bad: string[] = [];
      if (stillUsed.length) bad.push(`key_aliases.json retires ${stillUsed.join(", ")}, which another exam's import still has: re-export that exam with the same aliases first`);
      // NEET PG's known values; every exam's bundle gets the generic checks below.
      if (pg) {
        const closingOf = async (prefix: string, slug: string, year: number, round: string, quota: string, category?: string) =>
          tx.cutoff.findMany({
            where: { exam, counsellingYear: year, round, quota, category, collegeSpecialty: { college: { key: { startsWith: prefix } }, specialty: { slug } } },
            select: { closingRank: true, category: true, n: true },
          });
        const kokila = "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8";
        const expected: [number, string, number][] = [[2025, "R1", 21699], [2025, "R2", 25059], [2025, "R3", 29892], [2025, "stray", 33685], [2026, "R1", 20132]];
        const dnbAnaes = courseSlug.get("DNB|ANAESTHESIOLOGY")!;
        const mdAnaes = courseSlug.get("MD|ANAESTHESIOLOGY")!;
        for (const [y, r, want] of expected) {
          const got = await closingOf(kokila, dnbAnaes, y, r, "DNB Quota", "Open");
          if (got.length !== 1 || got[0].closingRank !== want) bad.push(`Kokilaben ${y} ${r}: expected ${want}, got ${JSON.stringify(got)}`);
        }
        const nagpur = await closingOf("GOVERNMENTMEDICALCOLLEGENAGPUR", mdAnaes, 2026, "R1", "All India");
        const total = nagpur.reduce((a, c) => a + c.n, 0);
        const obc = nagpur.filter((c) => c.category === "OBC").map((c) => c.closingRank);
        if (total !== 12 || obc.length !== 1 || obc[0] !== 17213) bad.push(`GMC Nagpur 2026 R1: n=${total}, OBC=${obc}`);
        const kokilaStray = await tx.allotment.count({
          where: { exam, counsellingYear: 2025, round: "stray", quota: "DNB Quota", category: "Open", rank: 33685, collegeSpecialty: { college: { key: { startsWith: kokila } }, specialty: { slug: dnbAnaes } } },
        });
        if (kokilaStray !== 1) bad.push(`Kokilaben 2025 stray Open allotment at rank 33685: ${kokilaStray} rows`);
        const nagpurSeats = await tx.allotment.count({
          where: { exam, counsellingYear: 2026, round: "R1", collegeSpecialty: { college: { key: { startsWith: "GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT" } }, specialty: { slug: mdAnaes } } },
        });
        if (nagpurSeats !== 12) bad.push(`GMC Nagpur 2026 R1 MD Anaesthesiology: ${nagpurSeats} allotment rows, expected 12`);
        const provisional2026R1 = await tx.dataSource.count({ where: { exam, counsellingYear: 2026, round: "R1", provisional: true } });
        if (provisional2026R1) bad.push(`2026 R1: ${provisional2026R1} provisional source(s) left`);
      }
      // every seat list adds up to the file's total, one list (one kind) at a time; links exactly where the course exists
      const dbLists = await tx.$queryRaw<{ key: string; total: number; sum: number | null; n: number }[]>`
        SELECT d.key, s.total, SUM(c.seats)::int AS sum, COUNT(c.id)::int AS n
        FROM "SeatSource" s JOIN "DataSource" d ON d.id = s."sourceId" LEFT JOIN "SeatCount" c ON c."seatSourceId" = s."sourceId" WHERE d.exam = ${exam} GROUP BY 1, 2`;
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
          WHERE d.exam = ${exam} AND d.key = ${newest.key} AND NOT EXISTS (
            SELECT 1 FROM "Cutoff" u JOIN "CollegeSpecialty" p ON p.id = u."collegeSpecialtyId"
            WHERE u.exam = ${exam} AND p."collegeId" = x."collegeId" AND p."specialtyId" = x."specialtyId" AND u.quota = x.quota AND u.category = x.category
              AND u."counsellingYear" = ${newest.year} AND u.round = ANY(${earlier}))`;
        if (n) bad.push(`${newest.key}: ${n} virtual vacancy rows (${held} seats) have no ${newest.year} ${earlier.join("/")} allotment on their college, course, quota and seat category (one institute under two keys?)`);
      }
      const wantLinked = seats.filter((x) => pairKeys.has(`${x.ikey}|${courseSlug.get(`${x.degree}|${x.specialty}`)}`)).length;
      const linked = await tx.seatCount.count({ where: { collegeSpecialtyId: { not: null }, seatSource: { source: { exam } } } });
      if (linked !== wantLinked) bad.push(`seat rows linked to a course at a college: ${linked}, expected ${wantLinked}`);
      for (const [y, v] of Object.entries(scoreRank?.years ?? {})) {
        const [score, best] = v.rows[0];
        const got = await tx.scoreRank.findUnique({ where: { exam_year_score: { exam, year: +y, score } } });
        if (got?.bestRank !== best) bad.push(`score_rank ${y}: top score ${score} → rank ${got?.bestRank}, file ${best}`);
      }

      // schema 2: every previous seat in the DB is that rank's allotment one round back (as checked in the file; NEET SS: an
      // allotment one round back), and (NEET PG) one known journey: 2023 rank 23, R1 LTMMC Mumbai MD General Medicine, upgraded in R2 to Seth GS (choice 1)
      if (v2) {
        const [{ n: prevBad }] = await tx.$queryRaw<{ n: number }[]>`
          SELECT COUNT(*)::int AS n FROM "Allotment" a WHERE a.exam = ${exam} AND a."prevCollegeId" IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "Allotment" b JOIN "CollegeSpecialty" p ON p.id = b."collegeSpecialtyId"
            WHERE b.exam = a.exam AND b."counsellingYear" = a."counsellingYear" AND (b.rank = a.rank OR ${grouped}) AND b.round = (CASE a.round WHEN 'R2' THEN 'R1' WHEN 'R3' THEN 'R2' END)
              AND p."collegeId" = a."prevCollegeId" AND p."specialtyId" = a."prevSpecialtyId" AND b.quota = a."prevQuota")`;
        if (prevBad) bad.push(`${prevBad} allotment(s) whose previous seat is not that rank's allotment one round back`);
      }
      if (v2 && pg) {
        const SETH_GS = "SETHGORDHANDASSUNDERDASMEDICALCOLLEGEMUM";
        const r23 = await tx.$queryRaw<{ c: string; s: string; st: string; o: number | null; cc: string | null; pc: string | null; ps: string | null; pr: string | null }[]>`
          SELECT c.key AS c, sp.slug AS s, a.status AS st, a."optionNo" AS o, a."candidateCategory" AS cc, pc.key AS pc, ps.slug AS ps, a."prevRemark" AS pr
          FROM "Allotment" a JOIN "CollegeSpecialty" p ON p.id = a."collegeSpecialtyId" JOIN "College" c ON c.id = p."collegeId" JOIN "Specialty" sp ON sp.id = p."specialtyId"
            LEFT JOIN "College" pc ON pc.id = a."prevCollegeId" LEFT JOIN "Specialty" ps ON ps.id = a."prevSpecialtyId"
          WHERE a.exam = ${exam} AND a."counsellingYear" = 2023 AND a.round = 'R2' AND a.rank = 23`;
        const gm = courseSlug.get("MD|GENERALMEDICINE");
        const j = r23[0];
        if (r23.length !== 1 || !j.c.startsWith(SETH_GS) || j.s !== gm || j.st !== "upgraded" || j.o !== 1 || j.cc !== "General" || !j.pc?.startsWith("LOKMANYATILAKMEDICALCOLLEGEMUMBAI") || j.ps !== gm || j.pr !== "reported")
          bad.push(`2023 R2 rank 23: ${JSON.stringify(r23)}`);
      }

      // every retired key of the bundle points where it says; no retired key points at a college the DB doesn't have
      const [retired] = await tx.$queryRaw<{ total: number; bundle: number; dangling: number; slugs: number }[]>`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "oldKey" = ANY(${aliases.map((a) => a.oldKey)}) AND "newKey" IS NOT DISTINCT FROM (${JSON.stringify(Object.fromEntries(retiredTo))}::jsonb ->> "oldKey"))::int AS bundle,
          COUNT(*) FILTER (WHERE "newKey" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "College" c WHERE c.key = "newKey"))::int AS dangling,
          COUNT("oldSlug")::int AS slugs
        FROM "RetiredCollegeKey"`;
      if (retired.bundle !== aliases.length || retired.dangling) bad.push(`retired keys: ${retired.bundle} of the bundle's ${aliases.length} as given, ${retired.dangling} pointing at no college`);

      // This exam's rows; the college fields of the colleges it wrote.
      const mine = written.map((c) => collegeId.get(c.key)!);
      const ofExam = { where: { exam } };
      const counts = {
        resultSources: await tx.dataSource.count({ where: { exam, round: { not: null } } }),
        sources: await tx.dataSource.count(ofExam),
        colleges: await tx.collegeExam.count(ofExam),
        specialties: await tx.specialty.count(ofExam),
        collegeSpecialties: await tx.collegeSpecialty.count({ where: { specialty: { exam } } }),
        cutoffs: await tx.cutoff.count(ofExam),
        terms: await tx.collegeTerm.count(ofExam),
        termDetails: (await tx.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "CollegeTerm" WHERE exam = ${exam} AND details IS NOT NULL`)[0].n,
        allotments: await tx.allotment.count(ofExam),
        seatSources: await tx.seatSource.count({ where: { source: { exam } } }),
        seatCounts: await tx.seatCount.count({ where: { seatSource: { source: { exam } } } }),
        announcements: await tx.announcement.count(ofExam),
        roundSteps: await tx.roundStep.count(ofExam),
        meritLists: await tx.meritList.count(ofExam),
        scoreRanks: await tx.scoreRank.count(ofExam),
        meritPositions: await tx.meritPosition.count(ofExam),
        ...(await tx.$queryRaw<Record<string, number>[]>`
          SELECT (SELECT COUNT(*)::int FROM "ClinicalFacts" WHERE exam = ${exam}) AS "clinicalFacts", (SELECT COUNT(*)::int FROM "FeesStructured" WHERE exam = ${exam}) AS "feesStructured",
            (SELECT COUNT(*)::int FROM "College" WHERE id = ANY(${mine}) AND type IS NOT NULL) AS "collegeTypes", (SELECT COUNT(*)::int FROM "College" WHERE id = ANY(${mine}) AND cardinality("mccIds") > 0) AS "collegeMccIds",
            (SELECT COUNT(*)::int FROM "College" WHERE id = ANY(${mine}) AND website IS NOT NULL) AS "collegeWebsites",
            COUNT(*) FILTER (WHERE "candidateCategory" IS NOT NULL)::int AS "allotmentCandidateCategories", COUNT("optionNo")::int AS "allotmentOptionNos",
            COUNT("prevCollegeId")::int AS "allotmentPrevSeats"
          FROM "Allotment" WHERE exam = ${exam}`)[0],
      };
      const want = {
        resultSources: sources.length,
        colleges: colleges.length + seatColleges.length,
        specialties: courses.length,
        collegeSpecialties: pairs.size,
        cutoffs: cutoffs.length,
        terms: terms.length,
        termDetails: terms.filter((t) => t.details && !("records" in t.details)).length,
        allotments: allotments.length,
        seatSources: seatSources.length,
        seatCounts: seats.length,
        announcements: notices.length,
        roundSteps: steps.length,
        meritLists: nbems.size,
        scoreRanks: scoreRows.length,
        meritPositions: meritRows.length,
        clinicalFacts: clinical.length,
        feesStructured: feeTable.length,
        collegeTypes: v2 ? written.filter((c) => c.type).length : 0,
        collegeMccIds: written.filter((c) => c.mcc_ids?.length).length,
        collegeWebsites: written.filter((c) => c.website).length,
        allotmentCandidateCategories: allotments.filter((a) => "candidate_category" in a && a.candidate_category != null).length,
        allotmentOptionNos: allotments.filter((a) => "option_no" in a && a.option_no != null).length,
        allotmentPrevSeats: allotments.filter((a) => "prev_ikey" in a && a.prev_ikey != null).length,
      };
      for (const [k, n] of Object.entries(want)) if ((counts as Record<string, number>)[k] !== n) bad.push(`${k} in DB ${counts[k as keyof typeof counts]} != bundle ${n}`);
      const accountsAfter = await accounts();
      if (accountsAfter !== accountsBefore) bad.push(`User/Session/WaitlistEntry counts changed: ${accountsBefore} -> ${accountsAfter}`);
      if (bad.length) throw new Error(`Spot checks FAILED, import rolled back (nothing written):\n${bad.join("\n")}`);

      const marker = { name: `MCC export bundle (built ${manifest.built})`, type: "OFFICIAL" as const, createdAt: new Date() };
      await tx.dataSource.upsert({ where: sk(MARKER), create: { exam, key: MARKER, ...marker }, update: marker });
      return {
        ...counts,
        removed: { colleges: goneColleges.length, specialties: goneSpecialties.length, collegeSpecialties: gonePairs.length, sources: goneSources.count, residents: goneResidents },
        // keys: RetiredCollegeKey rows (this bundle's and earlier ones'), slugs: of them with an old slug that redirects;
        // movedNow: what this import found under keys it retired (now under the new key), hidesCopied: hides carried over.
        retiredKeys: { keys: retired.total, bundle: aliases.length, slugs: retired.slugs, movedNow: moved, hidesCopied },
        accounts: accountsAfter,
      };
    },
    // RepeatableRead: the account counts are this transaction's own view, so a sign-in meanwhile doesn't abort it.
    { timeout: 1_800_000, maxWait: 60_000, isolationLevel: "RepeatableRead" },
  );
  console.log(result);
  const unsourced = terms.filter((t) => t.src_url == null).length;
  if (unsourced) console.log(`${unsourced} unknown bond term(s) with no document: source "${BOND_CHECK.name}".`);
  if (unknownCourses.size) console.log(`Seat rows with a course not in courses.json (kept, no Specialty link): ${[...unknownCourses].join(", ")}`);
  if (result.removed.residents) console.warn(`${result.removed.residents} resident row(s) went with their college or course: run npm run db:import-residents.`);
  if (pg) console.log(`Committed. Spot checks passed (Kokilaben DNB Anaesthesiology 2025 R1–stray + 2026 R1 and its stray allotment; GMC Nagpur 2026 R1 closing and 12 allotments; no provisional 2026 R1; every seat list adds up to its file; every newest virtual vacancy has an earlier allotment; NBEMS top scores; every retired key of the bundle points at its college${v2 ? "; every previous seat is that rank's allotment one round back, and 2023 R2 rank 23's" : ""}).`);
  else console.log(`Committed ${exam}. Spot checks passed (row counts; every seat list adds up to its file; every newest virtual vacancy has an earlier allotment; NBEMS top scores; every retired key of the bundle points at its college${v2 ? "; every previous seat is that rank's allotment one round back" : ""}). Other exams' rows were not touched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
