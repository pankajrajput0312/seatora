// Imports the MCC export bundle (neetpg-planner `python3 -I tools/export_medpath.py` → data/medpath/).
// Usage: npm run db:import [-- <bundle dir>]   (default ../neetpg-planner/data/medpath, or MCC_BUNDLE)
// Validates everything first and aborts on any error; then, in one transaction, makes the database match the bundle:
// upserts sources, colleges and specialties, replaces cutoffs, allotments and terms, and removes the colleges, courses
// and result sources the bundle no longer has. Spot checks run before the commit. Re-running the same bundle is a no-op
// in effect. Manifest files not read here (seats, notices, ...) are only hash- and count-checked.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import {
  mccAllotmentSchema,
  mccCollegeSchema,
  mccCourseSchema,
  mccCutoffSchema,
  mccManifestSchema,
  mccSourceSchema,
  mccTermSchema,
} from "../src/features/cutoffs/lib/import-schema.ts";

const dir = resolve(process.argv[2] ?? process.env.MCC_BUNDLE ?? "../neetpg-planner/data/medpath");
const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// ---------- 1. verify and validate the whole bundle before touching the database ----------
const manifest = mccManifestSchema.parse(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")));
const raw: Record<string, Buffer> = {};
for (const [file, { count, sha256 }] of Object.entries(manifest.files)) {
  raw[file] = readFileSync(join(dir, file));
  if (createHash("sha256").update(raw[file]).digest("hex") !== sha256) fail(`${file}: sha256 does not match manifest`);
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
  const s = sources.find((x) => x.key === k)!;
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

      // remove what the bundle replaces or no longer has. Cutoffs, allotments and terms have no other source.
      // Key diffs are done here, not as NOT IN in SQL: that plan (NOT IN + nested NOT EXISTS over 133k cutoffs) can run for many minutes.
      await tx.cutoff.deleteMany({});
      await tx.allotment.deleteMany({});
      await tx.collegeTerm.deleteMany({});
      const slugs = new Set(courses.map((c) => c.slug));
      const pairKeys = new Set(cutoffs.map((c) => `${c.ikey}|${courseSlug.get(`${c.degree}|${c.specialty}`)}`));
      const oldPairs = await tx.collegeSpecialty.findMany({ select: { id: true, college: { select: { key: true } }, specialty: { select: { slug: true } } } });
      const gonePairs = oldPairs.filter((p) => !pairKeys.has(`${p.college.key}|${p.specialty.slug}`)).map((p) => p.id);
      const goneColleges = (await tx.college.findMany({ select: { id: true, key: true } })).filter((c) => !collegeKeys.has(c.key)).map((c) => c.id);
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

      // colleges: slug is set once at creation and never changed, so URLs stay stable
      const firstSource = new Map<string, string>();
      for (const c of cutoffs) {
        const cur = firstSource.get(c.ikey);
        if (!cur || sourceRank(c.src) < sourceRank(cur)) firstSource.set(c.ikey, c.src);
      }
      const baseSlug = (c: (typeof colleges)[number]) => `${kebab(c.name)}-${c.pincode ?? shortHash(c.key)}`;
      const slugCount = new Map<string, number>();
      for (const c of colleges) slugCount.set(baseSlug(c), (slugCount.get(baseSlug(c)) ?? 0) + 1);
      // a slug held by a college under another key also gets the hash suffix (removed colleges are gone by now, so a
      // renamed key with the same name and PIN keeps its URL)
      const slugOwner = new Map((await tx.college.findMany({ select: { slug: true, key: true } })).map((r) => [r.slug, r.key]));
      const collegeId = new Map<string, string>();
      for (const c of colleges) {
        const taken = slugOwner.has(baseSlug(c)) && slugOwner.get(baseSlug(c)) !== c.key;
        const slug = taken || slugCount.get(baseSlug(c))! > 1 ? `${baseSlug(c)}-${shortHash(c.key)}` : baseSlug(c);
        const data = { name: c.name, state: c.state, pincode: c.pincode, address: c.address, sourceId: sourceId.get(firstSource.get(c.key)!)! };
        const row = await tx.college.upsert({ where: { key: c.key }, create: { key: c.key, slug, ...data }, update: data, select: { id: true } });
        collegeId.set(c.key, row.id);
      }

      // result PDFs and term documents no longer in the bundle (e.g. a provisional result the final one replaced): nothing
      // references them any more. Admitted-list sources (no round, written by import-residents) and the marker stay.
      const goneSources = await tx.dataSource.deleteMany({ where: { OR: [{ round: { not: null } }, { key: { startsWith: "http" } }], key: { notIn: [...sourceId.keys()] } } });

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

      const counts = {
        resultSources: await tx.dataSource.count({ where: { round: { not: null } } }),
        sources: await tx.dataSource.count(),
        colleges: await tx.college.count(),
        specialties: await tx.specialty.count(),
        collegeSpecialties: await tx.collegeSpecialty.count(),
        cutoffs: await tx.cutoff.count(),
        terms: await tx.collegeTerm.count(),
        allotments: await tx.allotment.count(),
      };
      const want = { resultSources: sources.length, colleges: colleges.length, specialties: courses.length, collegeSpecialties: pairs.size, cutoffs: cutoffs.length, terms: terms.length, allotments: allotments.length };
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
  if (result.removed.residents) console.warn(`${result.removed.residents} resident row(s) went with their college or course: run npm run db:import-residents.`);
  console.log("Committed. Spot checks passed (Kokilaben DNB Anaesthesiology 2025 R1–stray + 2026 R1 and its stray allotment; GMC Nagpur 2026 R1 closing and 12 allotments; no provisional 2026 R1).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
