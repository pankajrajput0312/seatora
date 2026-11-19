import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { examKeys, exams } from "@/features/exams/registry";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteConfig.url, changeFrequency: "weekly", priority: 1 },
    // Each open exam's landing page (registry `public`); a staff-only exam's is noindex and never listed.
    ...examKeys.filter((k) => exams[k].public).map((k) => ({ url: `${siteConfig.url}/${k}`, changeFrequency: "daily" as const, priority: 0.8 })),
    // Public pages only: /decide is sign-in only and disallowed in robots.ts.
    ...["/about", "/pricing", "/terms", "/privacy", "/refund-policy", "/shipping-policy", "/contact"].map((p) => ({
      url: `${siteConfig.url}${p}`,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
