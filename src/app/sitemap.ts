import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { markerOf } from "@/features/decide/server/snapshot";
import { cutoffPath } from "@/features/exams/landing/cutoff";
import { cutoffRounds } from "@/features/exams/landing/data";
import { residentsData, residentsPath } from "@/features/exams/landing/residents";
import { examKeys, exams } from "@/features/exams/registry";
import { db } from "@/lib/db";

// Re-read hourly, like the pages it lists: a new MCC result adds its round's cutoff page and moves the dates.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // When NEET PG's data last changed (the import marker), its rounds and its residents (counts); none without a database.
  const [marker, rounds, residents] = process.env.DATABASE_URL
    ? await Promise.all([markerOf(db).catch(() => ""), cutoffRounds(), residentsData().catch(() => null)])
    : ["", [], null];
  const lastModified = marker ? new Date(marker) : undefined;
  const page = (path: string, priority: number, changed: Date | undefined) => ({ url: `${siteConfig.url}${path}`, lastModified: changed, changeFrequency: "daily" as const, priority });
  return [
    page("", 1, lastModified),
    // Each open exam's landing page (registry `public`); a staff-only exam's is noindex and never listed.
    ...examKeys.filter((k) => exams[k].public).map((k) => page(`/${k}`, 0.8, lastModified)),
    // Every result round's cutoff page; only the newest changes with an import (provisional to final), older ones keep no date.
    ...rounds.map((r, i) => page(cutoffPath(r), i === 0 ? 0.8 : 0.5, i === 0 ? lastModified : undefined)),
    // The residents pages (counts only), dated when the newest admitted list arrived (the residents import's DataSource).
    ...(residents ? [page(residentsPath(), 0.7, residents.updated ?? undefined), ...residents.states.map((s) => page(residentsPath(s.state), 0.4, residents.updated ?? undefined))] : []),
    // Public pages only: /decide is sign-in only and disallowed in robots.ts.
    ...["/about", "/pricing", "/terms", "/privacy", "/refund-policy", "/shipping-policy", "/contact"].map((p) => ({
      url: `${siteConfig.url}${p}`,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
