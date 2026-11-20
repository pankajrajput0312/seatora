import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/decide", "/api", "/account", "/login", "/signup", "/r/"] },
    // The site's pages, and every NEET PG college, state and branch page (app/(site)/neet-pg/sitemap.ts).
    sitemap: [`${siteConfig.url}/sitemap.xml`, `${siteConfig.url}/neet-pg/sitemap.xml`],
  };
}
