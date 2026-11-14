import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteConfig.url, changeFrequency: "weekly", priority: 1 },
    { url: `${siteConfig.url}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ...["", "/options", "/choices", "/compare", "/rank-scan", "/last-ranks", "/seats", "/counselling"].map((p) => ({
      url: `${siteConfig.url}/decide${p}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
