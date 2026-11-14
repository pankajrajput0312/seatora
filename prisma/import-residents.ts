// Imports the PRIVATE residents bundle (names from MCC's admitted-candidates lists; neetpg-planner data/medpath-private).
// Usage: npm run db:import-residents [-- <bundle dir>]   (default ../neetpg-planner/data/medpath-private, or RESIDENTS_BUNDLE)
// The bundle is never copied into this repo. Run the MCC import first: colleges and courses must exist.
// Validates everything first and aborts on any schema error; then replaces every Resident row in one transaction,
// setting `hidden` from HiddenResident (name + college PIN code, as hideResident records it). Rows whose college or
// course is not in the database are rejected and listed, never guessed.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const dir = resolve(process.argv[2] ?? process.env.RESIDENTS_BUNDLE ?? "../neetpg-planner/data/medpath-private");
// Official URLs of the list PDFs: the planner's source map next to the bundle (data/official_sources.json).
const urlsFile = join(dir, "..", "official_sources.json");

// spot_checks: known rows re-asserted after the import. They live in the private manifest, never as names in this repo.
const spotSchema = z.object({ ikey: z.string(), degree: z.string(), specialty: z.string(), year: z.number().int(), name: z.string().min(1), rank: z.number().int().positive(), list_label: z.string() });
const manifestSchema = z.object({ schema_version: z.literal(1), built: z.string(), count: z.number().int().positive(), sha256: z.string().regex(/^[0-9a-f]{64}$/), spot_checks: z.array(spotSchema).min(1) });
// .strict(): a bundle that ever carried roll numbers, phone numbers or emails fails instead of being imported.
const residentSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    ikey: z.string().regex(/^[A-Z0-9]{1,40}(#(\d{6})?)?$/),
    degree: z.string().min(1),
    specialty: z.string().regex(/^[A-Z0-9]+$/),
    name: z.string().min(1).max(120),
    rank: z.number().int().positive().nullable(),
    list: z.string().regex(/^[\w.-]+$/),
    list_label: z.string().min(1).max(80),
    src: z.string().regex(/^mcc\/\d{4}\/[\w.-]+\.pdf$/),
  })
  .strict()
  .refine((r) => r.src === `mcc/${r.year}/${r.list}.pdf`, { message: "src is not this year's list PDF", path: ["src"] })
  .refine((r) => r.rank == null || r.year === 2025, { message: "ranks come from the 2025 merit list only", path: ["rank"] });

const errors: string[] = [];
const manifest = manifestSchema.parse(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")));
const raw = readFileSync(join(dir, "residents.ndjson"));
if (createHash("sha256").update(raw).digest("hex") !== manifest.sha256) errors.push("residents.ndjson: sha256 does not match manifest");
const lines = raw.toString("utf8").split("\n").filter(Boolean);
if (lines.length !== manifest.count) errors.push(`residents.ndjson: ${lines.length} rows, manifest says ${manifest.count}`);
const rows: z.infer<typeof residentSchema>[] = [];
lines.forEach((l, i) => {
  const r = residentSchema.safeParse(JSON.parse(l));
  if (r.success) rows.push(r.data);
  else errors.push(`residents.ndjson:${i + 1}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
});
const urls = z.record(z.string(), z.url()).parse(existsSync(urlsFile) ? JSON.parse(readFileSync(urlsFile, "utf8")) : {});
const lists = new Map(rows.map((r) => [r.src, r]));
if (errors.length) {
  console.error(`Import aborted: ${errors.length} error(s)\n${errors.slice(0, 200).join("\n")}`);
  process.exit(1);
}

const db = new PrismaClient();
const keyOf = (place: string, name: string) => `${place}|${name}`;

async function main() {
  const colleges = await db.college.findMany({ select: { id: true, key: true, pincode: true } });
  const collegeId = new Map(colleges.map((c) => [c.key, c.id]));
  // HiddenResident.place, as src/features/decide/server/residents.ts hideResident writes it.
  const placeOf = new Map(colleges.map((c) => [c.key, c.pincode ?? c.key]));
  const specialtyId = new Map<string, string>();
  for (const s of await db.specialty.findMany({ where: { code: { not: null } }, select: { id: true, degree: true, code: true } })) {
    const k = `${s.degree}|${s.code}`;
    if (specialtyId.has(k)) throw new Error(`two Specialty rows for ${k}: re-run npm run db:import first`);
    specialtyId.set(k, s.id);
  }
  const why = (r: (typeof rows)[number]) =>
    !collegeId.has(r.ikey) ? `unknown college ${r.ikey}` : !specialtyId.has(`${r.degree}|${r.specialty}`) ? `unknown course ${r.degree} ${r.specialty}` : null;
  const rejected = new Map<string, number>();
  for (const r of rows) {
    const w = why(r);
    if (w) rejected.set(w, (rejected.get(w) ?? 0) + 1);
  }
  const data = rows
    .filter((r) => !why(r))
    .map((r) => ({ ikey: r.ikey, collegeId: collegeId.get(r.ikey)!, specialtyId: specialtyId.get(`${r.degree}|${r.specialty}`)!, year: r.year, name: r.name, rank: r.rank, list: r.list_label, sourceKey: r.src }));
  if (rejected.size) console.warn(`Rejected ${rows.length - data.length} row(s), not imported:\n${[...rejected].map(([k, n]) => `  ${k}: ${n}`).join("\n")}`);

  // One DataSource per list PDF. No round, so the Decide catalog never takes it for an allotment result.
  for (const [key, r] of lists) {
    const d = { name: `MCC admitted candidates list (${r.list_label})`, url: urls[key] ?? null, type: "OFFICIAL" as const, counsellingYear: r.year, round: null };
    if (!d.url) console.warn(`${key}: no official URL in ${urlsFile}`);
    await db.dataSource.upsert({ where: { key }, create: { key, ...d }, update: d });
  }

  // Replace all; a name someone asked to hide stays hidden.
  const hidden = await db.$transaction(
    async (tx) => {
      // From HiddenResident, never from the rows being replaced: those may already be gone (an MCC import that changed a
      // college key or course cascades them away). By PIN code, so a new key for the same college keeps its hides.
      const keep = new Set((await tx.$queryRaw<{ name: string; place: string }[]>`SELECT "name", "place" FROM "HiddenResident"`).map((h) => keyOf(h.place, h.name)));
      await tx.resident.deleteMany({});
      // One JSON parameter per 2,000 rows (as tools/backup_medpath_db.mjs restores): the local prisma dev database
      // (PGlite) stalls on createMany's tens of thousands of bind parameters.
      for (let i = 0; i < data.length; i += 2000) {
        const batch = data.slice(i, i + 2000).map(({ ikey, ...r }) => ({ id: randomUUID(), ...r, hidden: keep.has(keyOf(placeOf.get(ikey)!, r.name)) }));
        await tx.$executeRawUnsafe(`INSERT INTO "Resident" SELECT * FROM json_populate_recordset(NULL::"Resident", $1::json)`, JSON.stringify(batch));
      }
      return tx.resident.count({ where: { hidden: true } });
    },
    { timeout: 1_800_000, maxWait: 60_000 },
  );

  // ---------- re-assert known values against the database ----------
  const bad: string[] = [];
  const total = await db.resident.count();
  if (total !== data.length) bad.push(`Resident rows ${total} != ${data.length} imported`);
  for (const c of manifest.spot_checks) {
    const got = await db.resident.findMany({ where: { year: c.year, name: c.name, college: { key: c.ikey }, specialty: { degree: c.degree, code: c.specialty } }, select: { rank: true, list: true } });
    if (got.length !== 1 || got[0].rank !== c.rank || got[0].list !== c.list_label) bad.push(`spot check ${c.year} ${c.degree} ${c.specialty} at ${c.ikey}: expected rank ${c.rank}, got ${got.length} row(s)`);
  }
  console.log({ residents: total, rejected: rows.length - data.length, hiddenRows: hidden, lists: lists.size, built: manifest.built });
  if (bad.length) {
    console.error(`Spot checks FAILED:\n${bad.join("\n")}`);
    process.exitCode = 1;
  } else console.log(`${manifest.spot_checks.length} spot checks passed. Bundle: ${basename(dir)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
