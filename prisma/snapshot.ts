// Usage: node --experimental-strip-types prisma/snapshot.ts   (npm run build runs it before `next build`)
// Writes .snapshot/catalog.json.gz: the catalog's and hospitalInfo's raw rows, the newest round's seat rows, plus the import marker they were read
// at (src/features/decide/server/snapshot.ts). Never fails the build: without DATABASE_URL or a reachable DB it
// removes any old snapshot and the app reads Postgres as before.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { catalogRows, infoRows, markerOf, roundKey, seatRoundRows, SNAPSHOT_FILE, type Snapshot } from "../src/features/decide/server/snapshot.ts";
import { rounds } from "../src/features/decide/types.ts";

rmSync(SNAPSHOT_FILE, { force: true });
if (!process.env.DATABASE_URL) {
  console.warn("snapshot: DATABASE_URL is not set; no catalog snapshot (runtime reads Postgres)");
} else {
  const db = new PrismaClient();
  try {
    // Marker first: an import committing while this reads changes the marker, so the snapshot is then never used.
    const marker = await markerOf(db);
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
    console.log(`snapshot: ${SNAPSHOT_FILE} at ${marker}: ${(json.length / 1e6).toFixed(1)} MB JSON, ${(gz.length / 1e6).toFixed(2)} MB gzipped`);
  } catch (e) {
    console.warn(`snapshot: skipped (${(e as Error).message}); runtime reads Postgres`);
  } finally {
    await db.$disconnect();
  }
}
