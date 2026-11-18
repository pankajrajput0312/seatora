// The catalog's and hospitalInfo's raw rows, read from Postgres or from a snapshot written at build time
// (prisma/snapshot.ts, before `next build`). Each cold start would otherwise pull ~10 MB over the wire; the snapshot is
// used only while the import marker still equals the one it was built from, so an import without a redeploy still
// shows fresh data (read from the DB, as before). No "server-only" or "@/" imports: plain node runs this at build time.
// Every read is one exam's (default NEET PG); the build's snapshot is NEET PG's only.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PrismaClient } from "@prisma/client";
import type { FeeTableRecord, Term } from "../types";
import type { ValueMeta } from "../components/institute/hospital-bits";
import { DEFAULT_EXAM, markerKey, type ExamKey } from "../../exams/keys.ts";

/** Traced into every serverless function (next.config.ts outputFileTracingIncludes). */
export const SNAPSHOT_FILE = join(process.cwd(), ".snapshot", "catalog.json.gz");

/** An exam's data version: the marker row prisma/import-mcc.ts writes last in its transaction ("" before any import). */
export async function markerOf(db: PrismaClient, exam: ExamKey = DEFAULT_EXAM): Promise<string> {
  const marker = await db.dataSource.findUnique({ where: { exam_key: { exam, key: markerKey(exam) } }, select: { createdAt: true } });
  return marker?.createdAt.toISOString() ?? "";
}

/** The exam's colleges (CollegeExam): shared rows, one per institute. */
export const ofExam = (exam: ExamKey) => ({ exams: { some: { exam } } });

/** The build cache's key (prisma/snapshot.ts): NEET PG's data version and its colleges' newest edit. */
export async function fingerprint(db: PrismaClient) {
  const marker = await markerOf(db);
  const edited = (await db.college.aggregate({ where: ofExam(DEFAULT_EXAM), _max: { updatedAt: true } }))._max.updatedAt?.toISOString() ?? "";
  return { marker, fp: `${marker}|${edited}` };
}

// Sources and fee-table records in table order ("ORDER BY ctid": what the unfiltered read gave before exams), whatever
// plan the exam filter gets: a NEET PG page lists them as it did, with or without other exams' rows.
export async function catalogRows(db: PrismaClient, exam: ExamKey = DEFAULT_EXAM) {
  const [sources, colleges, specialties, pairs, terms, options, details, retired, feeTable] = await Promise.all([
    db.$queryRaw<{ id: string; key: string; name: string; url: string | null; counsellingYear: number | null; round: string | null; provisional: boolean }[]>`
      SELECT id, key, name, url, "counsellingYear", round, provisional FROM "DataSource" WHERE exam = ${exam} ORDER BY ctid`,
    // Same-named colleges by key: their order must not hang on the query plan (it joins CollegeExam).
    db.college.findMany({ where: ofExam(exam), select: { id: true, key: true, slug: true, name: true, state: true, pincode: true, address: true, website: true }, orderBy: [{ name: "asc" }, { key: "asc" }] }),
    db.specialty.findMany({ where: { exam }, select: { id: true, slug: true, name: true, degree: true, code: true } }),
    db.collegeSpecialty.findMany({ where: { specialty: { exam } }, select: { id: true, collegeId: true, specialtyId: true } }),
    db.collegeTerm.findMany({ where: { exam }, select: { id: true, collegeId: true, program: true, kind: true, text: true, amountInr: true, source: { select: { name: true, url: true, type: true } } } }),
    db.$queryRaw<{ cs: string; quota: string; year: number; n: number }[]>`
      SELECT "collegeSpecialtyId" AS cs, quota, "counsellingYear" AS year, SUM(n)::int AS n FROM "Cutoff" WHERE exam = ${exam} GROUP BY 1, 2, 3`,
    // Raw SQL: the generated client may predate the details column (prisma/schema.prisma).
    db.$queryRaw<{ id: string; details: NonNullable<Term["details"]> }[]>`SELECT id, details FROM "CollegeTerm" WHERE exam = ${exam} AND details IS NOT NULL`,
    db.$queryRaw<{ oldKey: string; oldSlug: string | null; newKey: string | null }[]>`SELECT "oldKey", "oldSlug", "newKey" FROM "RetiredCollegeKey"`,
    // Bundle schema 2: the fee table's figures (what a summary line reads; the Fees tab reads whole records: ./facts.ts).
    db.$queryRaw<(FeeTableRecord & { collegeId: string })[]>`
      SELECT "collegeId", programme, string_to_array("quotaGroup", '+') AS seat_groups, data->'fee_display' AS fee_display, data->'fee_per_year' AS fee_per_year,
        data->'fee_whole_course' AS fee_whole_course, data->'stipend_per_month' AS stipend_per_month, data->'counselling_forfeit' AS counselling_forfeit, data->'sources' AS sources, data->'quotas' AS quotas,
        data->>'fee_text' AS fee_text, data->'fee_text_src' AS fee_text_src, data->'stipend_nbems_minimum' AS stipend_nbems_minimum,
        data->'fee_parsed' AS fee_parsed, data->'other_fees' AS other_fees, data->'fee_variants' AS fee_variants
      FROM "FeesStructured" WHERE exam = ${exam} ORDER BY ctid`,
  ]);
  return { sources, colleges, specialties, pairs, terms, options, details, retired, feeTable };
}

export type InfoRow = { key: string; ids: string[] | null; url: string | null; web: string | null; type: string | null; basis: string | null; beds: number | null; kind: string | null; meta: ValueMeta | null; own: boolean | null };
/** hospitalInfo's rows (components/institute/institute-data.ts): the exam's colleges, with its clinical facts. */
export const infoRows = (db: PrismaClient, exam: ExamKey = DEFAULT_EXAM) =>
  db.$queryRaw<InfoRow[]>`
    SELECT c.key, c."mccIds" AS ids, c."mccProfileUrl" AS url, c.website AS web, c.type, c."typeBasis" AS basis,
      (f.data->'facts'->>'beds_total')::int AS beds, f.data->'facts'->>'beds_kind' AS kind,
      COALESCE(f.data->'values_meta'->'facts.beds_total', f.data->'values_meta'->'facts') AS meta, f.data->'values_meta' ? 'facts.beds_total' AS own
    FROM "College" c JOIN "CollegeExam" e ON e."collegeId" = c.id AND e.exam = ${exam} LEFT JOIN "ClinicalFacts" f ON f."collegeId" = c.id AND f.exam = ${exam}`;

/** A seat list row (SeatCount) as listSeats reads it (server/seats.ts). */
export type SeatDbRow = { l: string; k: string; dg: string; sc: string; slug: string | null; name: string | null; q: string | null; c: string; n: number; cs: string | null };
export const categoryOrder = ["Open", "OBC", "EWS", "SC", "ST", "Open PwD", "OBC PwD", "EWS PwD", "SC PwD", "ST PwD"];
/**
 * Every row of every seat list of one round, in listSeats order. The order ends in list key and row id, so the rows of
 * any of the round's lists, filtered, keep the order a query over just those would give.
 */
export const seatRoundRows = (db: PrismaClient, year: number, round: string, exam: ExamKey = DEFAULT_EXAM) =>
  db.$queryRaw<SeatDbRow[]>`
    SELECT d.key AS l, c.key AS k, x.degree AS dg, x.code AS sc, sp.slug, sp.name, x.quota AS q, x.category AS c, x.seats AS n, x."collegeSpecialtyId" AS cs
    FROM "SeatCount" x JOIN "SeatSource" s ON s."sourceId" = x."seatSourceId" JOIN "DataSource" d ON d.id = x."seatSourceId"
      JOIN "College" c ON c.id = x."collegeId" LEFT JOIN "Specialty" sp ON sp.id = x."specialtyId"
    WHERE d.exam = ${exam} AND s.year = ${year} AND s.round = ${round}
    ORDER BY c.name, c.key, x.degree, COALESCE(sp.name, x.code), x.quota NULLS FIRST, array_position(${categoryOrder}::text[], x.category), d.key, x.id`;
/** seatRoundRows' cache key. */
export const roundKey = (year: number, round: string) => `${year}|${round}`;

/** Every row is plain JSON (no Date, BigInt or Decimal), so the snapshot is a JSON.stringify of the query results. */
export type Snapshot = { marker: string; catalog: Awaited<ReturnType<typeof catalogRows>>; info: InfoRow[]; /** The newest round's seat rows by roundKey. */ seats: Record<string, SeatDbRow[]> };

let file: Promise<Snapshot | null> | undefined;
/** The build's snapshot (NEET PG's) when it was built from data version `version`, else null (no file, or an import since). */
export async function snapshotAt(version: string): Promise<Snapshot | null> {
  file ??= readFile(SNAPSHOT_FILE)
    .then((gz) => JSON.parse(gunzipSync(gz).toString("utf8")) as Snapshot)
    .catch(() => null);
  const s = await file;
  return s && version && s.marker === version ? s : null;
}
