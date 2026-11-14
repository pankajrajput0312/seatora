// Imports the MCC export bundle (neetpg-planner `python3 -I tools/export_medpath.py` → data/medpath/).
// Usage: npm run db:import [-- <bundle dir>]   (default ../neetpg-planner/data/medpath, or MCC_BUNDLE)
// Validates everything first and aborts on any error; then upserts sources, colleges, specialties and terms and
// replaces cutoffs and allotments source by source. Re-running with the same bundle is a no-op in effect.
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

// ---------- 2. write ----------
const db = new PrismaClient();
const kebab = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const shortHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 6);
const roundOrder = ["R1", "R2", "R3", "stray", "special_stray"];
const sourceRank = (k: string) => {
  const s = sources.find((x) => x.key === k)!;
  return s.year * 10 + roundOrder.indexOf(s.round);
};

async function main() {
  // sources: allotment PDFs, plus one per distinct term URL
  const sourceId = new Map<string, string>();
  for (const s of sources) {
    const data = { name: s.name, url: s.url, type: "OFFICIAL" as const, counsellingYear: s.year, round: s.round, provisional: s.provisional };
    const row = await db.dataSource.upsert({ where: { key: s.key }, create: { key: s.key, ...data }, update: data, select: { id: true } });
    sourceId.set(s.key, row.id);
  }
  for (const url of new Set(terms.map((t) => t.src_url))) {
    const host = new URL(url).hostname;
    const name = host.includes("mcc.admissions") ? "MCC institute profile (college declaration)" : host.includes("natboard") ? "NBEMS notice" : `Official document (${host})`;
    const row = await db.dataSource.upsert({ where: { key: url }, create: { key: url, name, url, type: "OFFICIAL" }, update: { name, url }, select: { id: true } });
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
  // a slug held by a college under another key (e.g. a key from an older bundle) also gets the hash suffix
  const slugOwner = new Map((await db.college.findMany({ select: { slug: true, key: true } })).map((r) => [r.slug, r.key]));
  const collegeId = new Map<string, string>();
  for (const c of colleges) {
    const taken = slugOwner.has(baseSlug(c)) && slugOwner.get(baseSlug(c)) !== c.key;
    const slug = taken || slugCount.get(baseSlug(c))! > 1 ? `${baseSlug(c)}-${shortHash(c.key)}` : baseSlug(c);
    const data = { name: c.name, state: c.state, pincode: c.pincode, address: c.address };
    const row = await db.college.upsert({
      where: { key: c.key },
      create: { key: c.key, slug, ...data, sourceId: sourceId.get(firstSource.get(c.key)!)! },
      update: data,
      select: { id: true },
    });
    collegeId.set(c.key, row.id);
  }

  const specialtyId = new Map<string, string>();
  for (const c of courses) {
    const data = { name: c.name, degree: c.degree, code: c.specialty };
    const row = await db.specialty.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...data }, update: data, select: { id: true } });
    specialtyId.set(`${c.degree}|${c.specialty}`, row.id);
  }

  const pairs = new Map<string, { collegeId: string; specialtyId: string }>();
  for (const c of cutoffs) {
    const p = { collegeId: collegeId.get(c.ikey)!, specialtyId: specialtyId.get(`${c.degree}|${c.specialty}`)! };
    pairs.set(`${p.collegeId}|${p.specialtyId}`, p);
  }
  await db.collegeSpecialty.createMany({ data: [...pairs.values()], skipDuplicates: true });
  const csId = new Map(
    (await db.collegeSpecialty.findMany({ select: { id: true, collegeId: true, specialtyId: true } })).map((r) => [`${r.collegeId}|${r.specialtyId}`, r.id]),
  );

  // cutoffs and allotments: replace by source; a final source also clears the provisional rows of its year and round
  const csOf = (c: { ikey: string; degree: string; specialty: string }) => csId.get(`${collegeId.get(c.ikey)}|${specialtyId.get(`${c.degree}|${c.specialty}`)}`)!;
  for (const s of sources) {
    const rows = cutoffs.filter((c) => c.src === s.key);
    const seats = allotments.filter((a) => a.src === s.key);
    const id = sourceId.get(s.key)!;
    await db.$transaction(
      async (tx) => {
        if (!s.provisional) {
          const stale = await tx.dataSource.findMany({ where: { counsellingYear: s.year, round: s.round, provisional: true, NOT: { id } }, select: { id: true } });
          if (stale.length) {
            await tx.cutoff.deleteMany({ where: { sourceId: { in: stale.map((x) => x.id) } } });
            await tx.allotment.deleteMany({ where: { sourceId: { in: stale.map((x) => x.id) } } });
          }
        }
        await tx.cutoff.deleteMany({ where: { sourceId: id } });
        await tx.allotment.deleteMany({ where: { sourceId: id } });
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
      },
      { timeout: 1_800_000, maxWait: 60_000 },
    );
    console.log(`${s.key}: ${rows.length} cutoffs, ${seats.length} allotments`);
  }

  // terms: this bundle is their only source today, so replace them all (drops terms no longer published).
  // ponytail: wipes every CollegeTerm; scope the delete by source once a second term source exists.
  await db.$transaction([
    db.collegeTerm.deleteMany({}),
    db.collegeTerm.createMany({
      data: terms.map((t) => ({
        collegeId: collegeId.get(t.ikey)!,
        program: t.program,
        kind: t.kind,
        text: t.text,
        amountInr: t.amount_inr,
        sourceId: sourceId.get(t.src_url)!,
      })),
    }),
  ]);

  // colleges whose key is no longer in the bundle and that have nothing left are removed. The key diff is done here,
  // not as NOT IN in SQL: that plan (NOT IN + nested NOT EXISTS over 133k cutoffs) can run for many minutes.
  const gone = (await db.college.findMany({ select: { id: true, key: true } })).filter((c) => !collegeKeys.has(c.key)).map((c) => c.id);
  const stale = gone.length
    ? await db.college.findMany({
        where: { id: { in: gone }, terms: { none: {} }, specialties: { every: { cutoffs: { none: {} }, allotments: { none: {} } } } },
        select: { id: true },
      })
    : [];
  if (stale.length) {
    const ids = stale.map((c) => c.id);
    await db.$transaction([db.collegeSpecialty.deleteMany({ where: { collegeId: { in: ids } } }), db.college.deleteMany({ where: { id: { in: ids } } })]);
    console.log(`removed ${ids.length} colleges no longer in the bundle`);
  }

  // ---------- 3. re-assert known values against the database ----------
  const closingOf = async (prefix: string, slug: string, year: number, round: string, quota: string, category?: string) =>
    db.cutoff.findMany({
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
  const kokilaStray = await db.allotment.count({
    where: { counsellingYear: 2025, round: "stray", quota: "DNB Quota", category: "Open", rank: 33685, collegeSpecialty: { college: { key: { startsWith: kokila } }, specialty: { slug: dnbAnaes } } },
  });
  if (kokilaStray !== 1) bad.push(`Kokilaben 2025 stray Open allotment at rank 33685: ${kokilaStray} rows`);
  const nagpurSeats = await db.allotment.count({
    where: { counsellingYear: 2026, round: "R1", collegeSpecialty: { college: { key: { startsWith: "GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT" } }, specialty: { slug: mdAnaes } } },
  });
  if (nagpurSeats !== 12) bad.push(`GMC Nagpur 2026 R1 MD Anaesthesiology: ${nagpurSeats} allotment rows, expected 12`);

  const counts = {
    sources: await db.dataSource.count(),
    colleges: await db.college.count(),
    specialties: await db.specialty.count(),
    collegeSpecialties: await db.collegeSpecialty.count(),
    cutoffs: await db.cutoff.count(),
    terms: await db.collegeTerm.count(),
    allotments: await db.allotment.count(),
  };
  console.log(counts);
  if (counts.terms !== terms.length) bad.push(`term rows in DB ${counts.terms} != bundle ${terms.length}`);
  if (counts.cutoffs !== cutoffs.length) bad.push(`cutoff rows in DB ${counts.cutoffs} != bundle ${cutoffs.length}`);
  if (counts.allotments !== allotments.length) bad.push(`allotment rows in DB ${counts.allotments} != bundle ${allotments.length}`);
  if (bad.length) {
    console.error(`Spot checks FAILED:\n${bad.join("\n")}`);
    process.exitCode = 1;
  } else console.log("Spot checks passed (Kokilaben DNB Anaesthesiology 2025 R1–stray + 2026 R1 and its stray allotment; GMC Nagpur 2026 R1 closing and 12 allotments).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
