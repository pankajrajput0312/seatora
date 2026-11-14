import "server-only";
import { headers } from "next/headers";
import { hasSiteAccess } from "@/features/auth/lib/session";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";
import { profileHasCourse, type Profile } from "../profile";
import type { Course } from "../types";

// Names from MCC's admitted-candidates lists (private import, prisma/import-residents.ts): name, course, year, list and
// the 2025 rank where known. No contact details exist. Rows marked hidden are never read out of the database.

export type Resident = { id: string; name: string; year: number; list: string; rank: number | null; sourceKey: string; course: Course };
export type ResidentSource = { key: string; name: string; url: string | null; year: number | null };

const select = {
  id: true,
  name: true,
  year: true,
  list: true,
  rank: true,
  sourceKey: true,
  specialty: { select: { degree: true, code: true, name: true, slug: true } },
} as const;

/**
 * One institute's residents (by College.key), course by course (degree, name), newest year first, then name. Optional
 * course slug and year filters; `pg` returns one page, without it every row. `sources` = the list PDFs behind the rows.
 */
export async function listResidents(collegeKey: string, f: { course?: string; year?: number } = {}, pg?: { page: number; pageSize: number }) {
  const where = { college: { key: collegeKey }, hidden: false, year: f.year, specialty: f.course ? { slug: f.course } : undefined };
  const [total, found] = await Promise.all([
    db.resident.count({ where }),
    db.resident.findMany({
      where,
      select,
      orderBy: [{ specialty: { degree: "asc" } }, { specialty: { name: "asc" } }, { year: "desc" }, { name: "asc" }],
      skip: pg && (pg.page - 1) * pg.pageSize,
      take: pg?.pageSize,
    }),
  ]);
  const rows: Resident[] = found.map(({ specialty: s, ...r }) => ({ ...r, course: { degree: s.degree, specialty: s.code ?? "", name: s.name, slug: s.slug } }));
  const sources = await db.dataSource.findMany({
    where: { key: { in: [...new Set(rows.map((r) => r.sourceKey))] } },
    select: { key: true, name: true, url: true, counsellingYear: true },
    orderBy: { key: "desc" },
  });
  return {
    rows,
    total,
    page: pg?.page ?? 1,
    pageSize: pg?.pageSize ?? Math.max(1, total),
    sources: sources.map((s): ResidentSource => ({ key: s.key, name: s.name, url: s.url, year: s.counsellingYear })),
  };
}

/**
 * Names are shown only to the signed-in, allowlisted user holding a valid access cookie for that same account, checked
 * here as well as in src/middleware.ts so removing the middleware can never make them public. Refuses when the gate is
 * off (no SITE_ACCESS_SECRET / SEATORA_ALLOWED_EMAILS), even in development.
 */
export const canSeeResidents = hasSiteAccess;

/** Per-IP budget for reading or hiding names. False once spent. ponytail: in-memory per instance, as @/lib/rate-limit. */
export async function residentsBudget(kind: "read" | "hide") {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return kind === "read" ? allow(`residents:${ip}`, 300, 60 * 60 * 1000) : allow(`residents-hide:${ip}`, 20, 60 * 60 * 1000);
}

/**
 * Hides the person: every row with this row's name at a college with this PIN code (all years and courses). Recorded in
 * HiddenResident first, which the imports never delete, so the hide outlives these rows. False when none was visible.
 */
export async function hideResident(id: string) {
  const r = await db.resident.findUnique({ where: { id }, select: { name: true, college: { select: { pincode: true, key: true } } } });
  if (!r) return false;
  const place = r.college.pincode ?? r.college.key;
  // Raw SQL (one INSERT into a table with no relations), so it works with a client generated before the table existed.
  await db.$executeRaw`INSERT INTO "HiddenResident" ("name", "place") VALUES (${r.name}, ${place}) ON CONFLICT DO NOTHING`;
  const college = r.college.pincode ? { pincode: r.college.pincode } : { key: r.college.key };
  const { count } = await db.resident.updateMany({ where: { name: r.name, college, hidden: false }, data: { hidden: true } });
  return count > 0;
}

/** Rows (in listResidents order) grouped by course, then year newest first; courses in her profile come first. */
export function groupResidents(rows: Resident[], profile: Profile | null) {
  const inProfile = (c: Course) => !!profile && profileHasCourse(profile, c);
  const groups = new Map<string, { course: Course; mine: boolean; years: Map<number, Resident[]> }>();
  for (const r of rows) {
    const g = groups.get(r.course.slug) ?? groups.set(r.course.slug, { course: r.course, mine: inProfile(r.course), years: new Map() }).get(r.course.slug)!;
    (g.years.get(r.year) ?? g.years.set(r.year, []).get(r.year)!).push(r);
  }
  // Stable sort: her courses first, otherwise the SQL order. Years arrive newest first.
  return [...groups.values()]
    .sort((a, b) => Number(b.mine) - Number(a.mine))
    .map((g) => ({ ...g, total: [...g.years.values()].reduce((n, x) => n + x.length, 0), years: [...g.years].map(([year, list]) => ({ year, rows: list })) }));
}
