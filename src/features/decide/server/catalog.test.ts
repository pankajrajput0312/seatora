import { afterEach, expect, it, vi } from "vitest";

// Postgres stand-in: an empty dataset plus the import marker (prisma/import-mcc.ts writes it last in its transaction).
const { db } = vi.hoisted(() => {
  const none = () => Promise.resolve([]);
  return {
    db: {
      dataSource: { findUnique: vi.fn(), findMany: vi.fn(none) },
      college: { findMany: vi.fn(none) },
      specialty: { findMany: vi.fn(none) },
      collegeSpecialty: { findMany: vi.fn(none) },
      collegeTerm: { findMany: vi.fn(none) },
      $queryRaw: vi.fn(none),
    },
  };
});
vi.mock("@/lib/db", () => ({ db }));

import { getCatalog, perImport, scrubNotes } from "./catalog";

afterEach(() => {
  vi.unstubAllEnvs();
});

it("reloads the catalog as soon as an import has committed, and only then", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  const committed = (iso: string) => db.dataSource.findUnique.mockResolvedValue({ createdAt: new Date(iso) });
  const loads = () => db.college.findMany.mock.calls.length;

  committed("2026-11-14T10:00:00Z");
  const first = await getCatalog();
  expect(loads()).toBe(1);

  // unchanged marker (no import, or one still running): the cached catalog, after one marker read
  expect(await getCatalog()).toBe(first);
  expect([loads(), db.dataSource.findUnique.mock.calls.length]).toEqual([1, 2]);

  // an import commits: the very next request reloads, so no page mixes the old catalog with the new cutoffs
  committed("2026-11-14T10:05:00Z");
  const second = await getCatalog();
  expect(second).not.toBe(first);
  expect(loads()).toBe(2);
  expect(await getCatalog()).toBe(second);
  expect(loads()).toBe(2);
});

it("perImport: one read per key per import, shared across requests, re-read once an import commits; failures not kept", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  db.dataSource.findUnique.mockResolvedValue({ createdAt: new Date("2026-11-15T10:00:00Z") });
  let n = 0;
  const load = vi.fn(async (key: string) => (key === "bad" && n++ === 0 ? Promise.reject(new Error("down")) : `${key}@${db.dataSource.findUnique.mock.results.length}`));
  const read = perImport(load);

  const a = await read("x");
  expect(await read("x")).toBe(a);
  await read("y");
  expect(load).toHaveBeenCalledTimes(2);

  await expect(read("bad")).rejects.toThrow("down");
  await read("bad"); // retried, not the cached failure
  expect(load).toHaveBeenCalledTimes(4);

  db.dataSource.findUnique.mockResolvedValue({ createdAt: new Date("2026-11-15T10:05:00Z") });
  expect(await read("x")).not.toBe(a);
  expect(load).toHaveBeenCalledTimes(5);
});

it("scrubs first-person working notes from imported term text", () => {
  const years = "3 years. An amending resolution reportedly reduces this to 2 years; I did not retrieve its official text.";
  expect(scrubNotes({ years, n: 1 })).toEqual({ years: "3 years. An amending resolution reportedly reduces this to 2 years.", n: 1 });
  expect(scrubNotes({ t: "If I fail to complete my tenure, I will pay." })).toEqual({ t: "If I fail to complete my tenure, I will pay." });
});
