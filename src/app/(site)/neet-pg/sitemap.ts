import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { markerOf } from "@/features/decide/server/snapshot";
import { branchPath, branchSlugs, collegeIndex, collegePath, collegesPath, statePath, statesOf } from "@/features/exams/landing/colleges";
import { db } from "@/lib/db";

// /neet-pg/sitemap.xml, apart from /sitemap.xml (robots.ts lists both): every college, state and branch page, dated when
// NEET PG's data last changed (the import marker). Re-read hourly, like the pages. Empty without a database.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!process.env.DATABASE_URL) return [];
  const [marker, index, branches] = await Promise.all([markerOf(db).catch(() => ""), collegeIndex().catch(() => null), branchSlugs().catch(() => [])]);
  const lastModified = marker ? new Date(marker) : undefined;
  const page = (path: string, priority: number) => ({ url: `${siteConfig.url}${path}`, lastModified, changeFrequency: "daily" as const, priority });
  const colleges = index?.colleges ?? [];
  return [
    ...(index ? [page(collegesPath, 0.7)] : []),
    ...statesOf(colleges).map((s) => page(statePath(s.state), 0.5)),
    ...branches.map((b) => page(branchPath(b.slug), 0.6)),
    ...colleges.map((c) => page(collegePath(c.slug), 0.5)),
  ];
}
