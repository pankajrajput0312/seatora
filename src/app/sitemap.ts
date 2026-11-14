import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteConfig.url, changeFrequency: "weekly", priority: 1 },
    // Public pages only: /decide is sign-in only and disallowed in robots.ts.
    ...["/about", "/pricing", "/terms", "/privacy", "/refund-policy", "/shipping-policy", "/contact"].map((p) => ({
      url: `${siteConfig.url}${p}`,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
