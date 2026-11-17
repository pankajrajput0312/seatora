// Usage: node --experimental-strip-types prisma/snapshot.ts   (npm run build runs it before `next build`)
// Writes .snapshot/catalog.json.gz: the catalog's and hospitalInfo's raw rows, the newest round's seat rows, plus the import marker they were read
// at (src/features/decide/server/snapshot.ts). Never fails the build: without DATABASE_URL or a reachable DB it
// removes any old snapshot and the app reads Postgres as before.
// Egress: the snapshot is about 24 MB read from Postgres, so it is kept in the build cache (.next/cache, which Vercel
// restores between deploys) with a fingerprint (the import marker and the newest College edit); a deploy whose data
// did not change reuses it with two tiny queries instead of reading the catalog again.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { catalogRows, infoRows, markerOf, roundKey, seatRoundRows, SNAPSHOT_FILE, type Snapshot } from "../src/features/decide/server/snapshot.ts";
import { rounds } from "../src/features/decide/types.ts";

const CACHE = ".next/cache/seatora-snapshot.json.gz";
const CACHE_FP = ".next/cache/seatora-snapshot.fp";

rmSync(SNAPSHOT_FILE, { force: true });
if (!process.env.DATABASE_URL) {
  console.warn("snapshot: DATABASE_URL is not set; no catalog snapshot (runtime reads Postgres)");
} else {
  const db = new PrismaClient();
  try {
    // Marker first: an import committing while this reads changes the marker, so the snapshot is then never used.
    const marker = await markerOf(db);
    const edited = (await db.college.aggregate({ _max: { updatedAt: true } }))._max.updatedAt?.toISOString() ?? "";
    const fp = `${marker}|${edited}`;
    if (marker && existsSync(CACHE) && existsSync(CACHE_FP) && readFileSync(CACHE_FP, "utf8") === fp) {
      mkdirSync(dirname(SNAPSHOT_FILE), { recursive: true });
      copyFileSync(CACHE, SNAPSHOT_FILE);
      console.log(`snapshot: reused the build cache's (data unchanged since ${marker})`);
      await db.$disconnect();
      process.exit(0);
    }
    // The newest seat list round (seatLists() order: year, then round): the one Seats and institute pages open on.
    const [newest] = (await db.seatSource.findMany({ select: { year: true, round: true }, distinct: ["year", "round"] })).sort(
      (a, b) => b.year - a.year || rounds.indexOf(b.round as never) - rounds.indexOf(a.round as never),
    );
    const [catalog, info, seatRows] = await Promise.all([catalogRows(db), infoRows(db), newest ? seatRoundRows(db, newest.year, newest.round) : null]);
    if (!marker) throw new Error("no import marker");
    const seats = newest && seatRows ? { [roundKey(newest.year, newest.round)]: seatRows } : {};
    const json = JSON.stringify({ marker, catalog, info, seats } satisfies Snapshot);
    const gz = gzipSync(json, { level: 9 });
    mkdirSync(dirname(SNAPSHOT_FILE), { recursive: true });
    writeFileSync(SNAPSHOT_FILE, gz);
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, gz);
    writeFileSync(CACHE_FP, fp);
    console.log(`snapshot: ${SNAPSHOT_FILE} at ${marker}: ${(json.length / 1e6).toFixed(1)} MB JSON, ${(gz.length / 1e6).toFixed(2)} MB gzipped`);
  } catch (e) {
    console.warn(`snapshot: skipped (${(e as Error).message}); runtime reads Postgres`);
  } finally {
    await db.$disconnect();
  }
}
